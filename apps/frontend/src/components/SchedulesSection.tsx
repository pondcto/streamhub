"use client";

import { useCallback, useEffect, useState } from "react";

import { createSchedule, deleteSchedule, listSchedules, updateSchedule } from "@/lib/admin-api";
import type { AdminChannel, Schedule } from "@/lib/types";

const DAYS: [string, string][] = [
  ["mon", "Mon"],
  ["tue", "Tue"],
  ["wed", "Wed"],
  ["thu", "Thu"],
  ["fri", "Fri"],
  ["sat", "Sat"],
  ["sun", "Sun"],
];

function daysToString(set: Set<string>): string {
  if (set.size === 0 || set.size === 7) return "*";
  return DAYS.filter(([k]) => set.has(k)).map(([k]) => k).join(",");
}

function formatDays(value: string): string {
  return !value || value === "*" ? "Every day" : value;
}

export default function SchedulesSection({ channels }: { channels: AdminChannel[] }) {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [contentId, setContentId] = useState("");
  const [startTime, setStartTime] = useState("18:00");
  const [endTime, setEndTime] = useState("23:00");
  const [days, setDays] = useState<Set<string>>(new Set(DAYS.map(([k]) => k)));

  const refresh = useCallback(async () => {
    try {
      setSchedules(await listSchedules());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load schedules.");
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!contentId && channels.length) setContentId(channels[0].contentId);
  }, [channels, contentId]);

  function toggleDay(key: string) {
    setDays((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function handleAdd(event: React.FormEvent) {
    event.preventDefault();
    if (!contentId) return;
    setBusy(true);
    setError(null);
    try {
      await createSchedule({
        contentId,
        startTime,
        endTime,
        daysOfWeek: daysToString(days),
        enabled: true,
      });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add schedule.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(id: number) {
    setError(null);
    try {
      await deleteSchedule(id);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete schedule.");
    }
  }

  async function handleToggle(schedule: Schedule) {
    setError(null);
    try {
      await updateSchedule(schedule.id, { enabled: !schedule.enabled });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update schedule.");
    }
  }

  const labelFor = (cid: string) => {
    const ch = channels.find((c) => c.contentId === cid);
    return ch?.channelTag || cid;
  };

  return (
    <div className="mt-8">
      <h2 className="mb-1 text-lg font-semibold text-white">Schedules</h2>
      <p className="mb-3 text-sm text-gray-400">
        Channels auto-start and stop at these times (server timezone). A capture must exist when a
        start fires.
      </p>

      {error && (
        <div className="mb-4 rounded-lg border border-red-500/30 bg-red-950/30 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}

      <form
        onSubmit={handleAdd}
        className="mb-4 grid grid-cols-1 gap-4 rounded-xl border border-white/10 bg-surface-raised p-4 sm:grid-cols-2 lg:grid-cols-5"
      >
        <label className="block">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-400">Channel</span>
          <select
            value={contentId}
            onChange={(e) => setContentId(e.target.value)}
            className="w-full rounded-lg border border-white/10 bg-surface px-3 py-2 text-sm text-white focus:border-accent/40 focus:outline-none"
          >
            {channels.map((c) => (
              <option key={c.contentId} value={c.contentId}>
                {c.channelTag || c.contentId}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-400">Start</span>
          <input
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            className="w-full rounded-lg border border-white/10 bg-surface px-3 py-2 text-sm text-white focus:border-accent/40 focus:outline-none"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-400">End</span>
          <input
            type="time"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            className="w-full rounded-lg border border-white/10 bg-surface px-3 py-2 text-sm text-white focus:border-accent/40 focus:outline-none"
          />
        </label>

        <div className="block lg:col-span-1">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-400">Days</span>
          <div className="flex flex-wrap gap-1">
            {DAYS.map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => toggleDay(key)}
                className={`rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
                  days.has(key)
                    ? "bg-accent text-white"
                    : "bg-surface-overlay text-gray-400 hover:text-white"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-end">
          <button
            type="submit"
            disabled={busy || !contentId}
            className="w-full rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
          >
            {busy ? "Adding…" : "Add schedule"}
          </button>
        </div>
      </form>

      <div className="overflow-hidden rounded-xl border border-white/10 bg-surface-raised">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 text-left text-xs uppercase tracking-wide text-gray-500">
              <th className="px-4 py-3 font-medium">Channel</th>
              <th className="px-4 py-3 font-medium">Window</th>
              <th className="px-4 py-3 font-medium">Days</th>
              <th className="px-4 py-3 font-medium">Enabled</th>
              <th className="px-4 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {schedules.map((s) => (
              <tr key={s.id} className="border-b border-white/5 last:border-0">
                <td className="px-4 py-3 font-medium text-white">{labelFor(s.contentId)}</td>
                <td className="px-4 py-3 font-mono text-xs text-gray-300">
                  {s.startTime} – {s.endTime}
                </td>
                <td className="px-4 py-3 text-xs text-gray-400">{formatDays(s.daysOfWeek)}</td>
                <td className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() => handleToggle(s)}
                    className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                      s.enabled ? "bg-emerald-500/15 text-emerald-300" : "bg-white/5 text-gray-400"
                    }`}
                  >
                    {s.enabled ? "On" : "Off"}
                  </button>
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    type="button"
                    onClick={() => handleDelete(s.id)}
                    className="rounded-md border border-red-500/30 px-2.5 py-1 text-xs text-red-300 transition-colors hover:bg-red-500/10"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {schedules.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                  No schedules yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
