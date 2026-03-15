import type { LibraryFilters, SearchResult } from "../shared/types";
import type { LibraryViewMode } from "../store/uiStore";
import { FileCard } from "../components/FileCard";
import { EmptyState } from "../components/EmptyState";
import type { JSX } from "react";

interface SearchPageProps {
  results: SearchResult[];
  filters: LibraryFilters;
  query: string;
  viewMode: LibraryViewMode;
  onSetFilter: <K extends keyof LibraryFilters>(key: K, value: LibraryFilters[K]) => void;
  onResetFilters: () => void;
  onOpenFile: (fileId: string) => void;
  onRetry: (fileId: string) => void;
  onAnalyze: (fileId: string) => void;
}

export function SearchPage({
  results,
  filters,
  query,
  viewMode,
  onSetFilter,
  onResetFilters,
  onOpenFile,
  onRetry,
  onAnalyze
}: SearchPageProps): JSX.Element {
  const fileTypes = [...new Set(results.map((result) => result.file.extension))];
  const dominantColors = [
    ...new Set(
      results.flatMap((result) => result.file.analysis?.dominantColors.map((color) => color.name) ?? [])
    )
  ];

  return (
    <div className="space-y-4">
      <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 md:grid-cols-5">
        <select
          className="rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
          onChange={(event) => onSetFilter("fileType", event.target.value || null)}
          value={filters.fileType ?? ""}
        >
          <option value="">All file types</option>
          {fileTypes.map((type) => (
            <option key={type} value={type}>
              {type.toUpperCase().replace(".", "")}
            </option>
          ))}
        </select>

        <select
          className="rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
          onChange={(event) => onSetFilter("dominantColor", event.target.value || null)}
          value={filters.dominantColor ?? ""}
        >
          <option value="">All colors</option>
          {dominantColors.map((color) => (
            <option key={color} value={color}>
              {color}
            </option>
          ))}
        </select>

        <select
          className="rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
          onChange={(event) =>
            onSetFilter("sentiment", (event.target.value as LibraryFilters["sentiment"]) || null)
          }
          value={filters.sentiment ?? ""}
        >
          <option value="">All sentiment</option>
          <option value="positive">Positive</option>
          <option value="neutral">Neutral</option>
          <option value="negative">Negative</option>
        </select>

        <select
          className="rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
          onChange={(event) =>
            onSetFilter("uploadedWithin", event.target.value as LibraryFilters["uploadedWithin"])
          }
          value={filters.uploadedWithin}
        >
          <option value="all">Any date</option>
          <option value="7d">Last 7 days</option>
          <option value="30d">Last 30 days</option>
          <option value="365d">Last 12 months</option>
        </select>

        <button
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
          onClick={onResetFilters}
          type="button"
        >
          Reset filters
        </button>
      </div>

      {results.length === 0 ? (
        <EmptyState
          description="Try adjusting filters or broadening your search phrase."
          title={query ? "No matches found" : "No files to search yet"}
        />
      ) : (
        <div className={viewMode === "grid" ? "grid gap-4 md:grid-cols-2 xl:grid-cols-3" : "space-y-3"}>
          {results.map((result) => (
            <FileCard
              key={result.file.id}
              onAnalyze={onAnalyze}
              onOpen={onOpenFile}
              onRetry={onRetry}
              query={query}
              result={result}
              viewMode={viewMode}
            />
          ))}
        </div>
      )}
    </div>
  );
}
