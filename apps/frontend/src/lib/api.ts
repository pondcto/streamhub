import type {
  ApiError,
  CatalogCard,
  CatalogPageResponse,
  CatalogResponse,
  DashboardSection,
  LiveChannel,
  NavigationSection,
  DecryptionKeysResponse,
  PlaybackConfig,
  SeasonDetailResponse,
  SessionInfo,
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

export async function getSession(): Promise<SessionInfo | null> {
  try {
    return await request<SessionInfo>("/api/auth/session");
  } catch (err) {
    const error = err as ApiError;
    if (error.code === "NO_SESSION") return null;
    throw err;
  }
}

export interface SessionOptions {
  catalogToken?: string;
  catalogCookie?: string;
  profileId?: string;
  wafToken?: string;
  irdetoSession?: string;
}

export async function setSession(
  token: string | undefined,
  options?: SessionOptions
): Promise<SessionInfo> {
  return request<SessionInfo>("/api/auth/session", {
    method: "POST",
    body: JSON.stringify({
      ...(token ? { token } : {}),
      catalog_token: options?.catalogToken,
      catalog_cookie: options?.catalogCookie,
      profile_id: options?.profileId,
      waf_token: options?.wafToken,
      irdeto_session: options?.irdetoSession,
    }),
  });
}

export function extractWafTokenFromCookie(cookie: string): string | undefined {
  const match = cookie.match(/(?:^|;\s*)aws-waf-token=([^;]+)/);
  return match?.[1]?.trim() || undefined;
}

export async function getNavigation(): Promise<{ sections: NavigationSection[] }> {
  return request("/api/navigation");
}

export async function getCatalog(
  section: Exclude<DashboardSection, "live" | "test">
): Promise<CatalogResponse> {
  return request(`/api/catalog/${section}`);
}

export async function getSportPage(): Promise<CatalogPageResponse> {
  return request<CatalogPageResponse>("/api/catalog/sport/page", { cache: "no-store" });
}

export async function getSeasonDetail(
  stackId: string,
  programId: string,
  seasonId: string
): Promise<SeasonDetailResponse> {
  return request<SeasonDetailResponse>(
    `/api/catalog/season/${encodeURIComponent(stackId)}/${encodeURIComponent(programId)}/${encodeURIComponent(seasonId)}`,
    { cache: "no-store" }
  );
}

export async function getTestVideos(): Promise<TestVideosResponse> {
  return request<TestVideosResponse>("/api/test/videos", { cache: "no-store" });
}

export async function getLiveChannels(): Promise<{ items: LiveChannel[] }> {
  return request("/api/live/channels");
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

function manifestHintFromLinks(links: CatalogCard["links"]): string | undefined {
  for (const link of links) {
    const href = link.href?.trim();
    if (href && (href.includes(".mpd") || href.includes(".ism/"))) {
      return href;
    }
  }
  return undefined;
}

function resolveContentType(card: CatalogCard): "vod" | "live" | "streaming" {
  const normalized = card.type.toLowerCase();
  if (normalized.includes("live")) return "live";
  if (normalized.includes("stream")) return "streaming";
  if (card.category.toLowerCase() === "sport") return "streaming";
  return "vod";
}

export function catalogToContentItem(card: CatalogCard): import("./types").ContentItem {
  const contentType = resolveContentType(card);
  return {
    id: card.id,
    title: card.title,
    image: card.image,
    category: card.category,
    duration: card.duration,
    subtitle: card.description,
    contentType,
    channelTag: contentType === "live" ? card.channel_tag ?? card.id : undefined,
    manifestHint: card.manifest_hint ?? manifestHintFromLinks(card.links),
  };
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

export function liveToContentItem(channel: LiveChannel): import("./types").ContentItem {
  return {
    id: channel.id,
    title: channel.title,
    image: channel.image,
    category: channel.category ?? "Live TV",
    duration: channel.duration ?? channel.currentEvent,
    subtitle: channel.currentEvent,
    contentType: "live",
    channelTag: channel.channelTag,
    manifestHint: channel.manifestHint,
  };
}
