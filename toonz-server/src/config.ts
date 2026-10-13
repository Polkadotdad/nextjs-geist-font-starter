import path from "node:path";

function env(name: string, fallback = ""): string {
  const value = process.env[name];
  return value === undefined || value === "" ? fallback : value;
}

function intEnv(name: string, fallback: number): number {
  const parsed = Number.parseInt(env(name), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseProducts(raw: string): Map<string, number> {
  const products = new Map<string, number>();
  for (const pair of raw.split(",")) {
    const [id, credits] = pair.split("=").map((s) => s.trim());
    const amount = Number.parseInt(credits ?? "", 10);
    if (id && Number.isFinite(amount) && amount > 0) products.set(id, amount);
  }
  return products;
}

const falKey = env("FAL_KEY");

export const config = {
  port: intEnv("PORT", 8080),
  publicBaseUrl: env("PUBLIC_BASE_URL", "http://localhost:8080").replace(/\/$/, ""),
  dataDir: path.resolve(env("DATA_DIR", "./data")),

  falKey,
  anthropicConfigured: env("ANTHROPIC_API_KEY") !== "" || env("ANTHROPIC_AUTH_TOKEN") !== "",
  // Without a fal key we can't make real media, so the whole pipeline runs on local placeholders.
  mock: env("MOCK") === "1" || falKey === "",

  freeCredits: intEnv("FREE_CREDITS", 1),
  revenueCatWebhookAuth: env("REVENUECAT_WEBHOOK_AUTH"),
  creditProducts: parseProducts(env("CREDIT_PRODUCTS", "toonz_credits_5=5,toonz_credits_20=20")),

  sceneCount: Math.min(Math.max(intEnv("SCENE_COUNT", 3), 1), 6),
  maxConcurrentJobs: Math.max(intEnv("MAX_CONCURRENT_JOBS", 2), 1),
  imageModel: env("FAL_IMAGE_MODEL", "fal-ai/nano-banana-2"),
  imageEditModel: env("FAL_IMAGE_EDIT_MODEL", "fal-ai/nano-banana-2/edit"),
  videoModel: env("FAL_VIDEO_MODEL", "fal-ai/kling-video/v2.5-turbo/standard/image-to-video"),
  videoDuration: env("VIDEO_DURATION", "5"),
  ttsModel: env("FAL_TTS_MODEL", "fal-ai/elevenlabs/tts/eleven-v3"),
  claudeModel: env("CLAUDE_MODEL", "claude-opus-5-5"),
};

export const OUTPUT_WIDTH = 720;
export const OUTPUT_HEIGHT = 1280;
