import Skeleton from "@/components/ui/Skeleton";

interface LoadingGridProps {
  count?: number;
}

/** Shimmering card placeholders matching ContentCard's shape. */
export default function LoadingGrid({ count = 10 }: LoadingGridProps) {
  return (
    <div
      className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6"
      aria-busy="true"
      aria-label="Loading content"
    >
      {Array.from({ length: count }).map((_, index) => (
        <div key={index}>
          <Skeleton className="aspect-video w-full rounded-xl" />
          <div className="mt-2.5 space-y-2 px-0.5">
            <Skeleton className="h-3.5 w-3/4 rounded" />
            <Skeleton className="h-2.5 w-1/2 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}
