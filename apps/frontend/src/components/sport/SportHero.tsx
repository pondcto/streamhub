"use client";

import Link from "next/link";
import type { CatalogCard } from "@/lib/types";
import { isLiveCard, buildLiveWatchHref } from "@/lib/sport-routes";

interface SportHeroProps {
  item: CatalogCard;
  detailHref?: string;
  onWatchStream?: (item: CatalogCard) => void;
}

export default function SportHero({ item, detailHref, onWatchStream }: SportHeroProps) {
  const isLive = isLiveCard(item);

  const watchHref = isLive ? buildLiveWatchHref(item) : detailHref;

  return (
    <section className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-red-950/80 via-surface-raised to-black">
      <div className="grid min-h-[280px] gap-6 p-6 md:grid-cols-[1.2fr_0.8fr] md:p-8 lg:min-h-[340px]">
        <div className="relative z-10 flex flex-col justify-end">
          {(item.channel_tag || item.channel_number) && (
            <p className="mb-2 text-xs uppercase tracking-wide text-gray-400">
              {item.channel_number ? `Ch ${item.channel_number}` : item.category}
              {item.channel_tag ? ` · ${item.channel_tag}` : ""}
            </p>
          )}
          <h2 className="text-2xl font-bold text-white md:text-4xl">{item.title}</h2>
          {item.description && (
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-gray-300 md:text-base">
              {item.description}
            </p>
          )}
          {item.duration && (
            <p className="mt-2 text-sm text-cyan-300">
              {isLive && <span className="mr-2 inline-flex rounded bg-red-600 px-2 py-0.5 text-xs font-semibold text-white">Live</span>}
              {item.duration}
            </p>
          )}
          <div className="mt-6 flex flex-wrap gap-3">
            {watchHref ? (
              <Link
                href={watchHref}
                className="inline-flex items-center gap-2 rounded-lg bg-cyan-500 px-5 py-2.5 text-sm font-semibold text-black transition-colors hover:bg-cyan-400"
              >
                {isLive ? "Watch Live" : "View Details"}
              </Link>
            ) : (
              <button
                type="button"
                onClick={() => onWatchStream?.(item)}
                className="inline-flex items-center gap-2 rounded-lg bg-cyan-500 px-5 py-2.5 text-sm font-semibold text-black transition-colors hover:bg-cyan-400"
              >
                Watch
              </button>
            )}
          </div>
        </div>

        <div className="relative flex items-center justify-center">
          {item.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.image}
              alt={item.title}
              className="max-h-52 w-full rounded-xl object-contain md:max-h-64"
            />
          ) : (
            <div className="flex h-40 w-full items-center justify-center rounded-xl bg-white/5 text-gray-500">
              No image
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
