"use client";

import { useCallback, useEffect, useState } from "react";
import ErrorBanner from "@/components/ErrorBanner";
import LoadingGrid from "@/components/LoadingGrid";
import SportHero from "@/components/sport/SportHero";
import SportRailRow from "@/components/sport/SportRailRow";
import { getDecryptionKeys, getSportPage } from "@/lib/api";
import { parseSeasonRoute, seasonDetailPath } from "@/lib/sport-routes";
import { SESSION_UPDATED_EVENT } from "@/lib/session-events";
import type { ApiError, CatalogCard, CatalogPageResponse } from "@/lib/types";
import { useRouter } from "next/navigation";

export default function SportBrowse() {
  const router = useRouter();
  const [page, setPage] = useState<CatalogPageResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);

  const loadPage = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getSportPage();
      setPage(data);
    } catch (err) {
      setPage(null);
      setError(err as ApiError);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPage();
  }, [loadPage]);

  useEffect(() => {
    const onSessionUpdated = () => loadPage();
    window.addEventListener(SESSION_UPDATED_EVENT, onSessionUpdated);
    return () => window.removeEventListener(SESSION_UPDATED_EVENT, onSessionUpdated);
  }, [loadPage]);

  const handleWatchStream = async (item: CatalogCard) => {
    const route = parseSeasonRoute(item);
    if (route) {
      router.push(seasonDetailPath(route));
      return;
    }

    if (!item.manifest_hint) {
      window.alert("No playback manifest is available for this item.");
      return;
    }

    try {
      const keys = await getDecryptionKeys({
        contentId: item.id,
        manifestUrl: item.manifest_hint,
        contentType: "streaming",
        channelTag: item.channel_tag,
      });
      window.alert(
        `Decryption keys for ${item.title}\n\n${keys.joinedKeys}\n\nDRM content ID: ${keys.drmContentId}`
      );
    } catch (err) {
      const apiErr = err as ApiError;
      window.alert(`Key generation failed: ${apiErr.message}`);
    }
  };

  if (loading) return <LoadingGrid />;

  const heroRail = page?.rails.find((rail) => rail.layout === "hero");
  const heroItem = heroRail?.items[0];
  const heroRoute = heroItem ? parseSeasonRoute(heroItem) : null;
  const contentRails = (page?.rails ?? []).filter((rail) => rail !== heroRail);

  return (
    <div className="space-y-8">
      <ErrorBanner error={error} onDismiss={() => setError(null)} />

      {page?.notice && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          {page.notice}
        </div>
      )}

      {heroItem && (
        <SportHero
          item={heroItem}
          detailHref={heroRoute ? seasonDetailPath(heroRoute) : undefined}
          onWatchStream={handleWatchStream}
        />
      )}

      {contentRails.map((rail) => (
        <SportRailRow key={rail.id} rail={rail} onWatchStream={handleWatchStream} />
      ))}

      {!heroItem && contentRails.length === 0 && (
        <div className="rounded-xl border border-white/10 bg-surface-raised px-6 py-16 text-center text-gray-400">
          No sport content available. Save catalog auth on the Admin page and refresh.
        </div>
      )}
    </div>
  );
}
