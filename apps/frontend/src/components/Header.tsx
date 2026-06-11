"use client";

import SessionStatus from "@/components/SessionStatus";

export default function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-surface/95 backdrop-blur">
      <div className="flex w-full items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-6">
          <a href="/" className="text-xl font-bold tracking-tight text-white">
            Stream<span className="text-accent">Hub</span>
          </a>
          <a
            href="/admin"
            className="text-sm text-gray-400 transition-colors hover:text-white"
          >
            Admin
          </a>
        </div>
        <SessionStatus />
      </div>
    </header>
  );
}
