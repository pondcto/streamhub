"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PlaybackConfig } from "@/lib/types";
import ErrorBanner from "./ErrorBanner";

interface VideoPlayerProps {
  playback: PlaybackConfig;
  contentTitle?: string;
}

type PlayerError = {
  code: string;
  message: string;
};

type ShakaPlayerInstance = {
  destroy: () => void | Promise<void>;
};

function mapShakaError(err: unknown): PlayerError {
  if (err && typeof err === "object" && "code" in err) {
    const code = Number((err as { code: number }).code);
    const category = Math.floor(code / 1000);

    if (category === 6) {
      return {
        code: "LICENSE_FAILURE",
        message:
          "Widevine license request failed. Your entitlement session may be expired or denied.",
      };
    }
    if (category === 4) {
      return {
        code: "MANIFEST_FAILURE",
        message: "Failed to load the manifest (.mpd). The stream may be unavailable.",
      };
    }
    if (category === 7) {
      return {
        code: "NETWORK_FAILURE",
        message: "Network error during playback. Check CORS and connectivity.",
      };
    }
    return {
      code: `SHAKA_${code}`,
      message: (err as { message?: string }).message ?? "Playback error occurred.",
    };
  }
  return {
    code: "PLAYBACK_ERROR",
    message: err instanceof Error ? err.message : "Unknown playback error.",
  };
}

export default function VideoPlayer({ playback, contentTitle }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const playerRef = useRef<ShakaPlayerInstance | null>(null);
  const [error, setError] = useState<PlayerError | null>(null);
  const [loading, setLoading] = useState(true);

  const initPlayer = useCallback(async () => {
    if (!videoRef.current) return;

    const expiresAt = new Date(playback.expiresAt);
    if (expiresAt.getTime() <= Date.now()) {
      setError({
        code: "SESSION_EXPIRED",
        message: "Playback session has expired. Return to the dashboard and try again.",
      });
      setLoading(false);
      return;
    }

    try {
      const shakaModule = await import("shaka-player/dist/shaka-player.compiled.js");
      const shaka = shakaModule.default;
      shaka.polyfill.installAll();

      if (!shaka.Player.isBrowserSupported()) {
        setError({
          code: "BROWSER_UNSUPPORTED",
          message: "This browser does not support encrypted media playback.",
        });
        setLoading(false);
        return;
      }

      const player = new shaka.Player();
      playerRef.current = player;
      await player.attach(videoRef.current);

      player.configure({
        drm: {
          servers: {
            "com.widevine.alpha": playback.drm.widevine.licenseUrl,
          },
        },
      });

      player.addEventListener("error", (event: Event) => {
        const detail = (event as CustomEvent).detail;
        setError(mapShakaError(detail));
        setLoading(false);
      });

      await player.load(playback.manifestUrl);
      setLoading(false);
    } catch (err) {
      const mapped = mapShakaError(err);
      if (mapped.message.toLowerCase().includes("403")) {
        mapped.code = "ENTITLEMENT_DENIED";
        mapped.message = "Access denied (403). Entitlement may have been revoked.";
      }
      setError(mapped);
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

      <div className="relative aspect-video overflow-hidden rounded-xl bg-black">
        {loading && !error && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/60">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          </div>
        )}
        <video
          ref={videoRef}
          className="h-full w-full"
          controls
          autoPlay
          playsInline
        />
      </div>

      <p className="mt-3 text-xs text-gray-500">
        Session expires: {new Date(playback.expiresAt).toLocaleString()}
      </p>
    </div>
  );
}
