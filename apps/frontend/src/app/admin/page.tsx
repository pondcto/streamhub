"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";

import HlsPlayer from "@/components/HlsPlayer";
import Modal from "@/components/Modal";
import RequireAuth from "@/components/RequireAuth";
import SchedulesSection from "@/components/SchedulesSection";
import AddChannelSection from "@/components/admin/AddChannelSection";
import EditChannelSection from "@/components/admin/EditChannelSection";
import AdminSectionHeader from "@/components/admin/AdminSectionHeader";
import AdminSidebar, { SECTION_META, type AdminSection } from "@/components/admin/AdminSidebar";
import ProfilesSection from "@/components/admin/ProfilesSection";
import SettingsSection from "@/components/admin/SettingsSection";
import UserManagementSection from "@/components/admin/UserManagementSection";
import { useToast } from "@/components/Toast";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Field from "@/components/ui/Field";
import {
  assignChannelProfile,
  deleteChannel,
  downloadLogs,
  fetchLogs,
  listChannels,
  listProxies,
  startChannel,
  stopChannel,
} from "@/lib/admin-api";
import { useAdminPrefs } from "@/lib/admin-prefs";
import { copyText } from "@/lib/clipboard";
import { cn } from "@/lib/cn";
import { resolveHlsUrl } from "@/lib/stream-api";
import type { AdminChannel, ProxyProfile } from "@/lib/types";

const ALL_SECTIONS: AdminSection[] = ["users", "channels", "schedule", "profiles", "settings"];

function isSection(value: string | null): value is AdminSection {
  return value != null && (ALL_SECTIONS as string[]).includes(value);
}

function numberFor(ch: AdminChannel): string {
  return ch.channelNumber ?? "—";
}
function nameFor(ch: AdminChannel): string {
  return ch.title ?? ch.channelTag ?? ch.contentId;
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
        "relative overflow-hidden rounded-xl border px-3 py-2.5 sm:rounded-2xl sm:px-4 sm:py-3.5",
        accent ? "border-accent/30 bg-accent/10" : "border-white/10 bg-surface-raised"
      )}
    >
      <p className="text-[10px] font-medium uppercase tracking-wide text-content-faint sm:text-[11px]">{label}</p>
      <p
        className={cn(
          "mt-0.5 text-xl font-bold tabular-nums sm:mt-1 sm:text-2xl",
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

function TableIconButton({
  label,
  onClick,
  disabled,
  loading,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled || loading}
      className={cn(
        "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border transition-colors",
        danger
          ? "border-danger/20 text-danger-soft hover:bg-danger/10"
          : "border-white/10 text-content-faint hover:bg-white/5 hover:text-white",
        (disabled || loading) && "pointer-events-none opacity-50",
      )}
    >
      {loading ? (
        <span
          className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
          aria-hidden="true"
        />
      ) : (
        children
      )}
    </button>
  );
}

function ChannelPagination({
  filteredLength,
  firstRow,
  lastRow,
  currentPage,
  totalPages,
  onPrev,
  onNext,
}: {
  filteredLength: number;
  firstRow: number;
  lastRow: number;
  currentPage: number;
  totalPages: number;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 border-t border-white/10 px-3 py-2.5 text-xs text-content-faint sm:flex-row sm:items-center sm:justify-between sm:px-4">
      <span className="text-center sm:text-left">
        {filteredLength === 0
          ? "No results"
          : `Showing ${firstRow}–${lastRow} of ${filteredLength}`}
      </span>
      <div className="flex items-center justify-center gap-1.5">
        <Button size="sm" variant="secondary" disabled={currentPage <= 1} onClick={onPrev}>
          Prev
        </Button>
        <span className="px-2 tabular-nums">
          Page {currentPage} / {totalPages}
        </span>
        <Button size="sm" variant="secondary" disabled={currentPage >= totalPages} onClick={onNext}>
          Next
        </Button>
      </div>
    </div>
  );
}

function ChannelActionsBar({
  ch,
  busy,
  onLogs,
  onPreview,
  onCopyUrl,
  onEdit,
  onDelete,
  onAct,
  className,
}: {
  ch: AdminChannel;
  busy: string | null;
  onLogs: (contentId: string) => void;
  onPreview: (contentId: string, url: string) => void;
  onCopyUrl: (ch: AdminChannel) => void;
  onEdit: (ch: AdminChannel) => void;
  onDelete: (ch: AdminChannel) => void;
  onAct: (contentId: string, action: "start" | "stop") => void;
  className?: string;
}) {
  const previewUrl =
    ch.directHlsUrl ?? (ch.running && ch.hlsUrl ? resolveHlsUrl(ch.hlsUrl) : null);

  return (
    <div
      className={cn(
        "flex flex-nowrap items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className,
      )}
    >
      <TableIconButton label="Logs" onClick={() => onLogs(ch.contentId)}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} className="h-3.5 w-3.5" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6M9 16h6M9 8h6M5 20h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2H9l-2 2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2Z" />
        </svg>
      </TableIconButton>
      {previewUrl && (
        <TableIconButton label="Preview" onClick={() => onPreview(ch.contentId, previewUrl)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} className="h-3.5 w-3.5" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1 1 0 0 1 0-.644C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
          </svg>
        </TableIconButton>
      )}
      {publicStreamUrl(ch) && (
        <TableIconButton label="Copy URL" onClick={() => onCopyUrl(ch)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} className="h-3.5 w-3.5" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v2M8 16h8a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2Z" />
          </svg>
        </TableIconButton>
      )}
      {!ch.running && (
        <>
          <TableIconButton label="Edit channel" onClick={() => onEdit(ch)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} className="h-3.5 w-3.5" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 20h4l10.5-10.5a2 2 0 0 0 0-2.83l-1.17-1.17a2 2 0 0 0-2.83 0L4 16v4Z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6.5 17.5 10.5" />
            </svg>
          </TableIconButton>
          <TableIconButton label="Delete channel" danger onClick={() => onDelete(ch)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} className="h-3.5 w-3.5" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 7h12M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m-7 4v6m4-6v6M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12" />
            </svg>
          </TableIconButton>
        </>
      )}
      {ch.running ? (
        <TableIconButton
          label="Stop channel"
          danger
          loading={busy === ch.contentId}
          onClick={() => onAct(ch.contentId, "stop")}
        >
          <svg viewBox="0 0 24 24" fill="currentColor" className="h-3 w-3" aria-hidden="true">
            <rect x="6" y="6" width="12" height="12" rx="1" />
          </svg>
        </TableIconButton>
      ) : (
        <TableIconButton
          label={ch.hasManifest ? "Start channel" : "No captured manifest"}
          disabled={!ch.hasManifest}
          loading={busy === ch.contentId}
          onClick={() => onAct(ch.contentId, "start")}
        >
          <svg viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5" aria-hidden="true">
            <path d="M8 5.14v13.72a1 1 0 0 0 1.54.84l10.79-6.86a1 1 0 0 0 0-1.68L9.54 4.3A1 1 0 0 0 8 5.14Z" />
          </svg>
        </TableIconButton>
      )}
    </div>
  );
}

function ChannelMobileCard({
  ch,
  busy,
  onAssign,
  onLogs,
  onPreview,
  onCopyUrl,
  onEdit,
  onDelete,
  onAct,
}: {
  ch: AdminChannel;
  busy: string | null;
  onAssign: (ch: AdminChannel) => void;
  onLogs: (contentId: string) => void;
  onPreview: (contentId: string, url: string) => void;
  onCopyUrl: (ch: AdminChannel) => void;
  onEdit: (ch: AdminChannel) => void;
  onDelete: (ch: AdminChannel) => void;
  onAct: (contentId: string, action: "start" | "stop") => void;
}) {
  return (
    <article className="rounded-2xl border border-white/10 bg-surface-raised p-3.5 shadow-card">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm font-bold tabular-nums text-content-faint">
              {numberFor(ch)}
            </span>
            <span className="truncate font-semibold text-white">{nameFor(ch)}</span>
            {!ch.hasManifest && <Badge tone="warn">no capture</Badge>}
          </div>
          <p className="mt-1 font-mono text-xs text-content-faint">{ch.contentId}</p>
        </div>
        <StatusBadge running={ch.running} />
      </div>

      <div className="mb-3 flex items-center gap-2 text-xs">
        <span className="text-content-faint">Profile</span>
        {ch.profileName ? (
          <Badge tone="accent" className="max-w-[10rem] truncate">
            {ch.profileName}
          </Badge>
        ) : (
          <span className="text-content-faint">—</span>
        )}
        <button
          type="button"
          onClick={() => onAssign(ch)}
          aria-label={`Edit profile for ${nameFor(ch)}`}
          title="Edit profile"
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-white/10 text-content-faint transition-colors hover:bg-white/5 hover:text-white"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} className="h-3.5 w-3.5" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 20h4l10.5-10.5a2 2 0 0 0 0-2.83l-1.17-1.17a2 2 0 0 0-2.83 0L4 16v4Z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6.5 17.5 10.5" />
          </svg>
        </button>
      </div>

      <ChannelActionsBar
        ch={ch}
        busy={busy}
        onLogs={onLogs}
        onPreview={onPreview}
        onCopyUrl={onCopyUrl}
        onEdit={onEdit}
        onDelete={onDelete}
        onAct={onAct}
      />
    </article>
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
  const [showAdd, setShowAdd] = useState(false);
  const [editTarget, setEditTarget] = useState<AdminChannel | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminChannel | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const logOffset = useRef(0);
  const logBoxRef = useRef<HTMLPreElement>(null);

  // Proxy-profile assignment.
  const [profiles, setProfiles] = useState<ProxyProfile[]>([]);
  const [assignTarget, setAssignTarget] = useState<AdminChannel | null>(null);
  const [assignValue, setAssignValue] = useState<string>("");
  const [assignBusy, setAssignBusy] = useState(false);

  const loadProfiles = useCallback(async () => {
    try {
      setProfiles(await listProxies());
    } catch {
      // Profiles are optional context for the table; ignore load failures here.
    }
  }, []);

  useEffect(() => {
    loadProfiles();
  }, [loadProfiles]);

  const openAssign = useCallback((ch: AdminChannel) => {
    setAssignTarget(ch);
    setAssignValue(ch.profileId != null ? String(ch.profileId) : "");
    loadProfiles();
  }, [loadProfiles]);

  const saveAssign = useCallback(async () => {
    if (!assignTarget) return;
    setAssignBusy(true);
    try {
      const profileId = assignValue ? Number(assignValue) : null;
      await assignChannelProfile(assignTarget.contentId, profileId);
      await refresh();
      notify("Profile assignment updated.", "success");
      setAssignTarget(null);
    } catch (err) {
      notify(err instanceof Error ? err.message : "Failed to assign profile.", "error");
    } finally {
      setAssignBusy(false);
    }
  }, [assignTarget, assignValue, refresh, notify]);

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

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    try {
      await deleteChannel(deleteTarget.contentId);
      await refresh();
      notify(`Removed ${nameFor(deleteTarget)}.`, "success");
      setDeleteTarget(null);
    } catch (err) {
      notify(err instanceof Error ? err.message : "Failed to delete channel.", "error");
    } finally {
      setDeleteBusy(false);
    }
  }, [deleteTarget, refresh, notify]);

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

  const openPreview = useCallback((contentId: string, url: string) => {
    setPreview({ contentId, url });
  }, []);

  const actionProps = {
    busy,
    onLogs: setLogChannel,
    onPreview: openPreview,
    onCopyUrl: copyUrl,
    onEdit: setEditTarget,
    onDelete: setDeleteTarget,
    onAct: act,
  };

  const paginationProps = {
    filteredLength: filtered.length,
    firstRow,
    lastRow,
    currentPage,
    totalPages,
    onPrev: () => setPage((p) => Math.max(1, p - 1)),
    onNext: () => setPage((p) => Math.min(totalPages, p + 1)),
  };

  const emptyMessage =
    search || statusFilter !== "all" ? "No channels match your filters." : "No channels.";

  return (
    <>
      <div className="mb-6 grid grid-cols-3 gap-2 sm:gap-3 lg:max-w-md">
        <StatCard label="Channels" value={total} />
        <StatCard label="Running" value={running} accent />
        <StatCard label="Captured" value={captured} />
      </div>

      {/* Toolbar: search + filter (sticky glass) */}
      <div className="sticky top-16 z-20 mb-4 flex flex-col gap-2 rounded-2xl border border-white/10 bg-surface-raised/70 p-2 backdrop-blur-md sm:flex-row sm:items-center">
        <Field
          containerClassName="min-w-0 flex-1"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search channels…"
          leftIcon={
            <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="h-4 w-4" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.35-4.35m1.85-4.4a6.25 6.25 0 1 1-12.5 0 6.25 6.25 0 0 1 12.5 0Z" />
            </svg>
          }
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          className="w-full rounded-lg border border-white/10 bg-surface-overlay px-3 py-2.5 text-sm text-white transition-colors focus:border-accent/50 focus:outline-none sm:w-44"
        >
          <option value="all">All statuses</option>
          <option value="running">Running</option>
          <option value="stopped">Stopped</option>
        </select>
        <Button
          className="w-full shrink-0 sm:w-auto"
          onClick={() => setShowAdd(true)}
          leftIcon={
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} className="h-4 w-4" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
            </svg>
          }
        >
          Add Channel
        </Button>
      </div>

      {/* Mobile / tablet: card list */}
      <div className="space-y-3 lg:hidden">
        {pageItems.map((ch) => (
          <ChannelMobileCard
            key={ch.contentId}
            ch={ch}
            onAssign={openAssign}
            {...actionProps}
          />
        ))}
        {filtered.length === 0 && (
          <div className="rounded-2xl border border-white/10 bg-surface-raised px-4 py-12 text-center text-sm text-content-faint">
            {emptyMessage}
          </div>
        )}
        {filtered.length > 0 && (
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-surface-raised shadow-card">
            <ChannelPagination {...paginationProps} />
          </div>
        )}
      </div>

      {/* Desktop: table */}
      <div className="hidden overflow-hidden rounded-2xl border border-white/10 bg-surface-raised shadow-card lg:block">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 bg-white/[0.02] text-left text-xs uppercase tracking-wide text-content-faint">
                <th className="w-14 whitespace-nowrap px-3 py-2 font-medium">No.</th>
                <th className="whitespace-nowrap px-3 py-2 font-medium">Channel</th>
                <th className="w-24 whitespace-nowrap px-3 py-2 font-medium">Content ID</th>
                <th className="w-36 whitespace-nowrap px-3 py-2 font-medium">Profile</th>
                <th className="w-28 whitespace-nowrap px-3 py-2 font-medium">Status</th>
                <th className="w-[1%] whitespace-nowrap px-3 py-2 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map((ch) => (
                <tr key={ch.contentId} className="border-b border-white/5 transition-colors last:border-0 hover:bg-white/[0.03]">
                  <td className={cn("whitespace-nowrap px-3", rowPad)}>
                    <span className="font-mono text-base font-bold tabular-nums text-white">{numberFor(ch)}</span>
                  </td>
                  <td className={cn("whitespace-nowrap px-3", rowPad)}>
                    <span className="inline-flex items-center gap-2">
                      <span className="font-semibold text-white">{nameFor(ch)}</span>
                      {!ch.hasManifest && <Badge tone="warn">no capture</Badge>}
                    </span>
                  </td>
                  <td className={cn("whitespace-nowrap px-3 font-mono text-xs text-content-faint", rowPad)}>
                    {ch.contentId}
                  </td>
                  <td className={cn("whitespace-nowrap px-3", rowPad)}>
                    <div className="flex items-center gap-1.5">
                      {ch.profileName ? (
                        <Badge tone="accent" className="max-w-[7rem] truncate">
                          {ch.profileName}
                        </Badge>
                      ) : (
                        <span className="text-xs text-content-faint">—</span>
                      )}
                      <button
                        type="button"
                        onClick={() => openAssign(ch)}
                        aria-label={`Edit profile for ${nameFor(ch)}`}
                        title="Edit profile"
                        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-white/10 text-content-faint transition-colors hover:bg-white/5 hover:text-white"
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} className="h-3.5 w-3.5" aria-hidden="true">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4 20h4l10.5-10.5a2 2 0 0 0 0-2.83l-1.17-1.17a2 2 0 0 0-2.83 0L4 16v4Z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6.5 17.5 10.5" />
                        </svg>
                      </button>
                    </div>
                  </td>
                  <td className={cn("whitespace-nowrap px-3", rowPad)}>
                    <StatusBadge running={ch.running} />
                  </td>
                  <td className={cn("whitespace-nowrap px-3", rowPad)}>
                    <ChannelActionsBar ch={ch} className="justify-end" {...actionProps} />
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-content-faint">
                    {emptyMessage}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <ChannelPagination {...paginationProps} />
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

      {/* Add-channel modal */}
      {showAdd && (
        <Modal title="Add live channel" onClose={() => setShowAdd(false)} size="lg">
          <div className="p-4 sm:p-5">
            <AddChannelSection
              onCreated={async () => {
                await refresh();
                setShowAdd(false);
              }}
              onCancel={() => setShowAdd(false)}
            />
          </div>
        </Modal>
      )}

      {/* Edit-channel modal */}
      {editTarget && (
        <Modal
          title={<>Edit channel · <span className="font-semibold text-white">{nameFor(editTarget)}</span></>}
          onClose={() => setEditTarget(null)}
          size="lg"
        >
          <div className="p-4 sm:p-5">
            <EditChannelSection
              channel={editTarget}
              onSaved={async () => {
                await refresh();
                setEditTarget(null);
              }}
              onCancel={() => setEditTarget(null)}
            />
          </div>
        </Modal>
      )}

      {/* Delete confirmation modal */}
      {deleteTarget && (
        <Modal
          title={<>Remove channel · <span className="font-semibold text-white">{nameFor(deleteTarget)}</span></>}
          onClose={() => !deleteBusy && setDeleteTarget(null)}
          size="md"
        >
          <div className="space-y-4 p-4 sm:p-5">
            <p className="text-sm leading-relaxed text-content-muted">
              Permanently remove{" "}
              <span className="font-medium text-white">{nameFor(deleteTarget)}</span> (
              <span className="font-mono text-content-faint">{deleteTarget.contentId}</span>
              )? This also clears its proxy assignment and schedules. The channel must be stopped first.
            </p>
            <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row sm:justify-end">
              <Button
                variant="secondary"
                onClick={() => setDeleteTarget(null)}
                disabled={deleteBusy}
              >
                Cancel
              </Button>
              <Button variant="danger" loading={deleteBusy} onClick={confirmDelete}>
                Delete channel
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Assign-profile modal */}
      {assignTarget && (
        <Modal
          title={<>Assign profile · <span className="font-semibold text-white">{nameFor(assignTarget)}</span></>}
          onClose={() => setAssignTarget(null)}
          size="md"
        >
          <div className="space-y-4 p-5">
            <p className="text-sm text-content-muted">
              Choose the proxy profile this channel should use for outbound traffic.
            </p>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-content-muted">
                Proxy profile
              </span>
              <select
                value={assignValue}
                onChange={(e) => setAssignValue(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-surface-overlay px-3 py-2.5 text-sm text-white transition-colors focus:border-accent/50 focus:outline-none"
              >
                <option value="">None (no profile)</option>
                {profiles.map((p) => (
                  <option key={p.id} value={String(p.id)}>
                    {p.name} — {p.proxyType}://{p.host}:{p.port}
                  </option>
                ))}
              </select>
            </label>
            {profiles.length === 0 && (
              <p className="text-xs text-content-faint">
                No proxy profiles exist yet. Create one in the Proxy Profiles section first.
              </p>
            )}
            <div className="flex justify-end pt-1">
              <Button loading={assignBusy} onClick={saveAssign}>
                Save
              </Button>
            </div>
          </div>
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
              {section === "profiles" && <ProfilesSection />}
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
