import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { config } from "./config.js";

fs.mkdirSync(config.dataDir, { recursive: true });
const db = new DatabaseSync(path.join(config.dataDir, "toonz.db"));

db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS devices (
    id TEXT PRIMARY KEY,
    token_hash TEXT NOT NULL UNIQUE,
    credits INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS videos (
    id TEXT PRIMARY KEY,
    device_id TEXT NOT NULL REFERENCES devices(id),
    prompt TEXT NOT NULL,
    language TEXT NOT NULL,
    status TEXT NOT NULL,          -- queued | running | done | failed
    step TEXT NOT NULL,
    progress REAL NOT NULL,
    title TEXT,
    error TEXT,
    script_json TEXT,
    reported INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS videos_by_device ON videos(device_id, created_at DESC);
  CREATE TABLE IF NOT EXISTS purchases (
    event_id TEXT PRIMARY KEY,
    device_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    credits INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  );
`);

export type VideoStatus = "queued" | "running" | "done" | "failed";

export interface DeviceRow {
  id: string;
  credits: number;
}

export interface VideoRow {
  id: string;
  device_id: string;
  prompt: string;
  language: string;
  status: VideoStatus;
  step: string;
  progress: number;
  title: string | null;
  error: string | null;
  created_at: number;
  updated_at: number;
}

const hashToken = (token: string) => crypto.createHash("sha256").update(token).digest("hex");

export function createDevice(): { device: DeviceRow; token: string } {
  const id = crypto.randomUUID();
  const token = crypto.randomBytes(32).toString("base64url");
  db.prepare("INSERT INTO devices (id, token_hash, credits, created_at) VALUES (?, ?, ?, ?)").run(
    id,
    hashToken(token),
    config.freeCredits,
    Date.now(),
  );
  return { device: { id, credits: config.freeCredits }, token };
}

export function findDeviceByToken(token: string): DeviceRow | undefined {
  return db.prepare("SELECT id, credits FROM devices WHERE token_hash = ?").get(hashToken(token)) as
    | DeviceRow
    | undefined;
}

export function getDevice(id: string): DeviceRow | undefined {
  return db.prepare("SELECT id, credits FROM devices WHERE id = ?").get(id) as DeviceRow | undefined;
}

/** Atomically takes one credit. Returns false when the device has none left. */
export function spendCredit(deviceId: string): boolean {
  const result = db.prepare("UPDATE devices SET credits = credits - 1 WHERE id = ? AND credits > 0").run(deviceId);
  return Number(result.changes) === 1;
}

export function addCredits(deviceId: string, amount: number) {
  db.prepare("UPDATE devices SET credits = credits + ? WHERE id = ?").run(amount, deviceId);
}

/** Records a store purchase once; returns false if this event was already processed. */
export function recordPurchase(eventId: string, deviceId: string, productId: string, credits: number): boolean {
  const result = db
    .prepare("INSERT OR IGNORE INTO purchases (event_id, device_id, product_id, credits, created_at) VALUES (?, ?, ?, ?, ?)")
    .run(eventId, deviceId, productId, credits, Date.now());
  if (Number(result.changes) !== 1) return false;
  addCredits(deviceId, credits);
  return true;
}

export function createVideo(deviceId: string, prompt: string, language: string): VideoRow {
  const now = Date.now();
  const row: VideoRow = {
    id: crypto.randomUUID(),
    device_id: deviceId,
    prompt,
    language,
    status: "queued",
    step: "Waiting in line",
    progress: 0,
    title: null,
    error: null,
    created_at: now,
    updated_at: now,
  };
  db.prepare(
    `INSERT INTO videos (id, device_id, prompt, language, status, step, progress, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(row.id, deviceId, prompt, language, row.status, row.step, row.progress, now, now);
  return row;
}

export function updateVideo(
  id: string,
  fields: Partial<Pick<VideoRow, "status" | "step" | "progress" | "title" | "error">> & { script_json?: string },
) {
  const entries = Object.entries(fields).filter(([, v]) => v !== undefined);
  if (entries.length === 0) return;
  const sets = entries.map(([k]) => `${k} = ?`).join(", ");
  db.prepare(`UPDATE videos SET ${sets}, updated_at = ? WHERE id = ?`).run(
    ...entries.map(([, v]) => v as string | number | null),
    Date.now(),
    id,
  );
}

const VIDEO_COLUMNS = "id, device_id, prompt, language, status, step, progress, title, error, created_at, updated_at";

export function getVideo(id: string): VideoRow | undefined {
  return db.prepare(`SELECT ${VIDEO_COLUMNS} FROM videos WHERE id = ?`).get(id) as VideoRow | undefined;
}

export function listVideos(deviceId: string, limit = 50): VideoRow[] {
  return db
    .prepare(`SELECT ${VIDEO_COLUMNS} FROM videos WHERE device_id = ? ORDER BY created_at DESC LIMIT ?`)
    .all(deviceId, limit) as unknown as VideoRow[];
}

export function markReported(id: string) {
  db.prepare("UPDATE videos SET reported = 1 WHERE id = ?").run(id);
}

/** Jobs that were mid-flight when the server stopped. */
export function listUnfinishedVideos(): VideoRow[] {
  return db
    .prepare(`SELECT ${VIDEO_COLUMNS} FROM videos WHERE status IN ('queued', 'running')`)
    .all() as unknown as VideoRow[];
}
