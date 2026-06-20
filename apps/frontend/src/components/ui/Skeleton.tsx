import { cn } from "@/lib/cn";

/** Shimmering placeholder block. Compose several to build skeleton layouts. */
export default function Skeleton({ className }: { className?: string }) {
  return <div className={cn("shimmer rounded-md bg-white/[0.06]", className)} aria-hidden="true" />;
}
