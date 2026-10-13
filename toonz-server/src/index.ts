import fs from "node:fs";
import rateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import * as z from "zod/v4";
import { config } from "./config.js";
import {
  createDevice,
  createVideo,
  deleteDevice,
  findDeviceByToken,
  getDevice,
  getVideo,
  listUnfinishedVideos,
  listVideos,
  markReported,
  recordPurchase,
  spendCredit,
  type DeviceRow,
  type VideoRow,
} from "./db.js";
import { findLanguage, LANGUAGES } from "./languages.js";
import { privacyPolicyHtml, termsHtml } from "./legal.js";
import { enqueue, recoverInterruptedJobs, videoFilePath, videosDir } from "./pipeline.js";

const app = Fastify({ logger: true, trustProxy: true });

fs.mkdirSync(videosDir, { recursive: true });
await app.register(rateLimit, { max: 120, timeWindow: "1 minute" });
// Finished reels are served by their unguessable id; @fastify/static handles the Range requests video players need.
await app.register(fastifyStatic, { root: videosDir, prefix: "/media/", decorateReply: false, index: false });

function authenticate(request: FastifyRequest, reply: FastifyReply): DeviceRow | undefined {
  const token = request.headers.authorization?.replace(/^Bearer\s+/i, "");
  const device = token ? findDeviceByToken(token) : undefined;
  if (!device) reply.code(401).send({ error: "Not signed in" });
  return device;
}

function serializeVideo(v: VideoRow) {
  return {
    id: v.id,
    prompt: v.prompt,
    language: v.language,
    status: v.status,
    step: v.step,
    progress: v.progress,
    title: v.title,
    error: v.error,
    createdAt: v.created_at,
    videoUrl: v.status === "done" ? `${config.publicBaseUrl}/media/${v.id}.mp4` : null,
  };
}

app.get("/health", async () => ({ ok: true, mock: config.mock }));

app.get("/privacy", async (_request, reply) => reply.type("text/html").send(privacyPolicyHtml()));
app.get("/terms", async (_request, reply) => reply.type("text/html").send(termsHtml()));

app.get("/v1/languages", async () => ({ languages: LANGUAGES }));

app.post("/v1/devices", { config: { rateLimit: { max: 5, timeWindow: "1 hour" } } }, async () => {
  const { device, token } = createDevice();
  return { token, credits: device.credits };
});

app.get("/v1/me", async (request, reply) => {
  const device = authenticate(request, reply);
  if (!device) return reply;
  return { id: device.id, credits: device.credits, creditProducts: Object.fromEntries(config.creditProducts) };
});

app.delete("/v1/me", async (request, reply) => {
  const device = authenticate(request, reply);
  if (!device) return reply;
  for (const id of deleteDevice(device.id)) fs.rmSync(videoFilePath(id), { force: true });
  return { ok: true };
});

const CreateVideoBody = z.object({
  prompt: z.string().trim().min(5).max(500),
  language: z.string(),
});

app.post("/v1/videos", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (request, reply) => {
  const device = authenticate(request, reply);
  if (!device) return reply;
  const body = CreateVideoBody.safeParse(request.body);
  if (!body.success) return reply.code(400).send({ error: "Describe your video in 5 to 500 characters." });
  if (!findLanguage(body.data.language)) return reply.code(400).send({ error: "Unsupported language" });
  if (!spendCredit(device.id)) return reply.code(402).send({ error: "You're out of credits." });

  const video = createVideo(device.id, body.data.prompt, body.data.language);
  enqueue(video.id);
  return reply.code(201).send({ video: serializeVideo(video), credits: getDevice(device.id)?.credits ?? 0 });
});

app.get("/v1/videos", async (request, reply) => {
  const device = authenticate(request, reply);
  if (!device) return reply;
  return { videos: listVideos(device.id).map(serializeVideo) };
});

app.get<{ Params: { id: string } }>("/v1/videos/:id", async (request, reply) => {
  const device = authenticate(request, reply);
  if (!device) return reply;
  const video = getVideo(request.params.id);
  if (!video || video.device_id !== device.id) return reply.code(404).send({ error: "Video not found" });
  return { video: serializeVideo(video) };
});

app.post<{ Params: { id: string }; Body: { reason?: string } }>("/v1/videos/:id/report", async (request, reply) => {
  const device = authenticate(request, reply);
  if (!device) return reply;
  const video = getVideo(request.params.id);
  if (!video) return reply.code(404).send({ error: "Video not found" });
  markReported(video.id);
  request.log.warn({ videoId: video.id, reason: request.body?.reason }, "video reported");
  return { ok: true };
});

// RevenueCat calls this after every store purchase. The app logs in to RevenueCat with the device id,
// so `app_user_id` tells us whose balance to top up. See README for the dashboard setup.
const RevenueCatEvent = z.object({
  event: z.object({
    id: z.string(),
    type: z.string(),
    app_user_id: z.string(),
    product_id: z.string().optional(),
  }),
});

app.post("/webhooks/revenuecat", async (request, reply) => {
  if (!config.revenueCatWebhookAuth || request.headers.authorization !== config.revenueCatWebhookAuth) {
    return reply.code(401).send({ error: "unauthorized" });
  }
  const parsed = RevenueCatEvent.safeParse(request.body);
  if (!parsed.success) return reply.code(400).send({ error: "bad payload" });
  const { id, type, app_user_id, product_id } = parsed.data.event;

  if (type === "NON_RENEWING_PURCHASE" || type === "INITIAL_PURCHASE") {
    const credits = product_id ? config.creditProducts.get(product_id) : undefined;
    if (!credits) {
      request.log.warn({ product_id }, "purchase for unknown product");
    } else if (!getDevice(app_user_id)) {
      request.log.warn({ app_user_id }, "purchase for unknown device");
    } else if (recordPurchase(id, app_user_id, product_id!, credits)) {
      request.log.info({ app_user_id, credits }, "credits granted");
    }
  }
  return { ok: true };
});

// Remove files for videos that no longer exist in the database (e.g. after a manual cleanup).
app.addHook("onReady", async () => {
  recoverInterruptedJobs(listUnfinishedVideos());
  for (const file of fs.readdirSync(videosDir)) {
    const id = file.replace(/\.mp4$/, "");
    if (!getVideo(id)) fs.rmSync(videoFilePath(id), { force: true });
  }
});

app.log.info({ mock: config.mock, claude: config.anthropicConfigured }, "starting Toonz server");
await app.listen({ port: config.port, host: "0.0.0.0" });
