interface LoadingGridProps {
  count?: number;
}

export default function LoadingGrid({ count = 8 }: LoadingGridProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="animate-pulse overflow-hidden rounded-xl bg-surface-raised border border-white/5"
        >
          <div className="aspect-[16/9] bg-surface-overlay" />
          <div className="space-y-3 p-4">
            <div className="h-4 w-3/4 rounded bg-surface-overlay" />
            <div className="h-3 w-1/2 rounded bg-surface-overlay" />
            <div className="flex justify-between pt-2">
              <div className="h-3 w-1/4 rounded bg-surface-overlay" />
              <div className="h-8 w-16 rounded-lg bg-surface-overlay" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
