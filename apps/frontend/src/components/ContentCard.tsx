"use client";

import type { ContentItem } from "@/lib/types";

interface ContentCardProps {
  item: ContentItem;
  onWatch?: (item: ContentItem) => void | Promise<void>;
  watchLoading?: boolean;
}

export default function ContentCard({ item, onWatch, watchLoading = false }: ContentCardProps) {
  const isLive = item.category === "Live" || Boolean(item.channelTag);
  const watchButtonClass =
    "shrink-0 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50";

  if (isLive) {
    return (
      <article className="group flex items-center gap-4 rounded-xl border border-white/5 bg-surface-raised p-4 transition-colors hover:border-accent/30 hover:bg-surface-overlay/80">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-surface-overlay ring-1 ring-white/10">
          <span className="relative flex h-3 w-3">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-40" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-red-500" />
          </span>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate font-semibold text-white">{item.title}</h3>
            {item.channelTag && (
              <span className="rounded bg-white/10 px-2 py-0.5 font-mono text-[10px] text-gray-300">
                {item.channelTag}
              </span>
            )}
          </div>
          {item.subtitle && (
            <p className="mt-1 truncate text-xs text-gray-500">{item.subtitle}</p>
          )}
        </div>

        {onWatch && (
          <button
            type="button"
            onClick={() => onWatch(item)}
            disabled={watchLoading}
            className={watchButtonClass}
          >
            {watchLoading ? "Loading…" : "Watch"}
          </button>
        )}
      </article>
    );
  }

  return (
    <article className="group card-hover flex flex-col overflow-hidden rounded-xl border border-white/5 bg-surface-raised">
      <div className="relative aspect-[16/9] overflow-hidden bg-surface-overlay">
        {item.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.image}
            alt={item.title}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-slate-800 text-slate-400">
            No image
          </div>
        )}
        <span className="absolute left-2 top-2 rounded bg-black/70 px-2 py-0.5 text-xs text-gray-300">
          {item.category}
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <h3 className="line-clamp-2 font-semibold text-white">{item.title}</h3>
        {item.subtitle && (
          <p className="line-clamp-2 text-xs text-gray-400">{item.subtitle}</p>
        )}
        <div className="mt-auto flex items-center justify-between gap-2 pt-2">
          <p className="truncate font-mono text-[10px] text-gray-600">ID: {item.id}</p>
          {onWatch && (
            <button
              type="button"
              onClick={() => onWatch(item)}
              disabled={watchLoading}
              className={watchButtonClass}
            >
              {watchLoading ? "Loading…" : "Watch"}
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
