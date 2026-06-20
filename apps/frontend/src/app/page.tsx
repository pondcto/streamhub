"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import CategoryTabs from "@/components/CategoryTabs";
import ContentCard from "@/components/ContentCard";
import ContentRail from "@/components/ContentRail";
import ErrorBanner from "@/components/ErrorBanner";
import Hero from "@/components/Hero";
import LoadingGrid from "@/components/LoadingGrid";
import RequireAuth from "@/components/RequireAuth";
import Skeleton from "@/components/ui/Skeleton";
import { getTestVideos } from "@/lib/api";
import { resolveTestVideos, TEST_VIDEOS } from "@/lib/test-items";
import { useSearch } from "@/lib/search-context";
import type { ApiError, ContentItem, DashboardSection } from "@/lib/types";

interface Rail {
  key: string;
  title: string;
  items: ContentItem[];
}

/** Group a tab's items into titled rails. */
function buildRails(items: ContentItem[], tab: DashboardSection): Rail[] {
  if (tab === "live") {
    const supersport = items.filter((i) => i.title.startsWith("SuperSport"));
    const others = items.filter((i) => !i.title.startsWith("SuperSport"));
    return [
      { key: "supersport", title: "SuperSport", items: supersport },
      { key: "international", title: "International", items: others },
    ].filter((r) => r.items.length > 0);
  }
  // Shows: group by category.
  const byCategory = new Map<string, ContentItem[]>();
  for (const item of items) {
    const key = item.category || "Shows";
    const bucket = byCategory.get(key);
    if (bucket) bucket.push(item);
    else byCategory.set(key, [item]);
  }
  return Array.from(byCategory.entries()).map(([title, catItems]) => ({
    key: title,
    title,
    items: catItems,
  }));
}

function DashboardSkeleton() {
  return (
    <div className="space-y-10">
      <Skeleton className="h-[58vh] min-h-[400px] max-h-[560px] w-full rounded-3xl" />
      <LoadingGrid count={6} />
    </div>
  );
}

function DashboardContent() {
  const { search } = useSearch();
  const [activeTab, setActiveTab] = useState<DashboardSection>("live");
  const [items, setItems] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [keysError, setKeysError] = useState<ApiError | null>(null);

  // Open playback in a new full-screen tab. The /play page generates keys and
  // starts the restream itself; we open it synchronously on click so popup
  // blockers don't fire while we'd otherwise be awaiting a request.
  const handleWatch = useCallback((item: ContentItem) => {
    if (!item.manifestHint) {
      setKeysError({
        code: "MANIFEST_REQUIRED",
        message: "This item has no manifest hint — decryption keys cannot be generated.",
      });
      return;
    }

    setKeysError(null);
    const params = new URLSearchParams({ type: item.contentType, title: item.title });
    if (item.channelTag) params.set("channelTag", item.channelTag);
    window.open(
      `/play/${encodeURIComponent(item.id)}?${params.toString()}`,
      "_blank",
      "noopener"
    );
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
        message: "Could not refresh metadata — showing local catalog.",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadContent();
  }, [loadContent]);

  const liveItems = useMemo(
    () => items.filter((item) => item.category === "Live" || item.channelTag),
    [items]
  );
  const showItems = useMemo(
    () => items.filter((item) => item.category !== "Live" && !item.channelTag),
    [items]
  );
  const tabItems = activeTab === "live" ? liveItems : showItems;

  const query = search.trim().toLowerCase();
  const searchResults = useMemo(() => {
    if (!query) return [];
    return tabItems.filter(
      (item) =>
        item.title.toLowerCase().includes(query) ||
        item.category.toLowerCase().includes(query) ||
        item.id.toLowerCase().includes(query) ||
        (item.channelTag?.toLowerCase().includes(query) ?? false) ||
        (item.subtitle?.toLowerCase().includes(query) ?? false)
    );
  }, [tabItems, query]);

  const featured = useMemo(() => tabItems.filter((i) => i.image).slice(0, 6), [tabItems]);
  const rails = useMemo(() => buildRails(tabItems, activeTab), [tabItems, activeTab]);

  return (
    <div className="w-full px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-6 flex items-center justify-between gap-4">
        <CategoryTabs active={activeTab} onChange={setActiveTab} />
      </div>

      <ErrorBanner error={error} onDismiss={() => setError(null)} />
      <ErrorBanner error={keysError} onDismiss={() => setKeysError(null)} />

      {loading ? (
        <DashboardSkeleton />
      ) : query ? (
        /* Search results */
        searchResults.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-surface-raised/60 px-6 py-20 text-center">
            <p className="text-content-muted">No results for &ldquo;{search}&rdquo;.</p>
          </div>
        ) : (
          <div>
            <p className="mb-4 text-sm text-content-faint">
              {searchResults.length} result{searchResults.length === 1 ? "" : "s"} for &ldquo;
              {search}&rdquo;
            </p>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
              {searchResults.map((item) => (
                <ContentCard
                  key={`${item.contentType}-${item.id}`}
                  item={item}
                  onWatch={handleWatch}
                />
              ))}
            </div>
          </div>
        )
      ) : tabItems.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-surface-raised/60 px-6 py-20 text-center">
          <p className="text-content-muted">No content available.</p>
        </div>
      ) : (
        /* Browse: hero + rails */
        <div className="space-y-10">
          {featured.length > 0 && (
            <div className="animate-fade-in">
              <Hero items={featured} onPlay={handleWatch} />
            </div>
          )}
          <div className="space-y-10">
            {rails.map((rail) => (
              <ContentRail
                key={rail.key}
                title={rail.title}
                items={rail.items}
                onWatch={handleWatch}
              />
            ))}
          </div>
        </div>
      )}
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
