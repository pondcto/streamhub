"use client";

import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";

import HlsPlayer from "@/components/HlsPlayer";
import RequireAuth from "@/components/RequireAuth";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import { generateTestItemKeys } from "@/lib/api";
import { resolveHlsUrl, startStream, stopStream } from "@/lib/stream-api";

type StreamState = "starting" | "ready" | "error";

function PlayContent({ contentId }: { contentId: string }) {
  const searchParams = useSearchParams();
  const contentType = searchParams.get("type") ?? "live";
  const channelTag = searchParams.get("channelTag") ?? undefined;
  const title = searchParams.get("title") ?? "Stream";

  const containerRef = useRef<HTMLDivElement>(null);
  const hideTimer = useRef<number | null>(null);
  const [hlsUrl, setHlsUrl] = useState<string | null>(null);
  const [state, setState] = useState<StreamState>("starting");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [chromeVisible, setChromeVisible] = useState(true);

  // Generate keys + start the restream, then play the resulting HLS feed.
  // Mirrors the old StreamPlaybackModal flow, but in a dedicated full-screen tab.
  useEffect(() => {
    let cancelled = false;
    setState("starting");
    setErrorMsg(null);
    setHlsUrl(null);

    (async () => {
      try {
        const keys = await generateTestItemKeys(contentId);
        if (cancelled) return;
        // wv-mpd-streaming wants the bare .mpd (drop ?ssai=...&filter=...).
        const info = await startStream({
          contentId,
          manifestUrl: keys.manifestUrl.split("?")[0],
          contentType,
          channelTag,
        });
        if (cancelled) return;
        setHlsUrl(resolveHlsUrl(info.hlsUrl));
        setState(info.status === "playing" ? "ready" : "starting");
      } catch (err) {
        if (cancelled) return;
        setErrorMsg(err instanceof Error ? err.message : "Failed to start the stream.");
        setState("error");
      }
    })();

    return () => {
      cancelled = true;
      stopStream(contentId).catch(() => {});
    };
  }, [contentId, contentType, channelTag, attempt]);

  useEffect(() => {
    document.title = `${title} · StreamHub`;
  }, [title]);

  // Request native fullscreen. Browsers require a user gesture, so the
  // load-time attempt is best-effort; clicking anywhere on the player retries.
  const enterFullscreen = useCallback(() => {
    const el = containerRef.current;
    if (el && !document.fullscreenElement) {
      el.requestFullscreen?.().catch(() => {});
    }
  }, []);

  useEffect(() => {
    if (hlsUrl) enterFullscreen();
  }, [hlsUrl, enterFullscreen]);

  // Auto-hide the title chrome while playing; reveal on mouse movement.
  const revealChrome = useCallback(() => {
    setChromeVisible(true);
    if (hideTimer.current) window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setChromeVisible(false), 2800);
  }, []);

  useEffect(() => {
    if (state === "ready") revealChrome();
    return () => {
      if (hideTimer.current) window.clearTimeout(hideTimer.current);
    };
  }, [state, revealChrome]);

  const showChrome = chromeVisible || state !== "ready";
  const isLive = contentType !== "vod";

  return (
    <div
      ref={containerRef}
      onMouseMove={state === "ready" ? revealChrome : undefined}
      className="fixed inset-0 z-50 flex h-screen w-screen items-center justify-center bg-black"
    >
      {/* Player */}
      <div className="absolute inset-0 flex items-center justify-center" onClick={enterFullscreen}>
        {hlsUrl ? (
          <HlsPlayer src={hlsUrl} fill />
        ) : state === "error" ? (
          <div className="mx-4 max-w-sm rounded-2xl border border-white/10 bg-surface-raised/80 p-8 text-center shadow-pop backdrop-blur-md">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-danger/15 text-danger">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-6 w-6" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m0 3.75h.008M10.36 3.6 1.99 18a1.5 1.5 0 0 0 1.3 2.25h17.42A1.5 1.5 0 0 0 22 18L13.64 3.6a1.5 1.5 0 0 0-2.6 0Z" />
              </svg>
            </div>
            <p className="text-sm font-medium text-white">Couldn&rsquo;t start the stream</p>
            {errorMsg && <p className="mt-1.5 text-xs text-content-faint">{errorMsg}</p>}
            <div className="mt-5 flex items-center justify-center gap-3">
              <Button size="sm" onClick={() => setAttempt((a) => a + 1)}>
                Try again
              </Button>
              <Link href="/">
                <Button size="sm" variant="secondary">
                  Back
                </Button>
              </Link>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="relative h-12 w-12">
              <div className="absolute inset-0 animate-spin rounded-full border-2 border-accent border-t-transparent" />
              <div className="absolute inset-2 animate-glow-pulse rounded-full bg-accent/20" />
            </div>
            <div>
              <p className="text-sm font-medium text-white">{title}</p>
              <p className="mt-0.5 text-xs text-content-faint">Starting stream…</p>
            </div>
          </div>
        )}
      </div>

      {/* Top chrome: title + exit (auto-hides during playback) */}
      <AnimatePresence>
        {showChrome && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.25 }}
            className="pointer-events-none absolute inset-x-0 top-0 z-10 bg-gradient-to-b from-black/80 to-transparent p-4 sm:p-6"
          >
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <Link
                  href="/"
                  className="pointer-events-auto flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-black/40 text-white backdrop-blur-md transition-colors hover:border-white/30 hover:bg-black/60"
                  aria-label="Back to StreamHub"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 6 9 12l6 6" />
                  </svg>
                </Link>
                <div className="min-w-0">
                  <h1 className="truncate text-base font-semibold text-white drop-shadow">{title}</h1>
                  {channelTag && (
                    <p className="truncate font-mono text-[11px] text-white/60">{channelTag}</p>
                  )}
                </div>
              </div>
              {isLive && (
                <Badge tone="live" dot pulse>
                  Live
                </Badge>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function PlayPage({ params }: { params: { id: string } }) {
  return (
    <RequireAuth>
      <Suspense fallback={<div className="fixed inset-0 z-50 bg-black" />}>
        <PlayContent contentId={decodeURIComponent(params.id)} />
      </Suspense>
    </RequireAuth>
  );
}
