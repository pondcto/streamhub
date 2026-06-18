"use client";

import Link from "next/link";

import { useAuth } from "@/lib/auth";

export default function Header() {
  const { user, loading, logout } = useAuth();

  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-surface/80 backdrop-blur-md">
      <div className="flex w-full items-center gap-3 px-4 py-3.5 sm:px-6 lg:px-8">
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

        <span className="ml-3 hidden items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-medium text-gray-400 sm:inline-flex">
          <span className="inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
          Authorized streaming dashboard
        </span>

        <div className="ml-auto flex items-center gap-3">
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
