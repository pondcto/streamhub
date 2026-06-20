"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export default function SearchBar({
  value,
  onChange,
  placeholder = "Search streams, channels or IDs…",
}: SearchBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);

  // Press "/" anywhere (outside a field) to jump into search.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = document.activeElement as HTMLElement | null;
      const typing =
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        Boolean(el?.isContentEditable);
      if (!typing) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div
      className={cn(
        "relative rounded-xl transition-shadow duration-200",
        focused && "shadow-glow"
      )}
    >
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-content-faint">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.8}
          stroke="currentColor"
          className="h-4 w-4"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="m21 21-4.35-4.35m1.85-4.4a6.25 6.25 0 1 1-12.5 0 6.25 6.25 0 0 1 12.5 0Z"
          />
        </svg>
      </span>

      <input
        ref={inputRef}
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={placeholder}
        aria-label="Search"
        className="w-full rounded-xl border border-white/10 bg-surface-raised/70 py-2.5 pl-10 pr-12 text-sm text-white backdrop-blur-md transition-colors placeholder:text-content-faint focus:border-accent/50 focus:outline-none"
      />

      {value ? (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Clear search"
          className="absolute right-3 top-1/2 -translate-y-1/2 text-content-faint transition-colors hover:text-white"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.8}
            stroke="currentColor"
            className="h-4 w-4"
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
      ) : (
        <kbd
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 select-none rounded border border-white/10 bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-content-faint transition-opacity sm:block",
            focused && "opacity-0"
          )}
        >
          /
        </kbd>
      )}
    </div>
  );
}
