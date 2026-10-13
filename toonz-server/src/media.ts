import fs from "node:fs";
import { fal } from "@fal-ai/client";
import { config, OUTPUT_HEIGHT, OUTPUT_WIDTH } from "./config.js";
import { ffmpeg } from "./ffmpeg.js";

// Every generator returns a local file. `url` is the hosted copy that later fal steps can reference
// (absent in mock mode, where nothing leaves the server).
export interface MediaFile {
  path: string;
  url?: string;
}

if (!config.mock) fal.config({ credentials: config.falKey });

// The model ids come from config so they can be swapped without a code change. The casts pick
// the typed signature of the default model; replacement models must accept the same input fields.
type ImageModel = "fal-ai/nano-banana-2";
type ImageEditModel = "fal-ai/nano-banana-2/edit";
type VideoModel = "fal-ai/kling-video/v2.5-turbo/standard/image-to-video";
type TtsModel = "fal-ai/elevenlabs/tts/eleven-v3";

async function download(url: string, dest: string): Promise<MediaFile> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed (${res.status}) for ${url}`);
  await fs.promises.writeFile(dest, Buffer.from(await res.arrayBuffer()));
  return { path: dest, url };
}

export async function generateImage(prompt: string, aspectRatio: "16:9" | "9:16", dest: string): Promise<MediaFile> {
  if (config.mock) return mockImage(dest, aspectRatio);
  const { data } = await fal.subscribe(config.imageModel as ImageModel, {
    input: { prompt, aspect_ratio: aspectRatio, num_images: 1, output_format: "png", limit_generations: true },
  });
  const image = data.images[0];
  if (!image) throw new Error("The image model returned no image");
  return download(image.url, dest);
}

export async function editImage(prompt: string, references: MediaFile[], dest: string): Promise<MediaFile> {
  if (config.mock) return mockImage(dest, "9:16");
  const imageUrls = references.map((r) => r.url).filter((u): u is string => Boolean(u));
  const { data } = await fal.subscribe(config.imageEditModel as ImageEditModel, {
    input: { prompt, image_urls: imageUrls, aspect_ratio: "9:16", num_images: 1, output_format: "png", limit_generations: true },
  });
  const image = data.images[0];
  if (!image) throw new Error("The image model returned no image");
  return download(image.url, dest);
}

export async function animateImage(image: MediaFile, prompt: string, dest: string): Promise<MediaFile> {
  if (config.mock) return mockVideo(image.path, dest);
  if (!image.url) throw new Error("Scene image has no hosted URL");
  const { data } = await fal.subscribe(config.videoModel as VideoModel, {
    input: {
      image_url: image.url,
      prompt,
      duration: config.videoDuration as "5" | "10",
      negative_prompt: "blur, distort, low quality, realistic, photo, 3d render, extra limbs, text, watermark",
    },
  });
  return download(data.video.url, dest);
}

export async function speak(text: string, voice: string, languageCode: string, dest: string): Promise<MediaFile> {
  if (config.mock) return mockSpeech(text, dest);
  const { data } = await fal.subscribe(config.ttsModel as TtsModel, {
    input: { text, voice, language_code: languageCode, stability: 0.5 },
  });
  return download(data.audio.url, dest);
}

// ---- Mock generators: cheap local placeholders so the full pipeline can run without API keys ----

const MOCK_COLORS = ["0x7cc8a0", "0xf4b6c2", "0x8fb8de", "0xf6d186", "0xb39ddb"];
let mockCounter = 0;

async function mockImage(dest: string, aspectRatio: "16:9" | "9:16"): Promise<MediaFile> {
  const size = aspectRatio === "9:16" ? `${OUTPUT_WIDTH}x${OUTPUT_HEIGHT}` : `${OUTPUT_HEIGHT}x${OUTPUT_WIDTH}`;
  const color = MOCK_COLORS[mockCounter++ % MOCK_COLORS.length];
  await ffmpeg(["-f", "lavfi", "-i", `color=c=${color}:s=${size}`, "-frames:v", "1", dest]);
  return { path: dest };
}

async function mockVideo(imagePath: string, dest: string): Promise<MediaFile> {
  const seconds = Number.parseInt(config.videoDuration, 10) || 5;
  await ffmpeg([
    "-loop", "1", "-i", imagePath,
    "-f", "lavfi", "-i", `testsrc2=s=240x240:r=24`,
    "-filter_complex", `[0:v]scale=${OUTPUT_WIDTH}:${OUTPUT_HEIGHT}[bg];[bg][1:v]overlay=x='(W-w)/2+120*sin(t*2)':y=(H-h)/2[v]`,
    "-map", "[v]", "-t", String(seconds), "-r", "24", "-pix_fmt", "yuv420p", "-c:v", "libx264", "-preset", "ultrafast", dest,
  ]);
  return { path: dest };
}

async function mockSpeech(text: string, dest: string): Promise<MediaFile> {
  const seconds = Math.min(1 + text.split(/\s+/).length * 0.35, 8).toFixed(2);
  await ffmpeg(["-f", "lavfi", "-i", `sine=frequency=440:duration=${seconds}`, "-af", "volume=0.15", "-c:a", "libmp3lame", dest]);
  return { path: dest };
}
