"use client";

import type { ApiError } from "@/lib/types";

interface ErrorBannerProps {
  error: ApiError | null;
  onDismiss?: () => void;
}

export default function ErrorBanner({ error, onDismiss }: ErrorBannerProps) {
  if (!error) {
    return null;
  }

  return (
    <div
      role="alert"
      className="mb-4 flex animate-fade-in items-start gap-3 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger-soft backdrop-blur-sm"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={1.8}
        stroke="currentColor"
        className="mt-0.5 h-4 w-4 shrink-0 text-danger"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 9v3.75m0 3.75h.008M10.36 3.6 1.99 18a1.5 1.5 0 0 0 1.3 2.25h17.42A1.5 1.5 0 0 0 22 18L13.64 3.6a1.5 1.5 0 0 0-2.6 0Z"
        />
      </svg>

      <div className="min-w-0 flex-1">
        <p className="font-medium">{error.message}</p>
        {error.detail && (
          <p className="mt-0.5 text-xs text-danger-soft/80">{error.detail}</p>
        )}
        {error.code && (
          <p className="mt-1 font-mono text-[11px] uppercase tracking-wide text-danger/70">
            {error.code}
          </p>
        )}
      </div>

      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="shrink-0 rounded-md p-1 text-danger-soft/70 transition-colors hover:bg-danger/10 hover:text-danger-soft"
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
      )}
    </div>
  );
}
