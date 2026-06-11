"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import ErrorBanner from "@/components/ErrorBanner";
import LoadingGrid from "@/components/LoadingGrid";
import { getDecryptionKeys, getSeasonDetail } from "@/lib/api";
import type { ApiError, SeasonDetailResponse, SeasonVideoCard } from "@/lib/types";

export default function SportSeasonPage({
  params,
}: {
  params: { stackId: string; programId: string; seasonId: string };
}) {
  const { stackId, programId, seasonId } = params;
  const [detail, setDetail] = useState<SeasonDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [watchLoadingId, setWatchLoadingId] = useState<string | null>(null);

  const loadDetail = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getSeasonDetail(stackId, programId, seasonId);
      setDetail(data);
    } catch (err) {
      setDetail(null);
      setError(err as ApiError);
    } finally {
      setLoading(false);
    }
  }, [stackId, programId, seasonId]);

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  const handleWatch = async (video: SeasonVideoCard) => {
    if (!video.manifest_hint) {
      window.alert("No manifest is available for this video.");
      return;
    }

    setWatchLoadingId(video.id);
    try {
      const keys = await getDecryptionKeys({
        contentId: video.id,
        manifestUrl: video.manifest_hint,
        contentType: "streaming",
        channelTag: detail?.channel_tag,
      });
      window.alert(
        `Decryption keys for ${video.title}\n\n${keys.joinedKeys}\n\nDRM content ID: ${keys.drmContentId}`
      );
    } catch (err) {
      const apiErr = err as ApiError;
      window.alert(`Key generation failed: ${apiErr.message}`);
    } finally {
      setWatchLoadingId(null);
    }
  };

  const featured = detail?.videos[0];

  return (
    <div className="w-full px-4 py-8 sm:px-6 lg:px-8">
      <Link
        href="/?section=sport"
        className="mb-6 inline-flex items-center gap-2 text-sm text-gray-400 transition-colors hover:text-white"
      >
        ← Back to Sport
      </Link>

      <ErrorBanner error={error} />

      {loading && <LoadingGrid count={1} />}

      {!loading && detail && (
        <div className="space-y-8">
          <section className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-orange-950/40 via-surface-raised to-black">
            <div className="grid gap-8 p-6 md:grid-cols-[1.1fr_0.9fr] md:p-10">
              <div className="flex flex-col justify-end">
                {detail.channel_name && (
                  <p className="mb-2 text-xs uppercase tracking-wide text-gray-400">
                    {detail.channel_name}
                    {detail.channel_tag ? ` · ${detail.channel_tag}` : ""}
                  </p>
                )}
                <h1 className="text-3xl font-bold text-cyan-300 md:text-4xl">{detail.title}</h1>
                {detail.genre && (
                  <p className="mt-2 text-sm text-gray-400">Sport | {detail.genre}</p>
                )}
                {detail.synopsis && (
                  <p className="mt-4 max-w-2xl text-base font-medium text-white">{detail.synopsis}</p>
                )}
                {featured && (
                  <div className="mt-6">
                    <button
                      type="button"
                      onClick={() => handleWatch(featured)}
                      disabled={watchLoadingId !== null}
                      className="inline-flex items-center gap-2 rounded-lg bg-cyan-500 px-6 py-3 text-sm font-semibold text-black transition-colors hover:bg-cyan-400 disabled:opacity-50"
                    >
                      {watchLoadingId === featured.id ? "Generating keys…" : "Watch"}
                    </button>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-center">
                {(detail.image || featured?.image) && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={detail.image || featured?.image}
                    alt={detail.title}
                    className="max-h-72 w-full rounded-xl object-contain"
                  />
                )}
              </div>
            </div>
          </section>

          {detail.videos.length > 1 && (
            <section className="space-y-4">
              <h2 className="text-lg font-semibold text-white">More from this event</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                {detail.videos.slice(1).map((video) => (
                  <article
                    key={video.id}
                    className="overflow-hidden rounded-xl border border-white/10 bg-surface-raised"
                  >
                    {video.image && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={video.image}
                        alt={video.title}
                        className="aspect-video w-full object-cover"
                      />
                    )}
                    <div className="flex items-center justify-between gap-3 p-4">
                      <div>
                        <h3 className="font-medium text-white">{video.title}</h3>
                        {video.duration && (
                          <p className="mt-1 text-xs text-gray-400">{video.duration}</p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleWatch(video)}
                        disabled={watchLoadingId !== null}
                        className="shrink-0 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
                      >
                        {watchLoadingId === video.id ? "…" : "Watch"}
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
