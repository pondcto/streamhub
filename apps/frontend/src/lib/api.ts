import type {
  ApiError,
  DecryptionKeysResponse,
  PlaybackConfig,
  TestVideoCard,
  TestVideosResponse,
} from "./types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });

  if (!res.ok) {
    let error: ApiError = {
      code: "REQUEST_FAILED",
      message: `Request failed with status ${res.status}`,
    };
    try {
      const body = await res.json();
      if (body.detail) {
        error = typeof body.detail === "string"
          ? { code: "ERROR", message: body.detail }
          : body.detail;
      } else if (body.code) {
        error = body;
      }
    } catch {
      // ignore parse errors
    }
    throw error;
  }

  return res.json() as Promise<T>;
}

export async function getTestVideos(): Promise<TestVideosResponse> {
  return request<TestVideosResponse>("/api/test/videos", { cache: "no-store" });
}

export interface PlaybackPayload {
  contentType: "vod" | "live" | "streaming";
  channelTag?: string;
  manifestHint?: string;
}

export interface DecryptionKeysPayload {
  contentId: string;
  manifestUrl: string;
  contentType: "vod" | "live" | "streaming";
  channelTag?: string;
}

export async function getDecryptionKeys(
  payload: DecryptionKeysPayload
): Promise<DecryptionKeysResponse> {
  return request<DecryptionKeysResponse>("/api/decryption/keys", {
    method: "POST",
    body: JSON.stringify({
      contentId: payload.contentId,
      manifestUrl: payload.manifestUrl,
      contentType: payload.contentType,
      channelTag: payload.channelTag,
    }),
  });
}

export async function generateTestItemKeys(itemId: string): Promise<DecryptionKeysResponse> {
  return request<DecryptionKeysResponse>(
    `/api/test/videos/${encodeURIComponent(itemId)}/keys`,
    { method: "POST" }
  );
}

export async function getPlayback(
  contentId: string,
  payload: PlaybackPayload
): Promise<PlaybackConfig> {
  return request(`/api/playback/${encodeURIComponent(contentId)}`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function testVideoToContentItem(card: TestVideoCard): import("./types").ContentItem {
  const normalizedType = card.type.toLowerCase();
  const contentType: "vod" | "live" | "streaming" =
    normalizedType.includes("live")
      ? "live"
      : normalizedType.includes("stream")
        ? "streaming"
        : "vod";

  return {
    id: card.id,
    title: card.title,
    image: card.image,
    category: card.category,
    duration: card.duration,
    subtitle: card.description,
    contentType,
    channelTag: card.channel_tag,
    manifestHint: card.manifest_hint,
  };
}
