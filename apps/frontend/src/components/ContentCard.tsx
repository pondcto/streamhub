"use client";

import type { ContentItem } from "@/lib/types";

interface ContentCardProps {
  item: ContentItem;
  onWatch?: (item: ContentItem) => void | Promise<void>;
  watchLoading?: boolean;
}

function PlayIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-7 w-7 text-white" aria-hidden="true">
      <path d="M8 5.14v13.72a1 1 0 0 0 1.54.84l10.79-6.86a1 1 0 0 0 0-1.68L9.54 4.3A1 1 0 0 0 8 5.14Z" />
    </svg>
  );
}

function ThumbnailPlaceholder({ channelTag }: { channelTag?: string }) {
  return (
    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-700 via-slate-800 to-slate-900">
      {channelTag ? (
        <span className="font-mono text-2xl font-bold tracking-widest text-white/20 select-none">
          {channelTag}
        </span>
      ) : (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1} className="h-10 w-10 text-slate-600" aria-hidden="true">
          <rect x="2" y="3" width="20" height="14" rx="2" />
          <path d="M8 21h8M12 17v4" />
        </svg>
      )}
    </div>
  );
}

export default function ContentCard({ item, onWatch, watchLoading = false }: ContentCardProps) {
  const isLive = item.category === "Live" || Boolean(item.channelTag);

  return (
    <article
      className="group cursor-pointer select-none"
      onClick={() => !watchLoading && onWatch?.(item)}
    >
      {/* Thumbnail */}
      <div className="relative aspect-video overflow-hidden rounded-xl bg-slate-900">
        {item.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.image}
            alt={item.title}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <ThumbnailPlaceholder channelTag={item.channelTag} />
        )}

        {/* Bottom gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />

        {/* Channel number — top-left */}
        {item.channelNumber && (
          <span className="absolute left-2 top-2 rounded bg-black/60 px-1.5 py-0.5 font-mono text-[11px] font-bold text-white backdrop-blur-sm">
            {item.channelNumber}
          </span>
        )}

        {/* Category badge — top-left for VOD (no channel number) */}
        {!item.channelNumber && (
          <span className="absolute left-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-gray-200 backdrop-blur-sm">
            {item.category}
          </span>
        )}

        {/* Live badge — bottom-left */}
        {isLive && (
          <span className="absolute bottom-2 left-2 flex items-center gap-1 rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
            <span className="inline-flex h-1 w-1 rounded-full bg-white" />
            Live
          </span>
        )}

        {/* Play button overlay — hover */}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-200 group-hover:opacity-100">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-white/15 ring-2 ring-white/30 backdrop-blur-sm">
            <PlayIcon />
          </div>
        </div>

        {/* Loading spinner */}
        {watchLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          </div>
        )}
      </div>

      {/* Card info */}
      <div className="mt-2 px-0.5">
        <p className="truncate text-[13px] font-semibold text-white">
          Sports Variety
        </p>
        {item.channelTag && (
          <p className="mt-0.5 font-mono text-[10px] text-gray-500">{item.channelTag}</p>
        )}
        {!item.channelTag && item.subtitle && (
          <p className="mt-0.5 line-clamp-1 text-[11px] text-gray-500">{item.subtitle}</p>
        )}
      </div>
    </article>
  );
}
