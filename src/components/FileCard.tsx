import clsx from "clsx";
import { useEffect, useState } from "react";
import type { SearchResult } from "../shared/types";
import { formatDate, formatFileSize } from "../lib/utils/format";
import { toFileUrl } from "../lib/utils/file-url";
import { TagPill } from "./TagPill";
import type { LibraryViewMode } from "../store/uiStore";
import type { JSX } from "react";

function highlight(text: string, query: string): JSX.Element {
  if (!query.trim()) {
    return <>{text}</>;
  }

  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`(${escaped})`, "ig");
  const parts = text.split(regex);

  return (
    <>
      {parts.map((part, index) =>
        index % 2 === 1 ? (
          <mark key={`${part}-${index}`} className="rounded bg-yellow-200 px-0.5 text-slate-900">
            {part}
          </mark>
        ) : (
          <span key={`${part}-${index}`}>{part}</span>
        )
      )}
    </>
  );
}

function statusTone(status: SearchResult["file"]["status"]): string {
  if (status === "done") return "text-emerald-600 dark:text-emerald-400";
  if (status === "processing") return "text-blue-600 dark:text-blue-400";
  if (status === "queued") return "text-amber-600 dark:text-amber-400";
  if (status === "pending") return "text-orange-600 dark:text-orange-400";
  return "text-rose-600 dark:text-rose-400";
}

interface FileCardProps {
  result: SearchResult;
  query: string;
  viewMode: LibraryViewMode;
  onOpen: (fileId: string) => void;
  onRetry: (fileId: string) => void;
  onAnalyze: (fileId: string) => void;
}

export function FileCard({
  result,
  query,
  viewMode,
  onOpen,
  onRetry,
  onAnalyze
}: FileCardProps): JSX.Element {
  const { file } = result;
  const isImage = [".png", ".jpg", ".jpeg", ".webp"].includes(file.extension.toLowerCase());
  const [isImagePreviewBroken, setIsImagePreviewBroken] = useState(false);

  useEffect(() => {
    setIsImagePreviewBroken(false);
  }, [file.id, file.storedPath]);

  return (
    <article
      className={clsx(
        "rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:border-slate-800 dark:bg-slate-900",
        viewMode === "list" ? "flex items-center gap-4" : "space-y-3"
      )}
    >
      <button className="w-full text-left" onClick={() => onOpen(file.id)} type="button">
        <div className={clsx(viewMode === "list" ? "flex items-center gap-4" : "space-y-3")}>
          <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-lg bg-slate-100 dark:bg-slate-800">
            {isImage && !isImagePreviewBroken ? (
              <img
                alt={file.originalName}
                className="h-full w-full object-cover"
                onError={() => setIsImagePreviewBroken(true)}
                src={toFileUrl(file.storedPath)}
              />
            ) : isImage ? (
              <span className="text-2xl" title="Image preview unavailable">
                🖼️
              </span>
            ) : (
              <span className="text-2xl">
                {file.extension === ".pdf" ? "📄" : file.extension === ".docx" ? "📝" : file.extension === ".pptx" ? "📊" : "📃"}
              </span>
            )}
          </div>

          <div className="min-w-0 flex-1 space-y-1">
            <h3 className="truncate text-sm font-semibold">{highlight(file.originalName, query)}</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {file.extension.toUpperCase().replace(".", "")} · {formatFileSize(file.sizeBytes)} · {formatDate(file.uploadedAt)}
            </p>
            <p className={clsx("text-xs font-medium", statusTone(file.status))}>
              {file.status === "processing" ? "Processing with AI..." : file.status}
            </p>

            {file.analysis?.summary ? (
              <p className="line-clamp-2 text-xs text-slate-600 dark:text-slate-300">{highlight(file.analysis.summary, query)}</p>
            ) : null}

            <div className="flex flex-wrap gap-1.5">
              {file.tags.slice(0, 4).map((tag) => (
                <TagPill key={tag} label={tag} />
              ))}
            </div>
          </div>
        </div>
      </button>

      <div className="flex items-center gap-2">
        {file.status === "error" ? (
          <button
            className="rounded-md bg-rose-500 px-2.5 py-1 text-xs font-medium text-white hover:bg-rose-600"
            onClick={() => onRetry(file.id)}
            type="button"
          >
            Retry
          </button>
        ) : null}

        {file.status === "pending" ? (
          <button
            className="rounded-md bg-accent-500 px-2.5 py-1 text-xs font-medium text-white hover:bg-accent-600"
            onClick={() => onAnalyze(file.id)}
            type="button"
          >
            Analyze
          </button>
        ) : null}

        {result.matchedTags.length > 0 ? (
          <p className="text-xs text-slate-500 dark:text-slate-400">Matched: {result.matchedTags.join(", ")}</p>
        ) : null}
      </div>
    </article>
  );
}
