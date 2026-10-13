import fs from "node:fs/promises";
import path from "node:path";
import { assembleReel } from "./assemble.js";
import { config } from "./config.js";
import { addCredits, getVideo, updateVideo, type VideoRow } from "./db.js";
import { findLanguage } from "./languages.js";
import { animateImage, editImage, generateImage, speak, type MediaFile } from "./media.js";
import { writeScript } from "./script.js";

const ART_STYLE =
  "Flat 2D cartoon in the style of modern Instagram comedy animation: thick clean dark outlines, bold flat colours, " +
  "simple cel shading, big expressive eyes, exaggerated comic facial expressions, simple painted backgrounds. " +
  "No text, no speech bubbles, no watermark.";

export const videosDir = path.join(config.dataDir, "videos");
const workRoot = path.join(config.dataDir, "work");

export function videoFilePath(id: string) {
  return path.join(videosDir, `${id}.mp4`);
}

/** Thrown for problems the user caused (e.g. a disallowed prompt); the message is shown as-is. */
class UserFacingError extends Error {}

// ---- A tiny in-process job queue. Jobs are persisted in SQLite, so a restart can refund them. ----

const queue: string[] = [];
let active = 0;

export function enqueue(videoId: string) {
  queue.push(videoId);
  pump();
}

function pump() {
  while (active < config.maxConcurrentJobs && queue.length > 0) {
    const id = queue.shift()!;
    active++;
    runJob(id).finally(() => {
      active--;
      pump();
    });
  }
}

/** On startup: anything left queued/running was interrupted by a restart. Fail it and give the credit back. */
export function recoverInterruptedJobs(videos: VideoRow[]) {
  for (const video of videos) {
    updateVideo(video.id, { status: "failed", step: "Interrupted", error: "The server restarted. Your credit was refunded." });
    addCredits(video.device_id, 1);
  }
}

async function runJob(id: string) {
  const video = getVideo(id);
  if (!video) return;
  const workDir = path.join(workRoot, id);
  await fs.mkdir(workDir, { recursive: true });
  await fs.mkdir(videosDir, { recursive: true });

  const progress = (step: string, value: number) => updateVideo(id, { status: "running", step, progress: value });

  try {
    const language = findLanguage(video.language);
    if (!language) throw new UserFacingError("Unsupported language");

    progress("Writing the story", 0.03);
    const script = await writeScript(video.prompt, language.name, config.sceneCount);
    if (!script.allowed) throw new UserFacingError(script.rejectionReason || "This idea can't be made into a video.");
    updateVideo(id, { title: script.title, script_json: JSON.stringify(script) });

    progress("Designing the characters", 0.1);
    const cast = script.characters.map((c) => `${c.id}: ${c.look}`).join("\n");
    const sheet = await generateImage(
      `${ART_STYLE}\nCharacter reference sheet on a plain white background. Each character shown once, full body, front view, ` +
        `standing side by side, clearly separated:\n${cast}`,
      "16:9",
      path.join(workDir, "characters.png"),
    );

    progress("Drawing the scenes", 0.2);
    const castById = new Map(script.characters.map((c) => [c.id, c]));
    const frames = await Promise.all(
      script.scenes.map((scene, i) =>
        editImage(
          `${ART_STYLE}\nUse the characters from the reference image exactly as drawn (same faces, hair, clothes, colours). ` +
            `Vertical 9:16 frame. Setting: ${script.setting}.\nShot: ${scene.visual}`,
          [sheet],
          path.join(workDir, `frame-${i}.png`),
        ),
      ),
    );

    progress("Animating", 0.35);
    let animated = 0;
    const clips = await mapLimit(frames, 2, async (frame, i) => {
      const clip = await animateImage(
        frame,
        `${script.scenes[i]!.motion}. 2D cartoon animation, keep the flat cartoon art style, smooth motion, static camera.`,
        path.join(workDir, `clip-${i}.mp4`),
      );
      animated++;
      progress("Animating", 0.35 + 0.45 * (animated / frames.length));
      return clip;
    });

    progress("Recording voices", 0.82);
    const voices = await Promise.all(
      script.scenes.map(async (scene, i): Promise<MediaFile | undefined> => {
        const speaker = castById.get(scene.speakerId);
        if (!scene.line.trim() || !speaker) return undefined;
        return speak(scene.line, speaker.voice, language.code, path.join(workDir, `voice-${i}.mp3`));
      }),
    );

    progress("Putting it together", 0.92);
    await assembleReel({
      scenes: script.scenes.map((scene, i) => ({ video: clips[i]!.path, audio: voices[i]?.path, line: scene.line })),
      caption: script.caption,
      brand: "Toonz Video",
      workDir,
      output: videoFilePath(id),
    });

    updateVideo(id, { status: "done", step: "Ready", progress: 1 });
  } catch (err) {
    const userFacing = err instanceof UserFacingError;
    console.error(`[video ${id}] failed:`, err);
    updateVideo(id, {
      status: "failed",
      step: "Failed",
      error: userFacing ? err.message : "Something went wrong while making your video. Your credit was refunded.",
    });
    addCredits(video.device_id, 1);
  } finally {
    await fs.rm(workDir, { recursive: true, force: true });
  }
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]!, index);
    }
  });
  await Promise.all(workers);
  return results;
}
