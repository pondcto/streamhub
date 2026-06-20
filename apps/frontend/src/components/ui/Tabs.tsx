"use client";

import { motion } from "framer-motion";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface TabItem<T extends string> {
  id: T;
  label: string;
  icon?: ReactNode;
}

interface TabsProps<T extends string> {
  items: TabItem<T>[];
  active: T;
  onChange: (id: T) => void;
  /** Unique id so multiple Tabs instances don't share one sliding pill. */
  layoutId?: string;
  className?: string;
  "aria-label"?: string;
}

/** Pill tabs with a spring-animated active indicator that slides between items. */
export default function Tabs<T extends string>({
  items,
  active,
  onChange,
  layoutId = "tabs-indicator",
  className,
  "aria-label": ariaLabel,
}: TabsProps<T>) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-white/10 bg-surface-raised/60 p-1 backdrop-blur-md",
        className
      )}
    >
      {items.map((tab) => {
        const isActive = active === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(tab.id)}
            className={cn(
              "relative flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium transition-colors duration-200",
              isActive ? "text-white" : "text-content-muted hover:text-white"
            )}
          >
            {isActive && (
              <motion.span
                layoutId={layoutId}
                className="absolute inset-0 rounded-full bg-accent shadow-glow-accent"
                transition={{ type: "spring", stiffness: 380, damping: 32 }}
              />
            )}
            <span className="relative z-10 flex items-center gap-1.5">
              {tab.icon}
              {tab.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
