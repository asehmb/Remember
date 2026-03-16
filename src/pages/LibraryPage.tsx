import type { LibraryFilters, SearchResult, TagCloudItem } from "../shared/types";
import type { LibraryViewMode } from "../store/uiStore";
import { EmptyState } from "../components/EmptyState";
import { FileCard } from "../components/FileCard";
import { SkeletonCards } from "../components/SkeletonCards";
import { TagPill } from "../components/TagPill";
import { UploadDropzone } from "../components/UploadDropzone";
import { useEffect, useMemo, useState } from "react";
import type { JSX } from "react";

const TAG_CLOUD_PREVIEW_LIMIT = 20;
const DEFAULT_LIBRARY_PAGE_SIZE = 50;
const MIN_LIBRARY_PAGE_SIZE = 1;
const MAX_LIBRARY_PAGE_SIZE = 500;

function normalizePageSize(value: number): number {
  if (!Number.isInteger(value)) {
    return DEFAULT_LIBRARY_PAGE_SIZE;
  }
  return Math.min(Math.max(value, MIN_LIBRARY_PAGE_SIZE), MAX_LIBRARY_PAGE_SIZE);
}

interface LibraryPageProps {
  results: SearchResult[];
  tagCloud: TagCloudItem[];
  selectedTag: string | null;
  loading: boolean;
  error: string | null;
  query: string;
  uploadStatus: LibraryFilters["uploadStatus"];
  hasQueuedFiles: boolean;
  viewMode: LibraryViewMode;
  onSetViewMode: (mode: LibraryViewMode) => void;
  onSetUploadStatus: (uploadStatus: LibraryFilters["uploadStatus"]) => void;
  onSelectTag: (tag: string | null) => void;
  onPickFiles: () => Promise<void>;
  onDropPaths: (paths: string[]) => Promise<void>;
  onOpenFile: (fileId: string) => void;
  onRetry: (fileId: string) => void;
  onRetryAllFailed: () => void;
  onAnalyze: (fileId: string) => void;
}

export function LibraryPage({
  results,
  tagCloud,
  selectedTag,
  loading,
  error,
  query,
  uploadStatus,
  hasQueuedFiles,
  viewMode,
  onSetViewMode,
  onSetUploadStatus,
  onSelectTag,
  onPickFiles,
  onDropPaths,
  onOpenFile,
  onRetry,
  onRetryAllFailed,
  onAnalyze
}: LibraryPageProps): JSX.Element {
  const [showAllTags, setShowAllTags] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_LIBRARY_PAGE_SIZE);
  const [pageSizeInput, setPageSizeInput] = useState(String(DEFAULT_LIBRARY_PAGE_SIZE));
  const hasMoreTags = tagCloud.length > TAG_CLOUD_PREVIEW_LIMIT;
  const visibleTags = showAllTags ? tagCloud : tagCloud.slice(0, TAG_CLOUD_PREVIEW_LIMIT);
  const totalResults = results.length;
  const totalPages = Math.max(1, Math.ceil(totalResults / pageSize));
  const activePage = Math.min(currentPage, totalPages);
  const pageStartIndex = (activePage - 1) * pageSize;
  const pageEndIndex = Math.min(pageStartIndex + pageSize, totalResults);
  const visibleResults = useMemo(
    () => results.slice(pageStartIndex, pageEndIndex),
    [pageEndIndex, pageStartIndex, results]
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [query, selectedTag, uploadStatus]);

  useEffect(() => {
    if (currentPage !== activePage) {
      setCurrentPage(activePage);
    }
  }, [activePage, currentPage]);

  const applyPageSize = (): void => {
    const parsed = Number.parseInt(pageSizeInput.trim(), 10);
    if (!Number.isInteger(parsed)) {
      setPageSizeInput(String(pageSize));
      return;
    }

    const nextPageSize = normalizePageSize(parsed);
    setPageSize(nextPageSize);
    setPageSizeInput(String(nextPageSize));
    setCurrentPage(1);
  };

  return (
    <div className="space-y-4">
      <UploadDropzone onDropPaths={onDropPaths} onPickFiles={onPickFiles} />

      <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Tag Cloud</h2>
          {selectedTag ? (
            <button className="text-xs text-accent-500 underline" onClick={() => onSelectTag(null)} type="button">
              Clear selected tag
            </button>
          ) : null}
        </div>

        {tagCloud.length === 0 ? (
          <p className="text-sm text-slate-500">No tags yet.</p>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {visibleTags.map((item) => (
                <TagPill
                  key={item.tag}
                  active={selectedTag?.toLowerCase() === item.tag.toLowerCase()}
                  label={`${item.tag} (${item.count})`}
                  onClick={() => onSelectTag(item.tag)}
                />
              ))}
            </div>

            {hasMoreTags ? (
              <button
                className="text-xs text-accent-500 underline"
                onClick={() => setShowAllTags((current) => !current)}
                type="button"
              >
                {showAllTags ? "Show less" : `Show more (${tagCloud.length - TAG_CLOUD_PREVIEW_LIMIT} more)`}
              </button>
            ) : null}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Library</h2>
        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-500 dark:text-slate-400">
            Uploads
            <select
              className="ml-2 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs outline-none focus:border-accent-400 dark:border-slate-700 dark:bg-slate-900"
              onChange={(event) =>
                onSetUploadStatus(event.target.value as LibraryFilters["uploadStatus"])
              }
              value={uploadStatus}
            >
              <option value="all">All</option>
              <option value="pending">Pending</option>
              <option value="queued">Queued</option>
              <option value="processing">In progress</option>
              <option value="error">Failed</option>
            </select>
          </label>
          <button
            className="rounded-md border border-rose-300 px-3 py-1 text-xs font-medium text-rose-700 hover:bg-rose-50 dark:border-rose-900 dark:text-rose-300 dark:hover:bg-rose-950/40"
            onClick={onRetryAllFailed}
            type="button"
          >
            <span className="inline-flex items-center gap-1.5">
              {hasQueuedFiles ? (
                <svg
                  aria-hidden="true"
                  className="h-3 w-3 animate-spin"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    fill="none"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="3"
                  />
                  <path
                    className="opacity-90"
                    d="M22 12a10 10 0 0 0-10-10"
                    fill="none"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeWidth="3"
                  />
                </svg>
              ) : null}
              <span>Retry all failed scans</span>
            </span>
          </button>
          <div className="rounded-lg border border-slate-200 p-1 dark:border-slate-700">
            <button
              className={`rounded px-3 py-1 text-xs ${viewMode === "grid" ? "bg-accent-500 text-white" : "text-slate-600 dark:text-slate-300"}`}
              onClick={() => onSetViewMode("grid")}
              type="button"
            >
              Grid
            </button>
            <button
              className={`rounded px-3 py-1 text-xs ${viewMode === "list" ? "bg-accent-500 text-white" : "text-slate-600 dark:text-slate-300"}`}
              onClick={() => onSetViewMode("list")}
              type="button"
            >
              List
            </button>
          </div>
        </div>
      </div>

      {error ? <p className="rounded-lg bg-rose-100 p-2 text-sm text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">{error}</p> : null}

      {loading && results.length === 0 ? <SkeletonCards /> : null}

      {!loading && results.length === 0 ? (
        <EmptyState
          description="Drop files into Remember to start auto-tagging with AI and build your searchable library."
          title="Your library is empty"
        />
      ) : null}

      {totalResults > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Showing {pageStartIndex + 1}-{pageEndIndex} of {totalResults}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-xs text-slate-500 dark:text-slate-400" htmlFor="library-page-size">
              Per page
            </label>
            <input
              id="library-page-size"
              className="w-20 rounded border border-slate-300 bg-white px-2 py-1 text-xs outline-none focus:border-accent-400 dark:border-slate-700 dark:bg-slate-900"
              max={MAX_LIBRARY_PAGE_SIZE}
              min={MIN_LIBRARY_PAGE_SIZE}
              onBlur={applyPageSize}
              onChange={(event) => setPageSizeInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  applyPageSize();
                }
              }}
              type="number"
              value={pageSizeInput}
            />
            <button
              className="rounded border border-slate-300 px-2 py-1 text-xs font-medium hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
              onClick={applyPageSize}
              type="button"
            >
              Apply
            </button>
            <button
              className="rounded border border-slate-300 px-2 py-1 text-xs font-medium hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-800"
              disabled={activePage <= 1}
              onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
              type="button"
            >
              Prev
            </button>
            <span className="min-w-24 text-center text-xs text-slate-500 dark:text-slate-400">
              Page {activePage} / {totalPages}
            </span>
            <button
              className="rounded border border-slate-300 px-2 py-1 text-xs font-medium hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-800"
              disabled={activePage >= totalPages}
              onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
              type="button"
            >
              Next
            </button>
          </div>
        </div>
      ) : null}

      <div className={viewMode === "grid" ? "grid gap-4 md:grid-cols-2 xl:grid-cols-3" : "space-y-3"}>
        {visibleResults.map((result) => (
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

      {totalResults > 0 ? (
        <div className="flex items-center justify-end gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-900">
          <button
            className="rounded border border-slate-300 px-2 py-1 text-xs font-medium hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-800"
            disabled={activePage <= 1}
            onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
            type="button"
          >
            Prev
          </button>
          <span className="min-w-24 text-center text-xs text-slate-500 dark:text-slate-400">
            Page {activePage} / {totalPages}
          </span>
          <button
            className="rounded border border-slate-300 px-2 py-1 text-xs font-medium hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-800"
            disabled={activePage >= totalPages}
            onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
            type="button"
          >
            Next
          </button>
        </div>
      ) : null}
    </div>
  );
}
