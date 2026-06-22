"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";

import HlsPlayer from "@/components/HlsPlayer";
import Modal from "@/components/Modal";
import RequireAuth from "@/components/RequireAuth";
import SchedulesSection from "@/components/SchedulesSection";
import AddChannelSection from "@/components/admin/AddChannelSection";
import AdminSectionHeader from "@/components/admin/AdminSectionHeader";
import AdminSidebar, { SECTION_META, type AdminSection } from "@/components/admin/AdminSidebar";
import SettingsSection from "@/components/admin/SettingsSection";
import UserManagementSection from "@/components/admin/UserManagementSection";
import { useToast } from "@/components/Toast";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Field from "@/components/ui/Field";
import { downloadLogs, fetchLogs, listChannels, startChannel, stopChannel } from "@/lib/admin-api";
import { useAdminPrefs } from "@/lib/admin-prefs";
import { copyText } from "@/lib/clipboard";
import { cn } from "@/lib/cn";
import { resolveHlsUrl } from "@/lib/stream-api";
import { TEST_VIDEOS } from "@/lib/test-items";
import type { AdminChannel } from "@/lib/types";

const ALL_SECTIONS: AdminSection[] = ["users", "add", "channels", "schedule", "settings"];

function isSection(value: string | null): value is AdminSection {
  return value != null && (ALL_SECTIONS as string[]).includes(value);
}

// Channel number + display name live in the frontend test catalog, keyed by the
// same id the admin API returns as contentId.
const META = new Map(TEST_VIDEOS.map((v) => [v.id, v]));
function numberFor(ch: AdminChannel): string {
  return META.get(ch.contentId)?.channelNumber ?? "—";
}
function nameFor(ch: AdminChannel): string {
  return META.get(ch.contentId)?.title ?? ch.title ?? ch.channelTag ?? ch.contentId;
}

// Public-facing HLS endpoint for a channel — e.g. https://live2.mzolotv.com/TS2/TS2.m3u8.
// Keyed by the channel tag (not the internal restream host). Override the base
// with NEXT_PUBLIC_PUBLIC_HLS_BASE.
const PUBLIC_HLS_BASE = process.env.NEXT_PUBLIC_PUBLIC_HLS_BASE ?? "https://live2.mzolotv.com";

function publicStreamUrl(ch: AdminChannel): string | null {
  // Prefer the channel tag; otherwise recover the <TAG> from an existing
  // .../<TAG>/<TAG>.m3u8 path.
  const tagFromPath = (url?: string | null) =>
    url?.match(/\/([^/]+)\/[^/]+\.m3u8(?:[?#]|$)/)?.[1] ?? null;
  const tag = ch.channelTag?.trim() || tagFromPath(ch.directHlsUrl) || tagFromPath(ch.hlsUrl);
  return tag ? `${PUBLIC_HLS_BASE}/${tag}/${tag}.m3u8` : null;
}

type StatusFilter = "all" | "running" | "stopped";

function StatCard({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border px-4 py-3.5",
        accent ? "border-accent/30 bg-accent/10" : "border-white/10 bg-surface-raised"
      )}
    >
      <p className="text-[11px] font-medium uppercase tracking-wide text-content-faint">{label}</p>
      <p
        className={cn(
          "mt-1 text-2xl font-bold tabular-nums",
          accent ? "text-accent-soft" : "text-white"
        )}
      >
        {value}
      </p>
      {accent && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-6 -top-6 h-16 w-16 rounded-full bg-accent/20 blur-2xl"
        />
      )}
    </div>
  );
}

function StatusBadge({ running }: { running: boolean }) {
  return running ? (
    <Badge tone="success" dot pulse>
      Running
    </Badge>
  ) : (
    <Badge tone="neutral" dot>
      Stopped
    </Badge>
  );
}

function ChannelsTab({
  channels,
  refresh,
}: {
  channels: AdminChannel[];
  refresh: () => Promise<void>;
}) {
  const { notify } = useToast();
  const { pageSize, density } = useAdminPrefs();
  const rowPad = density === "compact" ? "py-1.5" : "py-2.5";
  const [busy, setBusy] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [page, setPage] = useState(1);

  const [logChannel, setLogChannel] = useState<string | null>(null);
  const [logText, setLogText] = useState("");
  const [preview, setPreview] = useState<{ contentId: string; url: string } | null>(null);
  const logOffset = useRef(0);
  const logBoxRef = useRef<HTMLPreElement>(null);

  const total = channels.length;
  const running = channels.filter((c) => c.running).length;
  const captured = channels.filter((c) => c.hasManifest).length;

  // Poll the open log modal's tail.
  useEffect(() => {
    if (!logChannel) return;
    logOffset.current = 0;
    setLogText("");
    let active = true;

    async function poll() {
      try {
        const chunk = await fetchLogs(logChannel!, logOffset.current);
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
  }, [logChannel]);

  useEffect(() => {
    if (logBoxRef.current) {
      logBoxRef.current.scrollTop = logBoxRef.current.scrollHeight;
    }
  }, [logText]);

  const act = useCallback(
    async (contentId: string, action: "start" | "stop") => {
      setBusy(contentId);
      try {
        await (action === "start" ? startChannel(contentId) : stopChannel(contentId));
        await refresh();
        notify(
          `${action === "start" ? "Started" : "Stopped"} ${nameFor(
            channels.find((c) => c.contentId === contentId) ?? ({ contentId } as AdminChannel),
          )}.`,
          "success",
        );
      } catch (err) {
        notify(err instanceof Error ? err.message : `Failed to ${action} ${contentId}.`, "error");
      } finally {
        setBusy(null);
      }
    },
    [refresh, notify, channels],
  );

  const copyUrl = useCallback(
    async (ch: AdminChannel) => {
      const url = publicStreamUrl(ch);
      if (!url) return;
      const ok = await copyText(url);
      notify(
        ok ? "Stream URL copied to clipboard." : "Couldn't copy the URL.",
        ok ? "success" : "error",
      );
    },
    [notify],
  );

  // Filter + paginate.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return channels.filter((ch) => {
      if (statusFilter === "running" && !ch.running) return false;
      if (statusFilter === "stopped" && ch.running) return false;
      if (!q) return true;
      return (
        numberFor(ch).toLowerCase().includes(q) ||
        nameFor(ch).toLowerCase().includes(q) ||
        ch.contentId.toLowerCase().includes(q) ||
        (ch.channelTag?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [channels, search, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageItems = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const firstRow = filtered.length === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const lastRow = Math.min(currentPage * pageSize, filtered.length);

  // Reset to first page when the filter set or page size changes.
  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, pageSize]);

  return (
    <>
      <div className="mb-6 grid grid-cols-3 gap-3 sm:max-w-md">
        <StatCard label="Channels" value={total} />
        <StatCard label="Running" value={running} accent />
        <StatCard label="Captured" value={captured} />
      </div>

      {/* Toolbar: search + filter (sticky glass) */}
      <div className="sticky top-16 z-20 mb-4 flex flex-col gap-2 rounded-2xl border border-white/10 bg-surface-raised/70 p-2 backdrop-blur-md sm:flex-row sm:items-center">
        <Field
          containerClassName="flex-1"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by number, name, or Content ID…"
          leftIcon={
            <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="h-4 w-4" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.35-4.35m1.85-4.4a6.25 6.25 0 1 1-12.5 0 6.25 6.25 0 0 1 12.5 0Z" />
            </svg>
          }
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          className="rounded-lg border border-white/10 bg-surface-overlay px-3 py-2.5 text-sm text-white transition-colors focus:border-accent/50 focus:outline-none sm:w-44"
        >
          <option value="all">All statuses</option>
          <option value="running">Running</option>
          <option value="stopped">Stopped</option>
        </select>
      </div>

      <div className="overflow-hidden rounded-2xl border border-white/10 bg-surface-raised shadow-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 bg-white/[0.02] text-left text-xs uppercase tracking-wide text-content-faint">
              <th className="px-4 py-2 font-medium">No.</th>
              <th className="px-4 py-2 font-medium">Channel</th>
              <th className="px-4 py-2 font-medium">Content ID</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {pageItems.map((ch) => (
              <tr key={ch.contentId} className="border-b border-white/5 transition-colors last:border-0 hover:bg-white/[0.03]">
                <td className={cn("px-4", rowPad)}>
                  <span className="font-mono text-lg font-bold text-white">{numberFor(ch)}</span>
                </td>
                <td className={cn("px-4", rowPad)}>
                  <span className="text-base font-semibold text-white">{nameFor(ch)}</span>
                  {!ch.hasManifest && (
                    <span className="ml-2 align-middle">
                      <Badge tone="warn">no capture</Badge>
                    </span>
                  )}
                </td>
                <td className={cn("px-4 font-mono text-xs text-content-faint", rowPad)}>{ch.contentId}</td>
                <td className={cn("px-4", rowPad)}>
                  <StatusBadge running={ch.running} />
                </td>
                <td className={cn("px-4", rowPad)}>
                  <div className="flex items-center justify-end gap-2">
                    <Button size="sm" variant="secondary" onClick={() => setLogChannel(ch.contentId)}>
                      Logs
                    </Button>
                    {(ch.directHlsUrl || (ch.running && ch.hlsUrl)) && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() =>
                          setPreview({
                            contentId: ch.contentId,
                            url: ch.directHlsUrl ?? resolveHlsUrl(ch.hlsUrl!),
                          })
                        }
                      >
                        Preview
                      </Button>
                    )}
                    {publicStreamUrl(ch) && (
                      <Button size="sm" variant="secondary" onClick={() => copyUrl(ch)}>
                        Copy URL
                      </Button>
                    )}
                    {ch.running ? (
                      <Button
                        size="sm"
                        variant="danger"
                        loading={busy === ch.contentId}
                        onClick={() => act(ch.contentId, "stop")}
                      >
                        Stop
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="primary"
                        loading={busy === ch.contentId}
                        disabled={!ch.hasManifest}
                        title={ch.hasManifest ? "" : "No captured manifest — capture via the tracker first"}
                        onClick={() => act(ch.contentId, "start")}
                      >
                        Start
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-content-faint">
                  {search || statusFilter !== "all" ? "No channels match your filters." : "No channels."}
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {/* Pagination footer */}
        <div className="flex items-center justify-between gap-3 border-t border-white/10 px-4 py-2.5 text-xs text-content-faint">
          <span>
            {filtered.length === 0
              ? "No results"
              : `Showing ${firstRow}–${lastRow} of ${filtered.length}`}
          </span>
          <div className="flex items-center gap-1.5">
            <Button
              size="sm"
              variant="secondary"
              disabled={currentPage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Prev
            </Button>
            <span className="px-2 tabular-nums">
              Page {currentPage} / {totalPages}
            </span>
            <Button
              size="sm"
              variant="secondary"
              disabled={currentPage >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Next
            </Button>
          </div>
        </div>
      </div>

      {/* Logs modal */}
      {logChannel && (
        <Modal
          title={<>Logs · <span className="font-mono text-content-faint">{logChannel}</span></>}
          onClose={() => setLogChannel(null)}
          size="xl"
          actions={
            <Button size="sm" variant="secondary" onClick={() => downloadLogs(logChannel)}>
              Download
            </Button>
          }
        >
          <pre
            ref={logBoxRef}
            className="max-h-[70vh] overflow-auto bg-surface-sunken p-4 font-mono text-[11px] leading-relaxed text-content-muted"
          >
            {logText || "Waiting for log output…"}
          </pre>
        </Modal>
      )}

      {/* Preview modal */}
      {preview && (
        <Modal
          title={<>Preview · <span className="font-mono text-content-faint">{preview.contentId}</span></>}
          onClose={() => setPreview(null)}
          size="xl"
        >
          <div className="p-4">
            <HlsPlayer src={preview.url} />
          </div>
        </Modal>
      )}
    </>
  );
}

function AdminContent() {
  const { notify } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawTab = searchParams.get("tab");
  const section: AdminSection = isSection(rawTab) ? rawTab : "channels";

  const [channels, setChannels] = useState<AdminChannel[]>([]);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const healthyRef = useRef(true);
  const { pollIntervalSec } = useAdminPrefs();

  const refresh = useCallback(async () => {
    try {
      const data = await listChannels();
      setChannels(data.channels);
      healthyRef.current = true;
    } catch (err) {
      // Only toast on the first failure of a streak (background poll runs every 5s).
      if (healthyRef.current) {
        notify(err instanceof Error ? err.message : "Failed to load channels.", "error");
        healthyRef.current = false;
      }
    }
  }, [notify]);

  useEffect(() => {
    refresh();
    const timer = window.setInterval(refresh, Math.max(1, pollIntervalSec) * 1000);
    return () => window.clearInterval(timer);
  }, [refresh, pollIntervalSec]);

  const runningCount = useMemo(() => channels.filter((c) => c.running).length, [channels]);

  const navigate = useCallback(
    (id: AdminSection) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("tab", id);
      router.replace(`/admin?${params.toString()}`, { scroll: false });
      setMobileNavOpen(false);
    },
    [router, searchParams]
  );

  const meta = SECTION_META[section];

  return (
    <div className="flex w-full">
      <AdminSidebar
        active={section}
        onNavigate={navigate}
        runningCount={runningCount}
        mobileOpen={mobileNavOpen}
        onCloseMobile={() => setMobileNavOpen(false)}
      />

      <div className="min-w-0 flex-1">
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
          {/* Mobile section bar + menu trigger */}
          <div className="mb-4 flex items-center gap-3 lg:hidden">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Open admin menu"
              className="rounded-lg border border-white/10 bg-surface-raised/70 p-2 text-content-muted transition-colors hover:text-white"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-5 w-5" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <span className="text-sm font-medium text-white">{meta.label}</span>
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={section}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
            >
              <AdminSectionHeader title={meta.label} description={meta.description} />
              {section === "channels" && <ChannelsTab channels={channels} refresh={refresh} />}
              {section === "schedule" && <SchedulesSection channels={channels} />}
              {section === "add" && <AddChannelSection onCreated={refresh} />}
              {section === "users" && <UserManagementSection />}
              {section === "settings" && <SettingsSection />}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

export default function AdminPage() {
  return (
    <RequireAuth admin>
      <Suspense
        fallback={<div className="px-4 py-8 text-sm text-content-faint sm:px-6 lg:px-8">Loading admin…</div>}
      >
        <AdminContent />
      </Suspense>
    </RequireAuth>
  );
}
