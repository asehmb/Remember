import type { JSX } from "react";
interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
}

export function SearchInput({ value, onChange }: SearchInputProps): JSX.Element {
  return (
    <div className="flex-1">
      <label className="sr-only" htmlFor="search-files">
        Search files and tags
      </label>
      <input
        id="search-files"
        className="no-drag w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm outline-none transition focus:border-accent-400 focus:ring-2 focus:ring-accent-300/40 dark:border-slate-700 dark:bg-slate-900"
        onChange={(event) => onChange(event.target.value)}
        placeholder="Search filenames, tags, topics, summaries..."
        type="search"
        value={value}
      />
    </div>
  );
}
