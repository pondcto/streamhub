"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import CategoryTabs from "@/components/CategoryTabs";
import ContentCard from "@/components/ContentCard";
import ErrorBanner from "@/components/ErrorBanner";
import LoadingGrid from "@/components/LoadingGrid";
import SearchBar from "@/components/SearchBar";
import { generateTestItemKeys, getTestVideos, testVideoToContentItem } from "@/lib/api";
import type { ApiError, ContentItem } from "@/lib/types";

function DashboardContent() {
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [watchLoadingId, setWatchLoadingId] = useState<string | null>(null);

  const handleTestWatch = useCallback(async (item: ContentItem) => {
    if (!item.manifestHint) {
      window.alert("This test item has no manifest hint — decryption keys cannot be generated.");
      return;
    }

    setWatchLoadingId(item.id);
    try {
      const keys = await generateTestItemKeys(item.id);
      window.alert(
        `Decryption keys for ${item.title}\n\n${keys.joinedKeys}\n\nDRM content ID: ${keys.drmContentId}`
      );
    } catch (err) {
      const apiErr = err as ApiError;
      window.alert(`Key generation failed: ${apiErr.message}`);
    } finally {
      setWatchLoadingId(null);
    }
  }, []);

  const loadContent = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getTestVideos();
      setItems(data.items.map(testVideoToContentItem));
    } catch {
      setItems([]);
      setError({
        code: "TEST_VIDEOS_FAILED",
        message: "Could not load test videos.",
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
        (item.subtitle?.toLowerCase().includes(q) ?? false)
    );
  }, [items, search]);

  return (
    <div className="w-full px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Browse</h1>
        <p className="mt-1 text-sm text-gray-400">
          Test video metadata from authorized APIs. Playback requires entitlement.
        </p>
      </div>

      <div className="mb-6 space-y-4">
        <SearchBar value={search} onChange={setSearch} />
        <CategoryTabs active="test" onChange={() => {}} />
      </div>

      <ErrorBanner error={error} onDismiss={() => setError(null)} />

      {loading ? (
        <LoadingGrid />
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-surface-raised px-6 py-16 text-center">
          <p className="text-gray-400">No test videos found.</p>
          {search && (
            <p className="mt-2 text-sm text-gray-500">Try a different search term.</p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {filtered.map((item) => (
            <ContentCard
              key={`${item.contentType}-${item.id}`}
              item={item}
              onWatch={handleTestWatch}
              watchLoading={watchLoadingId === item.id}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function DashboardPage() {
  return <DashboardContent />;
}
