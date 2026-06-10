"use client";

import type { ApiError } from "@/lib/types";

interface ErrorBannerProps {
  error: ApiError | string | null;
  onDismiss?: () => void;
}

export default function ErrorBanner({ error, onDismiss }: ErrorBannerProps) {
  if (!error) return null;

  const message = typeof error === "string" ? error : error.message;
  const code = typeof error === "string" ? undefined : error.code;

  return (
    <div
      role="alert"
      className="mb-6 rounded-lg border border-red-500/40 bg-red-950/40 px-4 py-3 text-sm text-red-200"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          {code && (
            <p className="mb-1 font-mono text-xs uppercase tracking-wide text-red-400">
              {code}
            </p>
          )}
          <p>{message}</p>
        </div>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="shrink-0 text-red-300 hover:text-white"
            aria-label="Dismiss error"
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
}
