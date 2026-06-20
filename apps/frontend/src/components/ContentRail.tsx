"use client";

import { useRef, type ReactNode } from "react";

import ContentCard from "@/components/ContentCard";
import type { ContentItem } from "@/lib/types";

function Chevron({ dir }: { dir: "left" | "right" }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5" aria-hidden="true">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d={dir === "left" ? "M15 6 9 12l6 6" : "M9 6l6 6-6 6"}
      />
    </svg>
  );
}

interface ContentRailProps {
  title: string;
  items: ContentItem[];
  onWatch: (item: ContentItem) => void;
  icon?: ReactNode;
}

/** A titled, horizontally-scrollable row of content cards with hover scroll controls. */
export default function ContentRail({ title, items, onWatch, icon }: ContentRailProps) {
  const trackRef = useRef<HTMLDivElement>(null);

  const scroll = (dir: -1 | 1) => {
    const el = trackRef.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: "smooth" });
  };

  if (items.length === 0) return null;

  return (
    <section className="group/rail">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
          {icon}
          {title}
          <span className="text-sm font-normal text-content-faint">{items.length}</span>
        </h2>
        <div className="hidden gap-1 opacity-0 transition-opacity duration-200 group-hover/rail:opacity-100 sm:flex">
          {(["left", "right"] as const).map((dir) => (
            <button
              key={dir}
              type="button"
              onClick={() => scroll(dir === "left" ? -1 : 1)}
              aria-label={`Scroll ${dir}`}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-surface-overlay/80 text-content-muted backdrop-blur-md transition-colors hover:border-accent/40 hover:text-white"
            >
              <Chevron dir={dir} />
            </button>
          ))}
        </div>
      </div>

      <div
        ref={trackRef}
        className="scrollbar-hide rail-fade -mx-1 flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth px-1 pb-2"
      >
        {items.map((item, i) => (
          <div
            key={`${item.contentType}-${item.id}`}
            className="w-44 shrink-0 animate-fade-up snap-start sm:w-52 lg:w-60"
            style={{ animationDelay: `${Math.min(i * 60, 360)}ms` }}
          >
            <ContentCard item={item} onWatch={onWatch} />
          </div>
        ))}
      </div>
    </section>
  );
}
