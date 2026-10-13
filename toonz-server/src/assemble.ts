import fs from "node:fs/promises";
import path from "node:path";
import { OUTPUT_HEIGHT, OUTPUT_WIDTH } from "./config.js";
import { ffmpeg, probeDuration } from "./ffmpeg.js";

export interface SceneClip {
  video: string;
  audio?: string;
  line: string;
}

const AUDIO_LEAD_IN = 0.25; // seconds of silence before a character speaks
const AUDIO_TAIL = 0.45; // breathing room after the line

/**
 * Joins the animated shots into one vertical reel: each shot is held on its last frame until its line
 * has been spoken, then the reel gets a caption bar on top, subtitles at the bottom and a small brand tag.
 */
export async function assembleReel(opts: {
  scenes: SceneClip[];
  caption: string;
  brand: string;
  workDir: string;
  output: string;
}): Promise<void> {
  const { scenes, workDir } = opts;
  const timings: { start: number; end: number; line: string }[] = [];
  const segmentPaths: string[] = [];
  let cursor = 0;

  for (const [i, scene] of scenes.entries()) {
    const videoSeconds = await probeDuration(scene.video);
    const audioSeconds = scene.audio ? await probeDuration(scene.audio) : 0;
    const duration = Math.max(videoSeconds, audioSeconds ? audioSeconds + AUDIO_LEAD_IN + AUDIO_TAIL : 0);
    const holdSeconds = Math.max(duration - videoSeconds, 0) + 0.1;
    const segment = path.join(workDir, `segment-${i}.mp4`);

    const video =
      `[0:v]scale=${OUTPUT_WIDTH}:${OUTPUT_HEIGHT}:force_original_aspect_ratio=increase,` +
      `crop=${OUTPUT_WIDTH}:${OUTPUT_HEIGHT},setsar=1,fps=30,` +
      `tpad=stop_mode=clone:stop_duration=${holdSeconds.toFixed(3)}[v]`;
    const audio = scene.audio
      ? `[1:a]aresample=44100,aformat=channel_layouts=stereo,adelay=delays=${AUDIO_LEAD_IN * 1000}:all=1,apad[a]`
      : `[1:a]aresample=44100,aformat=channel_layouts=stereo[a]`;

    await ffmpeg([
      "-i", scene.video,
      ...(scene.audio ? ["-i", scene.audio] : ["-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo"]),
      "-filter_complex", `${video};${audio}`,
      "-map", "[v]", "-map", "[a]",
      "-t", duration.toFixed(3),
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p",
      "-c:a", "aac", "-b:a", "128k",
      segment,
    ]);

    segmentPaths.push(segment);
    if (scene.line) timings.push({ start: cursor + AUDIO_LEAD_IN, end: cursor + duration, line: scene.line });
    cursor += duration;
  }

  const listFile = path.join(workDir, "segments.txt");
  await fs.writeFile(listFile, segmentPaths.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join("\n"));
  const joined = path.join(workDir, "joined.mp4");
  await ffmpeg(["-f", "concat", "-safe", "0", "-i", listFile, "-c", "copy", joined]);

  const assFile = path.join(workDir, "captions.ass");
  await fs.writeFile(assFile, buildAss(opts.caption, opts.brand, timings, cursor));
  await ffmpeg([
    "-i", joined,
    "-vf", `ass=${escapeFilterPath(assFile)}`,
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "21", "-pix_fmt", "yuv420p",
    "-c:a", "copy", "-movflags", "+faststart",
    opts.output,
  ]);
}

function buildAss(caption: string, brand: string, lines: { start: number; end: number; line: string }[], total: number) {
  const style = (name: string, size: number, primary: string, outline: string, back: string, border: number, outlineWidth: number, align: number, marginV: number) =>
    `Style: ${name},Noto Sans,${size},${primary},&H000000FF,${outline},${back},-1,0,0,0,100,100,0,0,${border},${outlineWidth},0,${align},50,50,${marginV},1`;

  const events = [
    dialogue(0, total, "Caption", caption),
    dialogue(0, total, "Brand", brand),
    ...lines.map((l) => dialogue(l.start, l.end, "Subtitle", l.line)),
  ];

  return [
    "[Script Info]",
    "ScriptType: v4.00+",
    `PlayResX: ${OUTPUT_WIDTH}`,
    `PlayResY: ${OUTPUT_HEIGHT}`,
    "WrapStyle: 0",
    "ScaledBorderAndShadow: yes",
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    // BorderStyle 3 draws an opaque box (in OutlineColour) behind the caption, like reel title bars.
    style("Caption", 40, "&H00FFFFFF", "&H00101010", "&H00101010", 3, 14, 8, 150),
    style("Subtitle", 38, "&H00FFFFFF", "&H00000000", "&H64000000", 1, 3.5, 2, 190),
    style("Brand", 22, "&H50FFFFFF", "&H80000000", "&H00000000", 1, 1.5, 3, 40),
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    ...events,
    "",
  ].join("\n");
}

function dialogue(start: number, end: number, style: string, text: string) {
  return `Dialogue: 0,${assTime(start)},${assTime(end)},${style},,0,0,0,,${assText(text)}`;
}

function assTime(seconds: number) {
  const cs = Math.round(seconds * 100);
  const h = Math.floor(cs / 360000);
  const m = Math.floor((cs % 360000) / 6000);
  const s = Math.floor((cs % 6000) / 100);
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs % 100).padStart(2, "0")}`;
}

function assText(text: string) {
  return text
    .replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, "") // libass can't draw colour emoji
    .replace(/[{}\\]/g, "")
    .replace(/\s*\n\s*/g, "\\N")
    .trim();
}

function escapeFilterPath(p: string) {
  return p.replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "\\'").replace(/,/g, "\\,");
}
