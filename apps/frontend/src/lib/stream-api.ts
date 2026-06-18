import { getStoredToken } from "./auth";
import type { StreamInfo } from "./types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

async function authedPost<T>(path: string, body: unknown, fallback: string): Promise<T> {
  const token = getStoredToken();
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let message = `${fallback} (${res.status})`;
    try {
      const data = await res.json();
      if (data?.detail?.message) message = String(data.detail.message);
      else if (typeof data?.detail === "string") message = data.detail;
    } catch {
      // non-JSON
    }
    throw new Error(message);
  }
  return res.json() as Promise<T>;
}

export interface StartStreamBody {
  contentId: string;
  manifestUrl: string;
  contentType?: string;
  channelTag?: string;
}

export function startStream(body: StartStreamBody): Promise<StreamInfo> {
  return authedPost<StreamInfo>("/api/stream/start", body, "Failed to start stream");
}

export function stopStream(
  contentId: string
): Promise<{ contentId: string; stopped: boolean }> {
  return authedPost("/api/stream/stop", { contentId }, "Failed to stop stream");
}

/** The backend returns a relative /hls/... URL; resolve it against the API host. */
export function resolveHlsUrl(hlsUrl: string): string {
  return /^https?:\/\//.test(hlsUrl) ? hlsUrl : `${API_BASE}${hlsUrl}`;
}
