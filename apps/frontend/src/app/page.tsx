"use client";



import { useCallback, useEffect, useMemo, useState } from "react";

import CategoryTabs from "@/components/CategoryTabs";

import ContentCard from "@/components/ContentCard";

import ErrorBanner from "@/components/ErrorBanner";

import LoadingGrid from "@/components/LoadingGrid";

import SearchBar from "@/components/SearchBar";

import StreamPlaybackModal from "@/components/StreamPlaybackModal";

import { generateTestItemKeys, getTestVideos } from "@/lib/api";

import { resolveTestVideos, TEST_VIDEOS } from "@/lib/test-items";

import type { ApiError, ContentItem, DecryptionKeysResponse } from "@/lib/types";



function DashboardContent() {

  const [search, setSearch] = useState("");

  const [items, setItems] = useState<ContentItem[]>([]);

  const [loading, setLoading] = useState(true);

  const [error, setError] = useState<ApiError | null>(null);

  const [watchLoadingId, setWatchLoadingId] = useState<string | null>(null);

  const [keysResult, setKeysResult] = useState<DecryptionKeysResponse | null>(null);

  const [modalOpen, setModalOpen] = useState(false);

  const [activeItem, setActiveItem] = useState<ContentItem | null>(null);

  const [keysError, setKeysError] = useState<ApiError | null>(null);



  const handleTestWatch = useCallback(async (item: ContentItem) => {

    if (!item.manifestHint) {

      setKeysError({

        code: "MANIFEST_REQUIRED",

        message: "This test item has no manifest hint — decryption keys cannot be generated.",

      });

      return;

    }



    setWatchLoadingId(item.id);

    setKeysError(null);

    setKeysResult(null);

    setActiveItem(item);



    try {

      const keys = await generateTestItemKeys(item.id);

      setKeysResult(keys);

      setModalOpen(true);

    } catch (err) {

      const apiErr = err as ApiError;

      setKeysError(apiErr);

      setActiveItem(null);

    } finally {

      setWatchLoadingId(null);

    }

  }, []);



  const closeModal = useCallback(() => {

    setModalOpen(false);

  }, []);



  const loadContent = useCallback(async () => {

    setLoading(true);

    setError(null);

    try {

      const data = await getTestVideos();

      setItems(resolveTestVideos(data.items));

    } catch {

      setItems(TEST_VIDEOS);

      setError({

        code: "TEST_VIDEOS_FAILED",

        message: "Could not refresh test video metadata — showing local test catalog.",

      });

    } finally {

      setLoading(false);

    }

  }, []);



  useEffect(() => {

    loadContent();

  }, [loadContent]);



  const filtered = useMemo(() => {

    const q = search.trim().toLowerCase();

    if (!q) return items;

    return items.filter(

      (item) =>

        item.title.toLowerCase().includes(q) ||

        item.category.toLowerCase().includes(q) ||

        item.id.toLowerCase().includes(q) ||

        (item.channelTag?.toLowerCase().includes(q) ?? false) ||

        (item.subtitle?.toLowerCase().includes(q) ?? false)

    );

  }, [items, search]);



  const liveItems = filtered.filter((item) => item.category === "Live" || item.channelTag);

  const otherItems = filtered.filter((item) => item.category !== "Live" && !item.channelTag);



  return (

    <div className="w-full px-4 py-8 sm:px-6 lg:px-8">

      <div className="mb-8">

        <h1 className="text-2xl font-bold text-white">Live streams</h1>

        <p className="mt-1 text-sm text-gray-400">

          Select a channel and press Watch to fetch the signed manifest and license server URL.

        </p>

      </div>



      <div className="mb-6 space-y-4">

        <SearchBar value={search} onChange={setSearch} />

        <CategoryTabs active="test" onChange={() => {}} />

      </div>



      <ErrorBanner error={error} onDismiss={() => setError(null)} />

      <ErrorBanner error={keysError} onDismiss={() => setKeysError(null)} />



      {loading ? (

        <LoadingGrid />

      ) : filtered.length === 0 ? (

        <div className="rounded-xl border border-white/10 bg-surface-raised px-6 py-16 text-center">

          <p className="text-gray-400">No streams found.</p>

          {search && (

            <p className="mt-2 text-sm text-gray-500">Try a different search term.</p>

          )}

        </div>

      ) : (

        <div className="space-y-8">

          {liveItems.length > 0 && (

            <section>

              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">

                Channels ({liveItems.length})

              </h2>

              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-3">

                {liveItems.map((item) => (

                  <ContentCard

                    key={`${item.contentType}-${item.id}`}

                    item={item}

                    onWatch={handleTestWatch}

                    watchLoading={watchLoadingId === item.id}

                  />

                ))}

              </div>

            </section>

          )}



          {otherItems.length > 0 && (

            <section>

              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">

                On demand

              </h2>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">

                {otherItems.map((item) => (

                  <ContentCard

                    key={`${item.contentType}-${item.id}`}

                    item={item}

                    onWatch={handleTestWatch}

                    watchLoading={watchLoadingId === item.id}

                  />

                ))}

              </div>

            </section>

          )}

        </div>

      )}



      <StreamPlaybackModal

        open={modalOpen && Boolean(keysResult)}

        onClose={closeModal}

        title={activeItem?.title ?? "Stream"}

        channelTag={activeItem?.channelTag}

        manifestUrl={keysResult?.manifestUrl ?? ""}

        licenseUrl={keysResult?.licenseUrl ?? ""}

        sessionExpiresAt={keysResult?.sessionExpiresAt}

      />

    </div>

  );

}



export default function DashboardPage() {

  return <DashboardContent />;

}


