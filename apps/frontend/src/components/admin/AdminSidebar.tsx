"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, type ReactNode } from "react";

import Badge from "@/components/ui/Badge";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/cn";

export type AdminSection = "users" | "add" | "channels" | "schedule" | "profiles" | "settings";

export const SECTION_META: Record<AdminSection, { label: string; description: string }> = {
  users: { label: "User Management", description: "View accounts, manage roles, and invite teammates." },
  add: { label: "Add Channel", description: "Register a new channel in the catalog." },
  channels: { label: "Channel Management", description: "Start, stop, and inspect channel restreams." },
  schedule: { label: "Schedule", description: "Automate channel start and stop windows." },
  profiles: { label: "Proxy Profiles", description: "Create and manage outbound proxy profiles." },
  settings: { label: "Settings", description: "Playback defaults and session credentials." },
};

/** Sidebar order (distinct from the default landing section, which is "channels"). */
const NAV_ORDER: AdminSection[] = ["users", "channels", "schedule", "profiles", "settings"];

const ICONS: Record<AdminSection, ReactNode> = {
  users: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} className="h-[18px] w-[18px]" aria-hidden="true">
      <circle cx="9" cy="8" r="3.25" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.5 19a5.5 5.5 0 0 1 11 0M16 5.5a3 3 0 0 1 0 5.8M16.5 19a5.5 5.5 0 0 0-2-4.27" />
    </svg>
  ),
  add: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} className="h-[18px] w-[18px]" aria-hidden="true">
      <rect x="3" y="4.5" width="18" height="13" rx="2" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8.5v5M9.5 11h5M8 20.5h8" />
    </svg>
  ),
  channels: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} className="h-[18px] w-[18px]" aria-hidden="true">
      <rect x="3" y="4" width="8" height="7" rx="1.5" />
      <rect x="13" y="4" width="8" height="7" rx="1.5" />
      <rect x="3" y="13" width="8" height="7" rx="1.5" />
      <rect x="13" y="13" width="8" height="7" rx="1.5" />
    </svg>
  ),
  schedule: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} className="h-[18px] w-[18px]" aria-hidden="true">
      <rect x="3.5" y="5" width="17" height="15" rx="2" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.5 9.5h17M8 3.5v3M16 3.5v3" />
    </svg>
  ),
  profiles: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} className="h-[18px] w-[18px]" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
    </svg>
  ),
  settings: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} className="h-[18px] w-[18px]" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.4 13.5a1.6 1.6 0 0 0 .32 1.77l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.6 1.6 0 0 0-2.7 1.13V20a2 2 0 1 1-4 0v-.07a1.6 1.6 0 0 0-2.7-1.13l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.6 1.6 0 0 0 4.6 13.5H4.5a2 2 0 1 1 0-4h.07a1.6 1.6 0 0 0 1.13-2.7l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.6 1.6 0 0 0 11.5 4.6V4.5a2 2 0 1 1 4 0v.07a1.6 1.6 0 0 0 2.7 1.13l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.6 1.6 0 0 0-.43 1.77Z" />
    </svg>
  ),
};

interface NavListProps {
  active: AdminSection;
  onNavigate: (id: AdminSection) => void;
  runningCount: number;
  /** Unique per instance so the desktop rail and mobile drawer don't share one indicator. */
  indicatorId: string;
}

function NavList({ active, onNavigate, runningCount, indicatorId }: NavListProps) {
  return (
    <nav aria-label="Admin" className="space-y-1">
      {NAV_ORDER.map((id) => {
        const isActive = active === id;
        const showBadge = id === "channels" && runningCount > 0;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onNavigate(id)}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "group relative flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              isActive ? "bg-accent/15 text-white" : "text-content-muted hover:bg-white/5 hover:text-white"
            )}
          >
            {isActive && (
              <motion.span
                layoutId={indicatorId}
                className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-accent"
                transition={{ type: "spring", stiffness: 380, damping: 32 }}
              />
            )}
            <span className={cn("transition-colors", isActive ? "text-accent-soft" : "text-content-faint group-hover:text-white")}>
              {ICONS[id]}
            </span>
            <span className="flex-1 text-left">{SECTION_META[id].label}</span>
            {showBadge && (
              <Badge tone={isActive ? "accent" : "success"} dot pulse>
                {runningCount}
              </Badge>
            )}
          </button>
        );
      })}
    </nav>
  );
}

function AdminFooter() {
  const { user } = useAuth();
  if (!user) return null;
  const label = user.display_name || user.email;
  const initial = label.trim().charAt(0).toUpperCase() || "U";
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-gradient text-xs font-bold text-white">
        {initial}
      </span>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-white">{label}</p>
        <p className="truncate text-[11px] text-content-faint">Administrator</p>
      </div>
    </div>
  );
}

interface AdminSidebarProps {
  active: AdminSection;
  onNavigate: (id: AdminSection) => void;
  runningCount: number;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

export default function AdminSidebar({
  active,
  onNavigate,
  runningCount,
  mobileOpen,
  onCloseMobile,
}: AdminSidebarProps) {
  // Close the mobile drawer on Escape.
  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCloseMobile();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mobileOpen, onCloseMobile]);

  return (
    <>
      {/* Desktop rail */}
      <aside className="sticky top-16 hidden h-[calc(100vh-4rem)] w-60 shrink-0 flex-col self-start border-r border-white/10 bg-surface-raised/50 backdrop-blur-md lg:flex">
        <div className="flex-1 overflow-y-auto px-3 py-5">
          <p className="px-3 text-[11px] font-semibold uppercase tracking-wider text-content-faint">Admin</p>
          <div className="mt-3">
            <NavList active={active} onNavigate={onNavigate} runningCount={runningCount} indicatorId="admin-nav-active-desktop" />
          </div>
        </div>
        <div className="border-t border-white/10 p-3">
          <AdminFooter />
        </div>
      </aside>

      {/* Mobile drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={onCloseMobile}
              className="fixed inset-0 z-[80] bg-black/60 backdrop-blur-sm lg:hidden"
              aria-hidden="true"
            />
            <motion.aside
              role="dialog"
              aria-label="Admin navigation"
              initial={{ x: -288 }}
              animate={{ x: 0 }}
              exit={{ x: -288 }}
              transition={{ type: "spring", stiffness: 320, damping: 32 }}
              className="fixed inset-y-0 left-0 z-[85] flex w-72 flex-col border-r border-white/10 bg-surface-raised shadow-pop lg:hidden"
            >
              <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-content-faint">Admin</p>
                <button
                  type="button"
                  onClick={onCloseMobile}
                  aria-label="Close menu"
                  className="rounded-md border border-white/10 p-1.5 text-content-muted transition-colors hover:bg-white/5 hover:text-white"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-4 w-4" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-3">
                <NavList active={active} onNavigate={onNavigate} runningCount={runningCount} indicatorId="admin-nav-active-mobile" />
              </div>
              <div className="border-t border-white/10 p-3">
                <AdminFooter />
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
