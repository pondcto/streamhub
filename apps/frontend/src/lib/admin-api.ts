import { getStoredToken } from "./auth";
import type { AdminChannel, LogChunk, ProxyProfile, Schedule } from "./types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

async function authed<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getStoredToken();
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
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

export function listChannels(): Promise<{ channels: AdminChannel[] }> {
  return authed("/api/admin/channels");
}

export function startChannel(contentId: string): Promise<AdminChannel> {
  return authed(`/api/admin/channels/${encodeURIComponent(contentId)}/start`, { method: "POST" });
}

export function stopChannel(
  contentId: string
): Promise<{ contentId: string; stopped: boolean }> {
  return authed(`/api/admin/channels/${encodeURIComponent(contentId)}/stop`, { method: "POST" });
}

export function fetchLogs(contentId: string, offset: number): Promise<LogChunk> {
  return authed(
    `/api/admin/channels/${encodeURIComponent(contentId)}/logs?offset=${offset}`
  );
}

export function downloadLogs(contentId: string): void {
  const token = getStoredToken();
  const params = token ? `?token=${encodeURIComponent(token)}` : "";
  window.open(
    `${API_BASE}/api/admin/channels/${encodeURIComponent(contentId)}/logs/download${params}`,
    "_blank",
  );
}

export interface ScheduleInput {
  contentId: string;
  startTime: string;
  endTime: string;
  daysOfWeek: string;
  enabled: boolean;
}

export function listSchedules(): Promise<Schedule[]> {
  return authed("/api/admin/schedules");
}

export function createSchedule(body: ScheduleInput): Promise<Schedule> {
  return authed("/api/admin/schedules", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function updateSchedule(id: number, body: Partial<ScheduleInput>): Promise<Schedule> {
  return authed(`/api/admin/schedules/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function deleteSchedule(id: number): Promise<{ id: number; deleted: boolean }> {
  return authed(`/api/admin/schedules/${id}`, { method: "DELETE" });
}

// --- Proxy Profiles ------------------------------------------------------

export interface ProxyProfileInput {
  name: string;
  userAgent: string;
  proxyType: string;
  host: string;
  port: number;
  username: string;
  password: string;
}

export function listProxies(): Promise<ProxyProfile[]> {
  return authed("/api/admin/proxies");
}

export function createProxy(body: ProxyProfileInput): Promise<ProxyProfile> {
  return authed("/api/admin/proxies", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function updateProxy(id: number, body: Partial<ProxyProfileInput>): Promise<ProxyProfile> {
  return authed(`/api/admin/proxies/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function deleteProxy(id: number): Promise<{ id: number; deleted: boolean }> {
  return authed(`/api/admin/proxies/${id}`, { method: "DELETE" });
}

export function assignChannelProfile(
  contentId: string,
  profileId: number | null
): Promise<{ contentId: string; profileId: number | null }> {
  return authed(`/api/admin/channels/${encodeURIComponent(contentId)}/profile`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ profileId }),
  });
}

// --- Add Channel ---------------------------------------------------------
// TODO(api): the backend has no channel-registration endpoint yet. The static
// catalog (TEST_VIDEOS + backend test_items) is the source of channels, and a
// channel additionally needs a captured manifest before it can stream. Once
// `POST /api/admin/channels` exists, flip BACKEND_READY in AddChannelSection.

export interface NewChannelInput {
  contentId: string;
  title?: string;
  channelTag?: string;
  channelNumber?: string;
  category?: string;
  manifestHint?: string;
  image?: string;
}

export function createChannel(body: NewChannelInput): Promise<AdminChannel> {
  return authed("/api/admin/channels", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// --- User Management -----------------------------------------------------
// TODO(api): accounts currently expose only login/signup/me. These admin
// endpoints don't exist yet; UserManagementSection keeps actions disabled
// until `GET/POST/PATCH/DELETE /api/admin/users*` are implemented.

export type UserRoleValue = "user" | "admin";

export interface AdminUser {
  id: number;
  email: string;
  display_name: string;
  role: UserRoleValue;
  created_at: string;
  active?: boolean;
}

export interface NewUserInput {
  email: string;
  password: string;
  display_name?: string;
  role: UserRoleValue;
}

export function listUsers(): Promise<{ users: AdminUser[] }> {
  return authed("/api/admin/users");
}

export function createUser(body: NewUserInput): Promise<AdminUser> {
  return authed("/api/admin/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function updateUserRole(id: number, role: UserRoleValue): Promise<AdminUser> {
  return authed(`/api/admin/users/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role }),
  });
}

export function deleteUser(id: number): Promise<{ id: number; deleted: boolean }> {
  return authed(`/api/admin/users/${id}`, { method: "DELETE" });
}
