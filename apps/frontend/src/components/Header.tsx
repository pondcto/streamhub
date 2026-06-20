"use client";

import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import SearchBar from "@/components/SearchBar";
import { buttonVariants } from "@/components/ui/Button";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/cn";
import { useSearch } from "@/lib/search-context";
import type { Account } from "@/lib/types";

function PlayMark() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      className="h-4 w-4 text-white"
      aria-hidden="true"
    >
      <path d="M8 5.14v13.72a1 1 0 0 0 1.54.84l10.79-6.86a1 1 0 0 0 0-1.68L9.54 4.3A1 1 0 0 0 8 5.14Z" />
    </svg>
  );
}

function UserMenu({ user, onLogout }: { user: Account; onLogout: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const label = user.display_name || user.email;
  const initial = label.trim().charAt(0).toUpperCase() || "U";

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 py-1 pl-1 pr-2.5 text-sm text-content-muted transition-colors hover:border-white/20 hover:text-white"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent-gradient text-xs font-bold text-white">
          {initial}
        </span>
        <span className="hidden max-w-[10rem] truncate sm:inline">{label}</span>
        <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 opacity-60" aria-hidden="true">
          <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.17l3.71-3.94a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0L5.21 8.27a.75.75 0 0 1 .02-1.06Z" clipRule="evenodd" />
        </svg>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            initial={{ opacity: 0, y: -6, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.96 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="absolute right-0 top-full mt-2 w-56 overflow-hidden rounded-xl border border-white/10 bg-surface-overlay/95 p-1 shadow-pop backdrop-blur-xl"
          >
            <div className="border-b border-white/10 px-3 py-2.5">
              <p className="truncate text-sm font-medium text-white">{label}</p>
              <p className="truncate text-xs text-content-faint">{user.email}</p>
            </div>
            {user.role === "admin" && (
              <Link
                href="/admin"
                role="menuitem"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-content-muted transition-colors hover:bg-white/5 hover:text-white"
              >
                Admin console
              </Link>
            )}
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onLogout();
              }}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-content-muted transition-colors hover:bg-white/5 hover:text-white"
            >
              Sign out
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function Header() {
  const { user, loading, logout } = useAuth();
  const { search, setSearch } = useSearch();
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);

  // The admin page has its own table-scoped search; hide the global one there.
  const showSearch = !pathname?.startsWith("/admin");

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "sticky top-0 z-50 border-b transition-all duration-300",
        scrolled
          ? "border-white/10 bg-surface/80 shadow-card backdrop-blur-xl"
          : "border-transparent bg-surface/30 backdrop-blur-md"
      )}
    >
      <div
        className={cn(
          "grid grid-cols-[auto_1fr_auto] items-center gap-4 px-4 transition-all duration-300 sm:px-6 lg:px-8",
          scrolled ? "py-2" : "py-3"
        )}
      >
        {/* Left: logo */}
        <Link href="/" className="group flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-accent-gradient shadow-glow transition-transform duration-300 group-hover:scale-105">
            <PlayMark />
          </span>
          <span className="text-xl font-bold tracking-tight text-white">
            Stream<span className="text-gradient">Hub</span>
          </span>
        </Link>

        {/* Center: search (hidden on admin) */}
        <div className="mx-auto w-full max-w-lg">
          {showSearch && (
            <SearchBar
              value={search}
              onChange={setSearch}
              placeholder="Search channels, shows…"
            />
          )}
        </div>

        {/* Right: user actions */}
        <div className="flex items-center gap-3">
          {!loading && user && <UserMenu user={user} onLogout={logout} />}
          {!loading && !user && (
            <Link href="/login" className={buttonVariants({ variant: "primary", size: "md" })}>
              Sign in
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
