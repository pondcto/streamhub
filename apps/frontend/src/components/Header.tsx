"use client";

export default function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-surface/95 backdrop-blur">
      <div className="flex w-full items-center px-4 py-4 sm:px-6 lg:px-8">
        <a href="/" className="text-xl font-bold tracking-tight text-white">
          Stream<span className="text-accent">Hub</span>
        </a>
      </div>
    </header>
  );
}
