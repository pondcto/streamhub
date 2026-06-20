"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";

import HlsPlayer from "@/components/HlsPlayer";
import RequireAuth from "@/components/RequireAuth";
import { generateTestItemKeys } from "@/lib/api";
import { resolveHlsUrl, startStream, stopStream } from "@/lib/stream-api";

type StreamState = "starting" | "ready" | "error";

function PlayContent({ contentId }: { contentId: string }) {
  const searchParams = useSearchParams();
  const contentType = searchParams.get("type") ?? "live";
  const channelTag = searchParams.get("channelTag") ?? undefined;
  const title = searchParams.get("title") ?? "Stream";

  const containerRef = useRef<HTMLDivElement>(null);
  const [hlsUrl, setHlsUrl] = useState<string | null>(null);
  const [state, setState] = useState<StreamState>("starting");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

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
  }, [contentId, contentType, channelTag]);

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

  return (
    <div
      ref={containerRef}
      onClick={enterFullscreen}
      className="fixed inset-0 z-50 flex h-screen w-screen items-center justify-center bg-black"
    >
      {hlsUrl ? (
        <HlsPlayer src={hlsUrl} fill />
      ) : (
        <div className="flex flex-col items-center gap-3 text-center">
          {state !== "error" && (
            <div className="h-9 w-9 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          )}
          <p className="text-sm text-gray-300">
            {state === "error"
              ? (errorMsg ?? "Couldn't start the stream")
              : "Starting stream…"}
          </p>
        </div>
      )}
    </div>
  );
}

export default function PlayPage({ params }: { params: { id: string } }) {
  return (
    <RequireAuth>
      <Suspense
        fallback={<div className="fixed inset-0 z-50 bg-black" />}
      >
        <PlayContent contentId={decodeURIComponent(params.id)} />
      </Suspense>
    </RequireAuth>
  );
}
