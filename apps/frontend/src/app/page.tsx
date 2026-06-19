"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import CategoryTabs from "@/components/CategoryTabs";
import ContentCard from "@/components/ContentCard";
import ErrorBanner from "@/components/ErrorBanner";
import LoadingGrid from "@/components/LoadingGrid";
import StreamPlaybackModal from "@/components/StreamPlaybackModal";
import RequireAuth from "@/components/RequireAuth";
import { generateTestItemKeys, getTestVideos } from "@/lib/api";
import { resolveTestVideos, TEST_VIDEOS } from "@/lib/test-items";
import { useSearch } from "@/lib/search-context";
import type { ApiError, ContentItem, DashboardSection, DecryptionKeysResponse } from "@/lib/types";

function DashboardContent() {
  const { search } = useSearch();
  const [activeTab, setActiveTab] = useState<DashboardSection>("live");
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
        message: "This item has no manifest hint — decryption keys cannot be generated.",
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
      setKeysError(err as ApiError);
      setActiveItem(null);
    } finally {
      setWatchLoadingId(null);
    }
  }, []);

  const closeModal = useCallback(() => setModalOpen(false), []);

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
        message: "Could not refresh metadata — showing local catalog.",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadContent(); }, [loadContent]);

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
  const showItems = filtered.filter((item) => item.category !== "Live" && !item.channelTag);
  const displayItems = activeTab === "live" ? liveItems : showItems;

  return (
    <div className="w-full px-4 py-6 sm:px-6 lg:px-8">
      {/* Tabs */}
      <div className="mb-6">
        <CategoryTabs active={activeTab} onChange={setActiveTab} />
      </div>

      <ErrorBanner error={error} onDismiss={() => setError(null)} />
      <ErrorBanner error={keysError} onDismiss={() => setKeysError(null)} />

      {loading ? (
        <LoadingGrid />
      ) : displayItems.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-surface-raised px-6 py-16 text-center">
          <p className="text-gray-400">
            {search ? `No results for "${search}".` : "No content available."}
          </p>
        </div>
      ) : (
        <div className={
          activeTab === "live"
            ? "grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7"
            : "grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6"
        }>
          {displayItems.map((item) => (
            <ContentCard
              key={`${item.contentType}-${item.id}`}
              item={item}
              onWatch={handleTestWatch}
              watchLoading={watchLoadingId === item.id}
            />
          ))}
        </div>
      )}

      <StreamPlaybackModal
        open={modalOpen && Boolean(keysResult)}
        onClose={closeModal}
        title={activeItem?.title ?? "Stream"}
        channelTag={activeItem?.channelTag}
        contentId={activeItem?.id}
        contentType={activeItem?.contentType}
        manifestUrl={keysResult?.manifestUrl ?? ""}
        licenseUrl={keysResult?.licenseUrl ?? ""}
        sessionExpiresAt={keysResult?.sessionExpiresAt}
      />
    </div>
  );
}

export default function DashboardPage() {
  return (
    <RequireAuth>
      <DashboardContent />
    </RequireAuth>
  );
}
