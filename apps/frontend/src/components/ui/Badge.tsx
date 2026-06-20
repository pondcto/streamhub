import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type Tone = "neutral" | "accent" | "live" | "success" | "warn" | "danger";

const TONES: Record<Tone, string> = {
  neutral: "border-white/10 bg-white/5 text-content-muted",
  accent: "border-accent/30 bg-accent/15 text-accent-soft",
  live: "border-live/40 bg-live/15 text-live-soft",
  success: "border-success/30 bg-success/15 text-success-soft",
  warn: "border-warn/30 bg-warn/15 text-warn-soft",
  danger: "border-danger/30 bg-danger/15 text-danger-soft",
};

interface BadgeProps {
  tone?: Tone;
  dot?: boolean;
  pulse?: boolean;
  className?: string;
  children: ReactNode;
}

export default function Badge({ tone = "neutral", dot = false, pulse = false, className, children }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
        TONES[tone],
        className
      )}
    >
      {dot && (
        <span
          className={cn("inline-flex h-1.5 w-1.5 rounded-full bg-current", pulse && "animate-pulse-live")}
        />
      )}
      {children}
    </span>
  );
}
