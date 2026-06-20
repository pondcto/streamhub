"use client";

import Badge from "@/components/ui/Badge";
import type { ContentItem } from "@/lib/types";

interface ContentCardProps {
  item: ContentItem;
  onWatch?: (item: ContentItem) => void | Promise<void>;
  watchLoading?: boolean;
}

function PlayIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6 text-white" aria-hidden="true">
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
  const meta = item.channelNumber
    ? `Channel ${item.channelNumber}`
    : item.channelTag ?? item.subtitle ?? item.category;

  const activate = () => {
    if (!watchLoading) onWatch?.(item);
  };

  return (
    <article className="group select-none">
      <div
        role="button"
        tabIndex={0}
        aria-label={`Play ${item.title}`}
        onClick={activate}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            activate();
          }
        }}
        className="relative aspect-video cursor-pointer overflow-hidden rounded-xl bg-surface-raised shadow-card outline-none ring-1 ring-white/10 transition-all duration-300 hover:-translate-y-1 hover:shadow-card-hover hover:ring-accent/40 focus-visible:ring-2 focus-visible:ring-accent"
      >
        {item.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.image}
            alt={item.title}
            className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-110"
            loading="lazy"
          />
        ) : (
          <ThumbnailPlaceholder channelTag={item.channelTag} />
        )}

        {/* Scrim — deepens on hover for legibility */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent opacity-90 transition-opacity duration-300 group-hover:opacity-100" />

        {/* Channel number — top-left */}
        {item.channelNumber && (
          <span className="absolute left-2 top-2 rounded-md bg-black/60 px-1.5 py-0.5 font-mono text-[11px] font-bold text-white backdrop-blur-sm">
            {item.channelNumber}
          </span>
        )}
        {!item.channelNumber && (
          <span className="absolute left-2 top-2 rounded-md bg-black/55 px-1.5 py-0.5 text-[10px] font-medium text-gray-200 backdrop-blur-sm">
            {item.category}
          </span>
        )}

        {/* Live badge — bottom-left */}
        {isLive && (
          <span className="absolute bottom-2 left-2">
            <Badge tone="live" dot pulse>
              Live
            </Badge>
          </span>
        )}

        {/* Hover play affordance */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden="true">
          <div className="flex h-12 w-12 scale-75 items-center justify-center rounded-full bg-accent/90 opacity-0 shadow-glow-accent ring-2 ring-white/30 backdrop-blur-sm transition-all duration-300 group-hover:scale-100 group-hover:opacity-100">
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
      <div className="mt-2.5 px-0.5">
        <p className="truncate text-sm font-semibold text-white transition-colors group-hover:text-accent-soft">
          {item.title}
        </p>
        <p className="mt-0.5 truncate text-[11px] text-content-faint">{meta}</p>
      </div>
    </article>
  );
}
