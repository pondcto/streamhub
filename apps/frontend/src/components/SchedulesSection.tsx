"use client";

import { useCallback, useEffect, useState } from "react";

import { createSchedule, deleteSchedule, listSchedules, updateSchedule } from "@/lib/admin-api";
import { useToast } from "@/components/Toast";
import Button from "@/components/ui/Button";
import { cn } from "@/lib/cn";
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
  const { notify } = useToast();
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [busy, setBusy] = useState(false);

  const [contentId, setContentId] = useState("");
  const [startTime, setStartTime] = useState("18:00");
  const [endTime, setEndTime] = useState("23:00");
  const [days, setDays] = useState<Set<string>>(new Set(DAYS.map(([k]) => k)));

  const refresh = useCallback(async () => {
    try {
      setSchedules(await listSchedules());
    } catch (err) {
      notify(err instanceof Error ? err.message : "Failed to load schedules.", "error");
    }
  }, [notify]);

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
    try {
      await createSchedule({
        contentId,
        startTime,
        endTime,
        daysOfWeek: daysToString(days),
        enabled: true,
      });
      await refresh();
      notify("Schedule added.", "success");
    } catch (err) {
      notify(err instanceof Error ? err.message : "Failed to add schedule.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(id: number) {
    try {
      await deleteSchedule(id);
      await refresh();
    } catch (err) {
      notify(err instanceof Error ? err.message : "Failed to delete schedule.", "error");
    }
  }

  async function handleToggle(schedule: Schedule) {
    try {
      await updateSchedule(schedule.id, { enabled: !schedule.enabled });
      await refresh();
    } catch (err) {
      notify(err instanceof Error ? err.message : "Failed to update schedule.", "error");
    }
  }

  const labelFor = (cid: string) => {
    const ch = channels.find((c) => c.contentId === cid);
    return ch?.channelTag || cid;
  };

  return (
    <div>
      <h2 className="mb-1 text-lg font-semibold text-white">Schedules</h2>
      <p className="mb-4 text-sm text-content-muted">
        Channels auto-start and stop at these times (server timezone). A capture must exist when a
        start fires.
      </p>

      <form
        onSubmit={handleAdd}
        className="mb-4 grid grid-cols-1 gap-4 rounded-2xl border border-white/10 bg-surface-raised p-4 sm:grid-cols-2 lg:grid-cols-5"
      >
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-content-muted">Channel</span>
          <select
            value={contentId}
            onChange={(e) => setContentId(e.target.value)}
            className="w-full rounded-lg border border-white/10 bg-surface-overlay px-3 py-2.5 text-sm text-white transition-colors focus:border-accent/50 focus:outline-none"
          >
            {channels.map((c) => (
              <option key={c.contentId} value={c.contentId}>
                {c.channelTag || c.contentId}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-content-muted">Start</span>
          <input
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            className="w-full rounded-lg border border-white/10 bg-surface-overlay px-3 py-2.5 text-sm text-white transition-colors focus:border-accent/50 focus:outline-none"
          />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-content-muted">End</span>
          <input
            type="time"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            className="w-full rounded-lg border border-white/10 bg-surface-overlay px-3 py-2.5 text-sm text-white transition-colors focus:border-accent/50 focus:outline-none"
          />
        </label>

        <div className="block lg:col-span-1">
          <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-content-muted">Days</span>
          <div className="flex flex-wrap gap-1">
            {DAYS.map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => toggleDay(key)}
                aria-pressed={days.has(key)}
                className={cn(
                  "rounded-md px-2 py-1 text-[11px] font-medium transition-colors",
                  days.has(key)
                    ? "bg-accent text-white"
                    : "bg-surface-overlay text-content-faint hover:text-white"
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-end">
          <Button type="submit" loading={busy} disabled={!contentId} className="w-full">
            {busy ? "Adding…" : "Add schedule"}
          </Button>
        </div>
      </form>

      <div className="overflow-hidden rounded-2xl border border-white/10 bg-surface-raised shadow-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 bg-white/[0.02] text-left text-xs uppercase tracking-wide text-content-faint">
              <th className="px-4 py-3 font-medium">Channel</th>
              <th className="px-4 py-3 font-medium">Window</th>
              <th className="px-4 py-3 font-medium">Days</th>
              <th className="px-4 py-3 font-medium">Enabled</th>
              <th className="px-4 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {schedules.map((s) => (
              <tr key={s.id} className="border-b border-white/5 transition-colors last:border-0 hover:bg-white/[0.03]">
                <td className="px-4 py-3 font-medium text-white">{labelFor(s.contentId)}</td>
                <td className="px-4 py-3 font-mono text-xs text-content-muted">
                  {s.startTime} – {s.endTime}
                </td>
                <td className="px-4 py-3 text-xs text-content-faint">{formatDays(s.daysOfWeek)}</td>
                <td className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() => handleToggle(s)}
                    aria-pressed={s.enabled}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide transition-colors",
                      s.enabled
                        ? "border-success/30 bg-success/15 text-success-soft"
                        : "border-white/10 bg-white/5 text-content-muted hover:text-white"
                    )}
                  >
                    <span className={cn("h-1.5 w-1.5 rounded-full", s.enabled ? "bg-success-soft" : "bg-content-faint")} />
                    {s.enabled ? "On" : "Off"}
                  </button>
                </td>
                <td className="px-4 py-3 text-right">
                  <Button size="sm" variant="danger" onClick={() => handleDelete(s.id)}>
                    Delete
                  </Button>
                </td>
              </tr>
            ))}
            {schedules.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-content-faint">
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
