"use client";

import Hls from "hls.js";
import { useEffect, useRef, useState } from "react";

/**
 * Plays an HLS (.m3u8) URL — native on Safari, hls.js elsewhere.
 * `fill` makes the player occupy its parent (no aspect box / rounding) for
 * full-screen playback pages.
 */
export default function HlsPlayer({ src, fill = false }: { src: string; fill?: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;

    setError(null);

    // Safari / iOS play HLS natively via the <video> element.
    if (!Hls.isSupported()) {
      if (video.canPlayType("application/vnd.apple.mpegurl")) {
        video.src = src;
        video.play().catch(() => {});
      } else {
        setError("HLS playback is not supported in this browser.");
      }
      return;
    }

    const hls = new Hls({
      enableWorker: true,       // demux in a web worker for smoother playback
      liveSyncDurationCount: 3, // target 3 segments behind live edge
      liveMaxLatencyDurationCount: 8,
      maxBufferLength: 30,
    });

    hls.loadSource(src);
    hls.attachMedia(video);

    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      video.play().catch(() => {});
    });

    let networkRetries = 0;
    hls.on(Hls.Events.ERROR, (_, data) => {
      if (!data.fatal) return;
      if (data.type === Hls.ErrorTypes.NETWORK_ERROR && networkRetries < 4) {
        // Transient network failure — reload the manifest and try again.
        networkRetries++;
        hls.startLoad();
      } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
        hls.recoverMediaError();
      } else {
        setError("Playback error — the stream may still be starting.");
        hls.destroy();
      }
    });

    return () => hls.destroy();
  }, [src]);

  return (
    <div
      className={
        fill
          ? "relative h-full w-full bg-black"
          : "relative w-full overflow-hidden rounded-lg bg-black"
      }
    >
      <video
        ref={videoRef}
        controls
        autoPlay
        playsInline
        className={
          fill
            ? "h-full w-full bg-black object-contain"
            : "aspect-video w-full bg-black"
        }
      />
      {error && (
        <div className="absolute inset-x-0 bottom-0 bg-black/70 px-3 py-2 text-center text-xs text-warn-soft">
          {error}
        </div>
      )}
    </div>
  );
}
