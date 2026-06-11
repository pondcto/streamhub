"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import CategoryTabs from "@/components/CategoryTabs";
import ContentCard from "@/components/ContentCard";
import ErrorBanner from "@/components/ErrorBanner";
import LoadingGrid from "@/components/LoadingGrid";
import SearchBar from "@/components/SearchBar";
import SportBrowse from "@/components/sport/SportBrowse";
import {
  catalogToContentItem,
  generateTestItemKeys,
  getCatalog,
  getLiveChannels,
  getTestVideos,
  liveToContentItem,
  testVideoToContentItem,
} from "@/lib/api";
import { SESSION_UPDATED_EVENT } from "@/lib/session-events";
import type { ApiError, ContentItem, DashboardSection } from "@/lib/types";

const VALID_SECTIONS: DashboardSection[] = [
  "home",
  "live",
  "movies",
  "sport",
  "tvshows",
  "kids",
  "test",
];

function DashboardContent() {
  const searchParams = useSearchParams();
  const initialSection = searchParams.get("section");
  const [section, setSection] = useState<DashboardSection>(() => {
    if (initialSection && VALID_SECTIONS.includes(initialSection as DashboardSection)) {
      return initialSection as DashboardSection;
    }
    return "home";
  });
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<ContentItem[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
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

  const loadContent = useCallback(async (active: DashboardSection) => {
    if (active === "sport") {
      setLoading(false);
      setItems([]);
      setNotice(null);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      if (active === "test") {
        const data = await getTestVideos();
        setItems(data.items.map(testVideoToContentItem));
      } else if (active === "live") {
        const data = await getLiveChannels();
        setItems(data.items.map(liveToContentItem));
      } else {
        const data = await getCatalog(active);
        setItems(data.items.map(catalogToContentItem));
        if (data.notice) setNotice(data.notice);
      }
    } catch (err) {
      setItems([]);
      if (active === "test") {
        setError({
          code: "TEST_VIDEOS_FAILED",
          message: "Could not load test videos.",
        });
      } else {
        setError(err as ApiError);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadContent(section);
  }, [section, loadContent]);

  useEffect(() => {
    const onSessionUpdated = () => loadContent(section);
    window.addEventListener(SESSION_UPDATED_EVENT, onSessionUpdated);
    return () => window.removeEventListener(SESSION_UPDATED_EVENT, onSessionUpdated);
  }, [section, loadContent]);

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
          Catalog metadata from authorized APIs. Playback requires entitlement.
        </p>
      </div>

      <div className="mb-6 space-y-4">
        {section !== "sport" && <SearchBar value={search} onChange={setSearch} />}
        <CategoryTabs active={section} onChange={setSection} />
      </div>

      {section === "sport" ? (
        <SportBrowse />
      ) : (
        <>
          <ErrorBanner error={error} onDismiss={() => setError(null)} />

          {notice && !loading && (
            <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
              {notice}
            </div>
          )}

          {loading ? (
            <LoadingGrid />
          ) : filtered.length === 0 ? (
            <div className="rounded-xl border border-white/10 bg-surface-raised px-6 py-16 text-center">
              <p className="text-gray-400">No content found for this section.</p>
              {search && (
                <p className="mt-2 text-sm text-gray-500">
                  Try a different search term or category.
                </p>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
              {filtered.map((item) => (
                <ContentCard
                  key={`${item.contentType}-${item.id}`}
                  item={item}
                  onWatch={section === "test" ? handleTestWatch : undefined}
                  watchLoading={watchLoadingId === item.id}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<LoadingGrid />}>
      <DashboardContent />
    </Suspense>
  );
}
