"use client";

import { useCallback, useEffect, useState } from "react";

interface StreamPlaybackModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  manifestUrl: string;
  licenseUrl: string;
  sessionExpiresAt?: string;
  channelTag?: string;
}

function CopyField({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  return (
    <div className="rounded-lg border border-white/10 bg-surface/80 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
            {label}
          </p>
          {hint && <p className="mt-0.5 text-[11px] text-gray-500">{hint}</p>}
        </div>
        <button
          type="button"
          onClick={handleCopy}
          className="shrink-0 rounded-md border border-white/15 px-2.5 py-1 text-xs text-gray-300 transition-colors hover:border-accent/40 hover:text-white"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <p className="max-h-24 overflow-y-auto break-all font-mono text-[11px] leading-relaxed text-emerald-200/90">
        {value}
      </p>
    </div>
  );
}

export default function StreamPlaybackModal({
  open,
  onClose,
  title,
  manifestUrl,
  licenseUrl,
  sessionExpiresAt,
  channelTag,
}: StreamPlaybackModalProps) {
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    },
    [onClose]
  );

  useEffect(() => {
    if (!open) {
      return;
    }
    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [open, handleKeyDown]);

  if (!open) {
    return null;
  }

  const expiresLabel = sessionExpiresAt
    ? new Date(sessionExpiresAt).toLocaleString()
    : null;

  const streamId = (channelTag ?? "").trim();
  const command =
    "ulimit -n 65535 && make wv-mpd-streaming && " +
    `./bin/wv-mpd-streaming "${manifestUrl}"${streamId ? ` ${streamId}` : ""} live`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="stream-modal-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
        aria-label="Close"
      />

      <div className="relative z-10 w-full max-w-2xl overflow-hidden rounded-2xl border border-white/10 bg-surface-raised shadow-2xl shadow-black/50">
        <div className="border-b border-white/10 bg-gradient-to-r from-surface-overlay to-surface-raised px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="mb-1 flex items-center gap-2">
                <span className="inline-flex h-2 w-2 animate-pulse rounded-full bg-red-500" />
                <span className="text-[11px] font-semibold uppercase tracking-wider text-red-400">
                  Stream ready
                </span>
              </div>
              <h2 id="stream-modal-title" className="truncate text-lg font-semibold text-white">
                {title}
              </h2>
              <p className="mt-1 text-xs text-gray-400">
                {channelTag ? `Channel ${channelTag}` : "Playback endpoints"}
                {expiresLabel ? ` · Session expires ${expiresLabel}` : ""}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-white/10 px-3 py-1.5 text-sm text-gray-300 transition-colors hover:bg-white/5 hover:text-white"
            >
              Close
            </button>
          </div>
        </div>

        <div className="space-y-3 p-5">
          <CopyField
            label="Manifest URL"
            hint="DASH MPD — use with your player or CDN proxy"
            value={manifestUrl}
          />
          <CopyField
            label="License server URL"
            hint="Widevine license endpoint (ContentId + ls_session)"
            value={licenseUrl}
          />
          <CopyField
            label="Command"
            hint="Run from the wv-mpd-streaming project root"
            value={command}
          />
        </div>

        <div className="border-t border-white/10 bg-surface/50 px-5 py-3">
          <p className="text-[11px] text-gray-500">
            Paste these into your stream client. Akamai manifests may require the backend CDN
            proxy for browser playback.
          </p>
        </div>
      </div>
    </div>
  );
}
