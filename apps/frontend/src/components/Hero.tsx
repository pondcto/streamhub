"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";

import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import type { ContentItem } from "@/lib/types";

const ROTATE_MS = 7000;

function PlayGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5" aria-hidden="true">
      <path d="M8 5.14v13.72a1 1 0 0 0 1.54.84l10.79-6.86a1 1 0 0 0 0-1.68L9.54 4.3A1 1 0 0 0 8 5.14Z" />
    </svg>
  );
}

function InfoGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-5 w-5" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path strokeLinecap="round" d="M12 11v5M12 8h.01" />
    </svg>
  );
}

interface HeroProps {
  items: ContentItem[];
  onPlay: (item: ContentItem) => void;
}

/** Auto-rotating featured spotlight with crossfade. Pauses on hover. */
export default function Hero({ items, onPlay }: HeroProps) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const count = items.length;

  useEffect(() => {
    setIndex(0);
    setExpanded(false);
  }, [count]);

  useEffect(() => {
    if (paused || count <= 1) return;
    const t = window.setInterval(() => setIndex((i) => (i + 1) % count), ROTATE_MS);
    return () => window.clearInterval(t);
  }, [paused, count]);

  if (count === 0) return null;
  const item = items[Math.min(index, count - 1)];
  const isLive = item.category === "Live" || Boolean(item.channelTag);

  return (
    <section
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      className="relative h-[58vh] min-h-[400px] max-h-[560px] w-full overflow-hidden rounded-3xl border border-white/10 shadow-pop"
      aria-roledescription="carousel"
      aria-label="Featured"
    >
      {/* Background crossfade */}
      <AnimatePresence initial={false}>
        <motion.div
          key={item.id}
          initial={{ opacity: 0, scale: 1.06 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="absolute inset-0"
        >
          {item.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.image} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="h-full w-full bg-gradient-to-br from-slate-700 via-slate-800 to-slate-900" />
          )}
        </motion.div>
      </AnimatePresence>

      {/* Cinematic scrims */}
      <div className="absolute inset-0 bg-gradient-to-r from-surface via-surface/50 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-t from-surface via-surface/10 to-transparent" />

      {/* Content */}
      <div className="absolute inset-0 flex flex-col justify-end p-6 sm:p-10 lg:p-14">
        <AnimatePresence mode="wait">
          <motion.div
            key={item.id}
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            className="max-w-2xl"
          >
            <div className="mb-3 flex flex-wrap items-center gap-2">
              {isLive && (
                <Badge tone="live" dot pulse>
                  Live now
                </Badge>
              )}
              {item.channelNumber && <Badge tone="neutral">CH {item.channelNumber}</Badge>}
              <Badge tone="accent">{item.category}</Badge>
            </div>

            <h1 className="text-display-lg font-bold tracking-tightest text-white drop-shadow-lg sm:text-display-xl">
              {item.title}
            </h1>

            {item.subtitle && (
              <p
                className={cn(
                  "mt-3 max-w-xl text-sm text-content-muted sm:text-base",
                  !expanded && "line-clamp-2"
                )}
              >
                {item.subtitle}
              </p>
            )}

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Button size="lg" onClick={() => onPlay(item)} leftIcon={<PlayGlyph />}>
                Play
              </Button>
              {item.subtitle && (
                <Button
                  variant="secondary"
                  size="lg"
                  onClick={() => setExpanded((v) => !v)}
                  leftIcon={<InfoGlyph />}
                  aria-expanded={expanded}
                >
                  More info
                </Button>
              )}
            </div>
          </motion.div>
        </AnimatePresence>

        {/* Slide indicators */}
        {count > 1 && (
          <div className="mt-7 flex items-center gap-2">
            {items.map((it, i) => (
              <button
                key={it.id}
                type="button"
                aria-label={`Show ${it.title}`}
                aria-current={i === index}
                onClick={() => setIndex(i)}
                className={cn(
                  "h-1.5 rounded-full transition-all duration-300",
                  i === index ? "w-7 bg-accent" : "w-1.5 bg-white/30 hover:bg-white/60"
                )}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
