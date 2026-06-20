"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { useSearch } from "@/lib/search-context";
import SearchBar from "@/components/SearchBar";

export default function Header() {
  const { user, loading, logout } = useAuth();
  const { search, setSearch } = useSearch();
  const pathname = usePathname();

  // The admin page has its own table-scoped search; hide the global one there.
  const showSearch = !pathname?.startsWith("/admin");

  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-surface/80 backdrop-blur-md">
      <div className="grid grid-cols-[auto_1fr_auto] items-center gap-4 px-4 py-3 sm:px-6 lg:px-8">

        {/* Left: logo */}
        <a href="/" className="group flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent shadow-glow transition-transform group-hover:scale-105">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="currentColor"
              className="h-4 w-4 text-white"
              aria-hidden="true"
            >
              <path d="M8 5.14v13.72a1 1 0 0 0 1.54.84l10.79-6.86a1 1 0 0 0 0-1.68L9.54 4.3A1 1 0 0 0 8 5.14Z" />
            </svg>
          </span>
          <span className="text-xl font-bold tracking-tight text-white">
            Stream<span className="text-accent">Hub</span>
          </span>
        </a>

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
          {!loading && user && (
            <>
              {user.role === "admin" && (
                <Link
                  href="/admin"
                  className="rounded-lg border border-white/10 px-3 py-1.5 text-sm text-gray-300 transition-colors hover:bg-white/5 hover:text-white"
                >
                  Admin
                </Link>
              )}
              <span className="hidden text-sm text-gray-300 sm:inline" title={user.email}>
                {user.display_name || user.email}
              </span>
              <button
                type="button"
                onClick={logout}
                className="rounded-lg border border-white/10 px-3 py-1.5 text-sm text-gray-300 transition-colors hover:bg-white/5 hover:text-white"
              >
                Sign out
              </button>
            </>
          )}
          {!loading && !user && (
            <Link
              href="/login"
              className="rounded-lg bg-accent px-3.5 py-1.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
            >
              Sign in
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
