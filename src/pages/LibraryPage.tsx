import type { SearchResult } from "../shared/types";
import type { TagCloudItem } from "../shared/types";
import type { LibraryViewMode } from "../store/uiStore";
import { EmptyState } from "../components/EmptyState";
import { FileCard } from "../components/FileCard";
import { SkeletonCards } from "../components/SkeletonCards";
import { TagPill } from "../components/TagPill";
import { UploadDropzone } from "../components/UploadDropzone";
import { useState } from "react";
import type { JSX } from "react";

const TAG_CLOUD_PREVIEW_LIMIT = 20;

interface LibraryPageProps {
  results: SearchResult[];
  tagCloud: TagCloudItem[];
  selectedTag: string | null;
  loading: boolean;
  error: string | null;
  query: string;
  viewMode: LibraryViewMode;
  onSetViewMode: (mode: LibraryViewMode) => void;
  onSelectTag: (tag: string | null) => void;
  onPickFiles: () => Promise<void>;
  onDropPaths: (paths: string[]) => Promise<void>;
  onOpenFile: (fileId: string) => void;
  onRetry: (fileId: string) => void;
  onAnalyze: (fileId: string) => void;
}

export function LibraryPage({
  results,
  tagCloud,
  selectedTag,
  loading,
  error,
  query,
  viewMode,
  onSetViewMode,
  onSelectTag,
  onPickFiles,
  onDropPaths,
  onOpenFile,
  onRetry,
  onAnalyze
}: LibraryPageProps): JSX.Element {
  const [showAllTags, setShowAllTags] = useState(false);
  const hasMoreTags = tagCloud.length > TAG_CLOUD_PREVIEW_LIMIT;
  const visibleTags = showAllTags ? tagCloud : tagCloud.slice(0, TAG_CLOUD_PREVIEW_LIMIT);

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

      {error ? <p className="rounded-lg bg-rose-100 p-2 text-sm text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">{error}</p> : null}

      {loading && results.length === 0 ? <SkeletonCards /> : null}

      {!loading && results.length === 0 ? (
        <EmptyState
          description="Drop files into Remember to start auto-tagging with AI and build your searchable library."
          title="Your library is empty"
        />
      ) : null}

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
    </div>
  );
}
