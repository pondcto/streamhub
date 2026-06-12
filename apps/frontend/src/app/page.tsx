"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import CategoryTabs from "@/components/CategoryTabs";
import ContentCard from "@/components/ContentCard";
import DecryptionKeysPanel from "@/components/DecryptionKeysPanel";
import ErrorBanner from "@/components/ErrorBanner";
import LoadingGrid from "@/components/LoadingGrid";
import SearchBar from "@/components/SearchBar";
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
  const [keysTitle, setKeysTitle] = useState<string | null>(null);
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
    setKeysTitle(item.title);

    try {
      const keys = await generateTestItemKeys(item.id);
      setKeysResult(keys);
    } catch (err) {
      const apiErr = err as ApiError;
      setKeysError(apiErr);
      setKeysTitle(null);
    } finally {
      setWatchLoadingId(null);
    }
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
        (item.subtitle?.toLowerCase().includes(q) ?? false)
    );
  }, [items, search]);

  return (
    <div className="w-full px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Browse</h1>
        <p className="mt-1 text-sm text-gray-400">
          Test streams from authorized APIs. Watch fetches manifest, license URL, and decryption keys.
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
          <p className="text-gray-400">No test videos found.</p>
          {search && (
            <p className="mt-2 text-sm text-gray-500">Try a different search term.</p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:max-w-4xl">
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

      {keysResult && (
        <div className="mt-8 lg:max-w-4xl">
          {keysTitle && (
            <h2 className="mb-2 text-lg font-semibold text-white">{keysTitle}</h2>
          )}
          <DecryptionKeysPanel data={keysResult} />
          <dl className="mt-4 grid gap-3 rounded-xl border border-white/10 bg-surface-raised p-4 text-xs text-gray-400">
            <div>
              <dt className="text-gray-500">Manifest URL</dt>
              <dd className="mt-1 break-all font-mono text-[11px] text-gray-300">
                {keysResult.manifestUrl}
              </dd>
            </div>
            <div>
              <dt className="text-gray-500">License URL</dt>
              <dd className="mt-1 break-all font-mono text-[11px] text-gray-300">
                {keysResult.licenseUrl}
              </dd>
            </div>
          </dl>
        </div>
      )}
    </div>
  );
}

export default function DashboardPage() {
  return <DashboardContent />;
}
