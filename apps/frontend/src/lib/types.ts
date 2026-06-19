export interface CatalogLink {
  rel: string[];
  method: string;
  href: string;
}

export interface CatalogCard {
  id: string;
  title: string;
  type: string;
  description?: string;
  image?: string;
  category: string;
  duration?: string;
  channel_tag?: string;
  channel_number?: string;
  is_live?: boolean;
  manifest_hint?: string;
  stack_id?: string;
  program_id?: string;
  season_id?: string;
  links: CatalogLink[];
}

export interface CatalogRail {
  id: string;
  title: string;
  layout: "hero" | "landscape" | "portrait" | "category";
  items: CatalogCard[];
}

export interface CatalogPageResponse {
  section: string;
  rails: CatalogRail[];
  source?: "catalog" | "live_fallback";
  notice?: string;
}

export interface SeasonVideoCard {
  id: string;
  title: string;
  synopsis?: string;
  duration?: string;
  image?: string;
  manifest_hint?: string;
  content_type: string;
}

export interface SeasonDetailResponse {
  id: string;
  title: string;
  synopsis?: string;
  image?: string;
  channel_name?: string;
  channel_tag?: string;
  genre?: string;
  stack_id: string;
  program_id: string;
  videos: SeasonVideoCard[];
}

export interface CatalogResponse {
  section: string;
  items: CatalogCard[];
  source?: "catalog" | "live_fallback";
  notice?: string;
}

export interface NavigationSection {
  id: string;
  title: string;
  slug: string;
  visible: boolean;
  endpoint?: string;
}

export interface PlaybackConfig {
  manifestUrl: string;
  drm: {
    widevine: {
      licenseUrl: string;
    };
  };
  expiresAt: string;
}

export interface ContentKey {
  kid: string;
  key: string;
}

export interface DecryptionKeysResponse {
  assetId: string;
  drmContentId: string;
  manifestUrl: string;
  pssh: string;
  kid: string;
  licenseUrl: string;
  sessionExpiresAt: string;
  streamingFilter?: string;
  keys: ContentKey[];
  joinedKeys: string;
}

export interface SessionInfo {
  issuer?: string;
  subject?: string;
  token_id?: string;
  account_id?: string;
  issued_at?: string;
  expires_at?: string;
  remaining_seconds: number;
  entitlement: Array<Record<string, unknown>>;
  device_type?: string;
  active: boolean;
  catalog_auth_configured?: boolean;
  profile_id_configured?: boolean;
  waf_token_configured?: boolean;
  irdeto_session_configured?: boolean;
  irdeto_session_remaining_seconds?: number;
  irdeto_session_expires_at?: string;
  connect_token?: string;
  profile_id?: string;
  waf_token?: string;
  catalog_cookie?: string;
  irdeto_session?: string;
  tracked_captured_at?: string;
  tracked_source_url?: string;
  tracked_request_url?: string;
}

export interface ApiError {
  code: string;
  message: string;
  detail?: string;
}

export type DashboardSection = "live" | "shows";

export interface TestVideoCard {
  id: string;
  title: string;
  type: string;
  category: string;
  description?: string;
  duration?: string;
  image?: string;
  channel_tag?: string;
  channel_number?: string;
  manifest_hint?: string;
  playable: boolean;
  metadataStatus: "ok" | "fallback";
}

export interface TestVideosResponse {
  section: string;
  count: number;
  items: TestVideoCard[];
}

export interface ContentItem {
  id: string;
  title: string;
  image?: string;
  category: string;
  duration?: string;
  subtitle?: string;
  contentType: "vod" | "live" | "streaming";
  channelTag?: string;
  manifestHint?: string;
  channelNumber?: string;
  channelLogo?: string;
}

export type UserRole = "user" | "admin";

export interface Account {
  id: number;
  email: string;
  display_name: string;
  role: UserRole;
  created_at: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  user: Account;
}

export interface StreamInfo {
  contentId: string;
  channelTag?: string | null;
  pid: number;
  status: string; // "playing" | "starting"
  hlsUrl: string;
  startedAt: string;
}

export interface AdminChannel {
  contentId: string;
  channelTag?: string | null;
  title?: string | null;
  category: string;
  contentType: string;
  hasManifest: boolean;
  running: boolean;
  pid?: number | null;
  hlsUrl?: string | null;
  startedAt?: string | null;
  directHlsUrl?: string | null;
}

export interface LogChunk {
  content: string;
  offset: number;
  running: boolean;
}

export interface Schedule {
  id: number;
  contentId: string;
  startTime: string; // "HH:MM"
  endTime: string;
  daysOfWeek: string; // "*", "mon-fri", "mon,wed,fri"
  enabled: boolean;
  createdAt: string;
}
