import { getStoredToken } from "./auth";
import type { AdminChannel, LogChunk, Schedule } from "./types";

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
