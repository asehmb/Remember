import type { JSX } from "react";
interface SkeletonCardsProps {
  count?: number;
}

export function SkeletonCards({ count = 4 }: SkeletonCardsProps): JSX.Element {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="animate-pulse rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="h-20 rounded-lg bg-slate-200 dark:bg-slate-800" />
          <div className="mt-3 h-4 w-2/3 rounded bg-slate-200 dark:bg-slate-800" />
          <div className="mt-2 h-3 w-1/2 rounded bg-slate-200 dark:bg-slate-800" />
        </div>
      ))}
    </div>
  );
}
