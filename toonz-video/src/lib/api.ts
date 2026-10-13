import * as SecureStore from "expo-secure-store";

// Set EXPO_PUBLIC_API_URL in .env (local) or in eas.json (store builds).
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:8080").replace(/\/$/, "");

const TOKEN_KEY = "toonz.deviceToken";

export type VideoStatus = "queued" | "running" | "done" | "failed";

export interface Video {
  id: string;
  prompt: string;
  language: string;
  status: VideoStatus;
  step: string;
  progress: number;
  title: string | null;
  error: string | null;
  createdAt: number;
  videoUrl: string | null;
}

export interface Me {
  id: string;
  credits: number;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

let tokenPromise: Promise<string> | null = null;

/** Returns this install's account token, creating an anonymous account on first launch. */
function getToken(): Promise<string> {
  tokenPromise ??= (async () => {
    const saved = await SecureStore.getItemAsync(TOKEN_KEY);
    if (saved) return saved;
    const { token } = await request<{ token: string }>("/v1/devices", { method: "POST" }, false);
    await SecureStore.setItemAsync(TOKEN_KEY, token);
    return token;
  })().catch((err) => {
    tokenPromise = null;
    throw err;
  });
  return tokenPromise;
}

async function request<T>(path: string, init: RequestInit = {}, auth = true): Promise<T> {
  const headers: Record<string, string> = { ...(init.headers as Record<string, string>) };
  if (init.body) headers["Content-Type"] = "application/json";
  if (auth) headers.Authorization = `Bearer ${await getToken()}`;

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, { ...init, headers });
  } catch {
    throw new ApiError("Can't reach Toonz right now. Check your internet connection.", 0);
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(body.error ?? `Request failed (${res.status})`, res.status);
  return body as T;
}

export const api = {
  me: () => request<Me>("/v1/me"),
  listVideos: () => request<{ videos: Video[] }>("/v1/videos").then((r) => r.videos),
  getVideo: (id: string) => request<{ video: Video }>(`/v1/videos/${id}`).then((r) => r.video),
  createVideo: (prompt: string, language: string) =>
    request<{ video: Video; credits: number }>("/v1/videos", {
      method: "POST",
      body: JSON.stringify({ prompt, language }),
    }),
  /** Deletes this install's account, prompts and videos on the server; a fresh account is created on next use. */
  deleteMyData: async () => {
    await request<{ ok: true }>("/v1/me", { method: "DELETE" });
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    tokenPromise = null;
  },
  reportVideo: (id: string, reason: string) =>
    request<{ ok: true }>(`/v1/videos/${id}/report`, { method: "POST", body: JSON.stringify({ reason }) }),
};
