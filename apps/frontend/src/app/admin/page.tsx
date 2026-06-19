"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import HlsPlayer from "@/components/HlsPlayer";
import RequireAuth from "@/components/RequireAuth";
import SchedulesSection from "@/components/SchedulesSection";
import { downloadLogs, fetchLogs, listChannels, startChannel, stopChannel } from "@/lib/admin-api";
import { resolveHlsUrl } from "@/lib/stream-api";
import type { AdminChannel } from "@/lib/types";

function StatCard({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className="rounded-xl border border-white/10 bg-surface-raised px-4 py-3">
      <p className="text-xs uppercase tracking-wide text-gray-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${accent ? "text-accent" : "text-white"}`}>
        {value}
      </p>
    </div>
  );
}

function StatusBadge({ running }: { running: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ${
        running ? "bg-emerald-500/15 text-emerald-300" : "bg-white/5 text-gray-400"
      }`}
    >
      <span
        className={`inline-flex h-1.5 w-1.5 rounded-full ${
          running ? "bg-emerald-400" : "bg-gray-500"
        }`}
      />
      {running ? "Running" : "Stopped"}
    </span>
  );
}

function AdminContent() {
  const [channels, setChannels] = useState<AdminChannel[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [logText, setLogText] = useState("");
  const [preview, setPreview] = useState<{ contentId: string; url: string } | null>(null);
  const logOffset = useRef(0);
  const logBoxRef = useRef<HTMLPreElement>(null);

  const total = channels.length;
  const running = channels.filter((c) => c.running).length;
  const captured = channels.filter((c) => c.hasManifest).length;

  const refresh = useCallback(async () => {
    try {
      const data = await listChannels();
      setChannels(data.channels);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load channels.");
    }
  }, []);

  useEffect(() => {
    refresh();
    const timer = window.setInterval(refresh, 5000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  // Poll the selected channel's log tail.
  useEffect(() => {
    if (!selected) return;
    logOffset.current = 0;
    setLogText("");
    let active = true;

    async function poll() {
      try {
        const chunk = await fetchLogs(selected!, logOffset.current);
        if (!active || !chunk.content) return;
        logOffset.current = chunk.offset;
        setLogText((prev) => (prev + chunk.content).slice(-60000));
      } catch {
        // transient; keep polling
      }
    }

    poll();
    const timer = window.setInterval(poll, 1500);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [selected]);

  useEffect(() => {
    if (logBoxRef.current) {
      logBoxRef.current.scrollTop = logBoxRef.current.scrollHeight;
    }
  }, [logText]);

  const act = useCallback(
    async (contentId: string, action: "start" | "stop") => {
      setBusy(contentId);
      setError(null);
      try {
        await (action === "start" ? startChannel(contentId) : stopChannel(contentId));
        await refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : `Failed to ${action} ${contentId}.`);
      } finally {
        setBusy(null);
      }
    },
    [refresh]
  );

  return (
    <div className="w-full px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Admin · Channel control</h1>
        <p className="mt-1 text-sm text-gray-400">
          Start and stop channel restreams and watch their logs.
        </p>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-500/30 bg-red-950/30 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}

      <div className="mb-6 grid grid-cols-3 gap-3 sm:max-w-md">
        <StatCard label="Channels" value={total} />
        <StatCard label="Running" value={running} accent />
        <StatCard label="Captured" value={captured} />
      </div>

      <div className="overflow-hidden rounded-xl border border-white/10 bg-surface-raised">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 text-left text-xs uppercase tracking-wide text-gray-500">
              <th className="px-4 py-3 font-medium">Channel</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Manifest</th>
              <th className="px-4 py-3 font-medium">PID</th>
              <th className="px-4 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {channels.map((ch) => (
              <tr key={ch.contentId} className="border-b border-white/5 last:border-0">
                <td className="px-4 py-3">
                  <div className="font-medium text-white">{ch.channelTag || ch.contentId}</div>
                  {ch.title && <div className="text-xs text-gray-500">{ch.title}</div>}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge running={ch.running} />
                </td>
                <td className="px-4 py-3">
                  <span className={ch.hasManifest ? "text-emerald-300" : "text-amber-300"}>
                    {ch.hasManifest ? "captured" : "missing"}
                  </span>
                </td>
                <td className="px-4 py-3 font-mono text-xs text-gray-400">{ch.pid ?? "—"}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setSelected(ch.contentId)}
                      className="rounded-md border border-white/10 px-2.5 py-1 text-xs text-gray-300 transition-colors hover:bg-white/5 hover:text-white"
                    >
                      Logs
                    </button>
                    {(ch.directHlsUrl || (ch.running && ch.hlsUrl)) && (
                      <button
                        type="button"
                        onClick={() =>
                          setPreview({
                            contentId: ch.contentId,
                            url: ch.directHlsUrl ?? resolveHlsUrl(ch.hlsUrl!),
                          })
                        }
                        className="rounded-md border border-white/10 px-2.5 py-1 text-xs text-gray-300 transition-colors hover:bg-white/5 hover:text-white"
                      >
                        Preview
                      </button>
                    )}
                    {ch.running ? (
                      <button
                        type="button"
                        disabled={busy === ch.contentId}
                        onClick={() => act(ch.contentId, "stop")}
                        className="rounded-md border border-red-500/30 px-2.5 py-1 text-xs text-red-300 transition-colors hover:bg-red-500/10 disabled:opacity-50"
                      >
                        {busy === ch.contentId ? "…" : "Stop"}
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={busy === ch.contentId || !ch.hasManifest}
                        onClick={() => act(ch.contentId, "start")}
                        title={ch.hasManifest ? "" : "No captured manifest — capture via the tracker first"}
                        className="rounded-md bg-accent px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-40"
                      >
                        {busy === ch.contentId ? "…" : "Start"}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {channels.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-gray-500">
                  No channels.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {selected && (
        <div className="mt-6 overflow-hidden rounded-xl border border-white/10 bg-surface-raised">
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
            <h2 className="text-sm font-semibold text-white">
              Logs · <span className="font-mono text-gray-400">{selected}</span>
            </h2>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => downloadLogs(selected).catch(() => {})}
                className="rounded-md border border-white/10 px-2.5 py-1 text-xs text-gray-300 hover:bg-white/5 hover:text-white"
              >
                Download
              </button>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="rounded-md border border-white/10 px-2.5 py-1 text-xs text-gray-300 hover:bg-white/5 hover:text-white"
              >
                Close
              </button>
            </div>
          </div>
          <pre
            ref={logBoxRef}
            className="max-h-80 overflow-auto bg-black/40 p-4 font-mono text-[11px] leading-relaxed text-gray-300"
          >
            {logText || "Waiting for log output…"}
          </pre>
        </div>
      )}

      {preview && (
        <div className="mt-6 overflow-hidden rounded-xl border border-white/10 bg-surface-raised">
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
            <h2 className="text-sm font-semibold text-white">
              Preview · <span className="font-mono text-gray-400">{preview.contentId}</span>
            </h2>
            <button
              type="button"
              onClick={() => setPreview(null)}
              className="rounded-md border border-white/10 px-2.5 py-1 text-xs text-gray-300 hover:bg-white/5 hover:text-white"
            >
              Close
            </button>
          </div>
          <div className="p-4">
            <HlsPlayer src={preview.url} />
          </div>
        </div>
      )}

      <SchedulesSection channels={channels} />
    </div>
  );
}

export default function AdminPage() {
  return (
    <RequireAuth admin>
      <AdminContent />
    </RequireAuth>
  );
}
