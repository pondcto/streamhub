"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PlaybackConfig } from "@/lib/types";
import { shouldProxyCdnUrl, toCdnProxyUrl, wrapManifestForPlayback } from "@/lib/cdn-proxy";
import ErrorBanner from "./ErrorBanner";

interface VideoPlayerProps {
  playback: PlaybackConfig;
  contentTitle?: string;
}

type PlayerError = { code: string; message: string };

function mapDashError(e: unknown): PlayerError {
  if (e && typeof e === "object") {
    const inner = (e as Record<string, unknown>).error as Record<string, unknown> | undefined;
    if (inner) {
      const code = Number(inner.code ?? 0);
      // Protection/DRM errors: 111–113
      if (code >= 111 && code <= 113) {
        return { code: "LICENSE_FAILURE", message: "Widevine license request failed. Your entitlement session may be expired or denied." };
      }
      // Manifest errors: 10–29
      if (code >= 10 && code <= 29) {
        return { code: "MANIFEST_FAILURE", message: "Failed to load the manifest (.mpd). The stream may be unavailable." };
      }
      const msg = String(inner.message ?? "Playback error occurred.");
      if (msg.includes("403")) {
        return { code: "ENTITLEMENT_DENIED", message: "Access denied (403). The CDN token may have expired — click Watch again for a fresh session." };
      }
      return { code: `DASH_${code}`, message: msg };
    }
  }
  const msg = e instanceof Error ? e.message : String(e ?? "Unknown playback error.");
  if (msg.includes("403")) {
    return { code: "ENTITLEMENT_DENIED", message: "Access denied (403). The CDN token may have expired — click Watch again for a fresh session." };
  }
  return { code: "PLAYBACK_ERROR", message: msg };
}

export default function VideoPlayer({ playback, contentTitle }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const playerRef = useRef<{ destroy(): void } | null>(null);
  const [error, setError] = useState<PlayerError | null>(null);
  const [loading, setLoading] = useState(true);

  const initPlayer = useCallback(async () => {
    if (!videoRef.current) return;

    if (new Date(playback.expiresAt).getTime() <= Date.now()) {
      setError({ code: "SESSION_EXPIRED", message: "Playback session has expired. Return to the dashboard and try again." });
      setLoading(false);
      return;
    }

    try {
      const dashjs = (await import("dashjs")).default;
      const player = dashjs.MediaPlayer().create();
      playerRef.current = player;

      // Initialize without source so DRM and request modifier are set first.
      player.initialize(videoRef.current, null, false);

      // Widevine DRM.
      player.setProtectionData({
        "com.widevine.alpha": {
          serverURL: playback.drm.widevine.licenseUrl,
          withCredentials: false,
        },
      });

      // Route CDN segment / manifest requests through the backend proxy.
      // License requests go to licensev2.dstv.com and won't match shouldProxyCdnUrl().
      (player as unknown as {
        extend(type: string, factory: () => object, override: boolean): void;
      }).extend("RequestModifier", () => ({
        modifyRequestURL(url: string): string {
          return shouldProxyCdnUrl(url) ? toCdnProxyUrl(url) : url;
        },
        modifyRequestHeader(headers: Record<string, string>): Record<string, string> {
          return headers;
        },
      }), true);

      player.on(dashjs.MediaPlayer.events.ERROR, (e: unknown) => {
        setError(mapDashError(e));
        setLoading(false);
      });

      player.on(dashjs.MediaPlayer.events.CAN_PLAY, () => {
        setLoading(false);
        void player.play();
      });

      player.attachSource(wrapManifestForPlayback(playback.manifestUrl));
    } catch (err) {
      setError(mapDashError(err));
      setLoading(false);
    }
  }, [playback]);

  useEffect(() => {
    initPlayer();
    return () => {
      playerRef.current?.destroy();
      playerRef.current = null;
    };
  }, [initPlayer]);

  return (
    <div className="relative w-full">
      {contentTitle && (
        <h1 className="mb-4 text-xl font-semibold text-white">{contentTitle}</h1>
      )}
      <ErrorBanner error={error} />
      <div className="relative aspect-video overflow-hidden rounded-2xl border border-white/10 bg-surface-sunken shadow-pop ring-1 ring-white/5">
        {loading && !error && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-black/70 backdrop-blur-sm">
            <div className="relative h-11 w-11">
              <div className="absolute inset-0 animate-spin rounded-full border-2 border-accent border-t-transparent" />
              <div className="absolute inset-2 animate-glow-pulse rounded-full bg-accent/20" />
            </div>
            <p className="text-xs text-content-faint">Preparing secure playback…</p>
          </div>
        )}
        <video ref={videoRef} className="h-full w-full" controls playsInline />
      </div>
      <p className="mt-3 text-xs text-content-faint">
        Session expires: {new Date(playback.expiresAt).toLocaleString()}
      </p>
    </div>
  );
}
