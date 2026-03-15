import clsx from "clsx";
import type { JSX } from "react";

interface TagPillProps {
  label: string;
  active?: boolean;
  onClick?: () => void;
}

export function TagPill({ label, active = false, onClick }: TagPillProps): JSX.Element {
  const className = clsx(
    "inline-flex rounded-full px-2.5 py-1 text-xs font-medium transition",
    active
      ? "bg-accent-500 text-white"
      : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
    onClick ? "cursor-pointer hover:opacity-85" : ""
  );

  if (onClick) {
    return (
      <button className={className} onClick={onClick} type="button">
        {label}
      </button>
    );
  }

  return <span className={className}>{label}</span>;
}
