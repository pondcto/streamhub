"use client";

import Link from "next/link";
import type { CatalogCard, CatalogRail } from "@/lib/types";
import { parseSeasonRoute, seasonDetailPath, isLiveCard, buildLiveWatchHref } from "@/lib/sport-routes";

interface SportRailRowProps {
  rail: CatalogRail;
  onWatchStream?: (item: CatalogCard) => void;
}

function cardAspect(layout: CatalogRail["layout"]): string {
  if (layout === "portrait") return "aspect-[2/3]";
  if (layout === "category") return "aspect-video";
  return "aspect-video";
}

function cardWidth(layout: CatalogRail["layout"]): string {
  if (layout === "portrait") return "w-36 sm:w-40";
  if (layout === "category") return "w-64 sm:w-72 md:w-80";
  return "w-56 sm:w-64";
}

function SportCard({
  item,
  layout,
  onWatchStream,
}: {
  item: CatalogCard;
  layout: CatalogRail["layout"];
  onWatchStream?: (item: CatalogCard) => void;
}) {
  const seasonRoute = parseSeasonRoute(item);
  const detailHref = seasonRoute ? seasonDetailPath(seasonRoute) : undefined;
  const isLive = isLiveCard(item);
  const watchHref = isLive ? buildLiveWatchHref(item) : detailHref;

  const inner = (
    <>
      <div className={`relative overflow-hidden rounded-xl bg-surface-overlay ${cardAspect(layout)}`}>
        {item.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.image}
            alt={item.title}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-gray-500">
            No image
          </div>
        )}
      </div>
      {layout !== "category" && (
        <p className="mt-2 line-clamp-2 text-sm font-medium text-white">{item.title}</p>
      )}
      {layout === "category" && (
        <div className="absolute inset-x-0 bottom-0 rounded-b-xl bg-gradient-to-t from-black via-black/70 to-transparent px-4 py-5">
          <p className="text-base font-bold text-white drop-shadow-sm">{item.title}</p>
        </div>
      )}
    </>
  );

  const className = `group shrink-0 ${cardWidth(layout)} ${layout === "category" ? "relative" : ""} card-hover`;

  if (watchHref) {
    return (
      <Link href={watchHref} className={className}>
        {inner}
      </Link>
    );
  }

  return (
    <button type="button" className={`${className} text-left`} onClick={() => onWatchStream?.(item)}>
      {inner}
    </button>
  );
}

export default function SportRailRow({ rail, onWatchStream }: SportRailRowProps) {
  if (rail.items.length === 0) return null;

  return (
    <section className="space-y-3">
      <h3 className="text-lg font-semibold text-white">{rail.title}</h3>
      <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-thin">
        {rail.items.map((item) => (
          <SportCard
            key={`${rail.id}-${item.id}`}
            item={item}
            layout={rail.layout}
            onWatchStream={onWatchStream}
          />
        ))}
      </div>
    </section>
  );
}
