"use client";

import { useEffect, useRef, useState } from "react";

// Minimal shape of the bits of shaka-player we use (avoids `any`).
interface ShakaPlayerInstance {
  addEventListener(type: string, listener: (event: Event) => void): void;
  load(uri: string): Promise<void>;
  destroy(): Promise<void>;
}
interface ShakaStatic {
  polyfill: { installAll(): void };
  Player: {
    isBrowserSupported(): boolean;
    new (mediaElement: HTMLMediaElement): ShakaPlayerInstance;
  };
}
interface ShakaModule {
  default: ShakaStatic;
}

/** Plays an HLS (.m3u8) URL — native on Safari, shaka-player elsewhere. */
export default function HlsPlayer({ src }: { src: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;

    let player: ShakaPlayerInstance | null = null;
    let cancelled = false;

    async function setup() {
      // Native HLS (Safari / iOS).
      if (video!.canPlayType("application/vnd.apple.mpegurl")) {
        video!.src = src;
        return;
      }
      try {
        const mod = (await import(
          "shaka-player/dist/shaka-player.compiled.js"
        )) as unknown as ShakaModule;
        if (cancelled) return;
        const shaka = mod.default;
        shaka.polyfill.installAll();
        if (!shaka.Player.isBrowserSupported()) {
          setError("This browser can't play the stream.");
          return;
        }
        player = new shaka.Player(video!);
        // Retry failed segment/init fetches — transient network blips or
        // a preflight race can fail the first attempt.
        (player as unknown as { configure(cfg: object): void }).configure({
          streaming: {
            retryParameters: { maxAttempts: 5, baseDelay: 1000, backoffFactor: 2, fuzzFactor: 0.5 },
          },
          manifest: {
            retryParameters: { maxAttempts: 5, baseDelay: 1000, backoffFactor: 2, fuzzFactor: 0.5 },
          },
        });
        player.addEventListener("error", () => setError("Playback error — the stream may still be starting."));
        await player.load(src);
      } catch {
        if (!cancelled) setError("Failed to load the player.");
      }
    }

    setError(null);
    setup();

    return () => {
      cancelled = true;
      if (player) player.destroy().catch(() => {});
    };
  }, [src]);

  return (
    <div className="relative w-full overflow-hidden rounded-lg bg-black">
      <video
        ref={videoRef}
        controls
        autoPlay
        playsInline
        className="aspect-video w-full bg-black"
      />
      {error && (
        <div className="absolute inset-x-0 bottom-0 bg-black/70 px-3 py-2 text-center text-xs text-amber-200">
          {error}
        </div>
      )}
    </div>
  );
}
