"use client";

import Link from "next/link";
import type { ContentItem } from "@/lib/types";

interface ContentCardProps {
  item: ContentItem;
  onWatch?: (item: ContentItem) => void | Promise<void>;
  watchLoading?: boolean;
}

export default function ContentCard({ item, onWatch, watchLoading = false }: ContentCardProps) {
  const params = new URLSearchParams({ type: item.contentType });
  if (item.channelTag) params.set("channelTag", item.channelTag);
  if (item.manifestHint) params.set("manifestHint", item.manifestHint);
  const watchHref = `/watch/${encodeURIComponent(item.id)}?${params.toString()}`;

  const watchButtonClass =
    "shrink-0 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50";

  return (
    <article className="group card-hover flex flex-col overflow-hidden rounded-xl bg-surface-raised border border-white/5">
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
          <div className="min-w-0">
            {item.duration && (
              <p className="truncate text-xs text-gray-500">{item.duration}</p>
            )}
            <p className="truncate font-mono text-[10px] text-gray-600">ID: {item.id}</p>
          </div>
          {onWatch ? (
            <button
              type="button"
              onClick={() => onWatch(item)}
              disabled={watchLoading}
              className={watchButtonClass}
            >
              {watchLoading ? "Loading…" : "Watch"}
            </button>
          ) : (
            <Link href={watchHref} className={watchButtonClass}>
              Watch
            </Link>
          )}
        </div>
      </div>
    </article>
  );
}
