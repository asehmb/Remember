import type { JSX } from "react";
interface EmptyStateProps {
  title: string;
  description: string;
}

export function EmptyState({ title, description }: EmptyStateProps): JSX.Element {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-white/70 p-10 text-center dark:border-slate-700 dark:bg-slate-900/60">
      <div className="mx-auto mb-3 h-16 w-16 rounded-full bg-slate-100 text-3xl leading-[64px] dark:bg-slate-800">📁</div>
      <h3 className="text-base font-semibold">{title}</h3>
      <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{description}</p>
    </div>
  );
}
