"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import ErrorBanner from "@/components/ErrorBanner";
import LoadingGrid from "@/components/LoadingGrid";
import VideoPlayer from "@/components/VideoPlayer";
import DecryptionKeysPanel from "@/components/DecryptionKeysPanel";
import { getDecryptionKeys, getPlayback } from "@/lib/api";
import type { ApiError, DecryptionKeysResponse, PlaybackConfig } from "@/lib/types";

function WatchContent({ contentId }: { contentId: string }) {
  const searchParams = useSearchParams();
  const contentType = (searchParams.get("type") ?? "vod") as "vod" | "live" | "streaming";
  const channelTag = searchParams.get("channelTag") ?? undefined;
  const manifestHint = searchParams.get("manifestHint") ?? undefined;

  const [playback, setPlayback] = useState<PlaybackConfig | null>(null);
  const [decryption, setDecryption] = useState<DecryptionKeysResponse | null>(null);
  const [keysError, setKeysError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      setKeysError(null);
      setDecryption(null);
      try {
        const config = await getPlayback(contentId, {
          contentType,
          channelTag,
          manifestHint,
        });
        if (cancelled) return;
        setPlayback(config);

        try {
          const keys = await getDecryptionKeys({
            contentId,
            manifestUrl: config.manifestUrl,
            contentType,
            channelTag,
          });
          if (!cancelled) setDecryption(keys);
        } catch (err) {
          if (!cancelled) setKeysError(err as ApiError);
        }
      } catch (err) {
        if (cancelled) return;
        const playbackError = err as ApiError;
        setError(playbackError);

        if (manifestHint) {
          try {
            const keys = await getDecryptionKeys({
              contentId,
              manifestUrl: manifestHint,
              contentType,
              channelTag,
            });
            if (!cancelled) setDecryption(keys);
          } catch (keyErr) {
            if (!cancelled) setKeysError(keyErr as ApiError);
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [contentId, contentType, channelTag, manifestHint]);

  return (
    <div className="w-full px-4 py-8 sm:px-6 lg:px-8">
      <Link
        href="/"
        className="mb-6 inline-flex items-center gap-2 text-sm text-gray-400 transition-colors hover:text-white"
      >
        ← Back to dashboard
      </Link>

      <ErrorBanner error={error} />

      {(error?.code === "UNAUTHORIZED" ||
        error?.code === "DSTV_AUTH_REQUIRED" ||
        error?.code === "ENTITLEMENT_DENIED") && (
        <div className="mb-6 rounded-lg border border-amber-500/30 bg-amber-950/30 px-4 py-3 text-sm text-amber-200">
          Configure auth on the{" "}
          <Link href="/admin" className="underline hover:text-white">
            admin page
          </Link>{" "}
          with a fresh Connect JWT, profile ID, WAF token, and catalog cookie. If entitlement
          fails, paste the Irdeto session JWT from your browser&apos;s entitlement response —
          playback can continue with that session after the Connect JWT expires.
        </div>
      )}

      {loading && <LoadingGrid count={1} />}

      {!loading && decryption && <DecryptionKeysPanel data={decryption} />}

      {!loading && playback && (
        <>
          <VideoPlayer playback={playback} contentTitle={`Content ${contentId}`} />
          {keysError && !decryption && (
            <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-950/30 px-4 py-3 text-sm text-amber-200">
              Playback loaded but decryption keys failed: {keysError.message}
            </div>
          )}
        </>
      )}

      {!loading && !playback && keysError && !decryption && (
        <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-950/30 px-4 py-3 text-sm text-amber-200">
          Decryption keys failed: {keysError.message}
        </div>
      )}
    </div>
  );
}

export default function WatchPage({ params }: { params: { id: string } }) {
  return (
    <Suspense fallback={<LoadingGrid count={1} />}>
      <WatchContent contentId={decodeURIComponent(params.id)} />
    </Suspense>
  );
}
