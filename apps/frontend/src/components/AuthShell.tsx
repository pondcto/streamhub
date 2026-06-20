"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import type { ReactNode } from "react";

function PlayMark() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4 text-white" aria-hidden="true">
      <path d="M8 5.14v13.72a1 1 0 0 0 1.54.84l10.79-6.86a1 1 0 0 0 0-1.68L9.54 4.3A1 1 0 0 0 8 5.14Z" />
    </svg>
  );
}

interface AuthShellProps {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer: ReactNode;
}

export default function AuthShell({ title, subtitle, children, footer }: AuthShellProps) {
  return (
    <div className="relative mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-md flex-col justify-center px-4 py-12">
      {/* Ambient accent halo */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-16 -z-10 h-72 w-72 -translate-x-1/2 rounded-full bg-accent/20 blur-[120px]"
      />

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="overflow-hidden rounded-2xl border border-white/10 bg-surface-raised/80 p-7 shadow-pop backdrop-blur-xl"
      >
        <Link href="/" className="mb-6 inline-flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent-gradient shadow-glow">
            <PlayMark />
          </span>
          <span className="text-lg font-bold tracking-tight text-white">
            Stream<span className="text-gradient">Hub</span>
          </span>
        </Link>

        <h1 className="text-xl font-semibold text-white">{title}</h1>
        <p className="mt-1 text-sm text-content-muted">{subtitle}</p>

        <div className="mt-6">{children}</div>
      </motion.div>

      <p className="mt-5 text-center text-sm text-content-muted">{footer}</p>
    </div>
  );
}
