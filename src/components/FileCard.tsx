import clsx from "clsx";
import { useEffect, useState } from "react";
import type { SearchResult } from "../shared/types";
import { formatDate, formatFileSize } from "../lib/utils/format";
import { toFileUrl } from "../lib/utils/file-url";
import { TagPill } from "./TagPill";
import type { LibraryViewMode } from "../store/uiStore";
import type { JSX } from "react";

const DOCUMENT_THUMBNAIL_SNIPPET_MAX_LENGTH = 90;
const documentThumbnailSnippetCache = new Map<string, string | null>();

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
          <mark
            key={`${part}-${index}`}
            className="rounded bg-yellow-200 px-0.5 text-slate-900"
          >
            {part}
          </mark>
        ) : (
          <span key={`${part}-${index}`}>{part}</span>
        ),
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

function toSnippet(
  text: string,
  maxLength = DOCUMENT_THUMBNAIL_SNIPPET_MAX_LENGTH,
): string {
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength).trimEnd()}…`;
}

function extractDocxThumbnailSnippet(rawText: string): string | null {
  const normalized = rawText.replace(/\r\n/g, "\n").trim();
  if (!normalized) {
    return null;
  }

  const firstParagraph = normalized
    .split(/\n{2,}/)
    .map((segment) => segment.trim())
    .find(Boolean);

  const sourceText = (firstParagraph ?? normalized).replace(/\s+/g, " ").trim();
  return sourceText ? toSnippet(sourceText) : null;
}

function extractPptxThumbnailSnippet(rawText: string): string | null {
  const normalized = rawText.replace(/\r\n/g, "\n").trim();
  if (!normalized) {
    return null;
  }

  const firstSlideBlock = normalized
    .split(/\n{2,}/)
    .map((segment) => segment.trim())
    .find(Boolean);

  const slideLines = (firstSlideBlock ?? normalized)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const contentLines = /^slide\s+\d+/i.test(slideLines[0] ?? "")
    ? slideLines.slice(1)
    : slideLines;
  const sourceText = contentLines.join(" ").replace(/\s+/g, " ").trim();
  return sourceText ? toSnippet(sourceText) : null;
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
  onAnalyze,
}: FileCardProps): JSX.Element {
  const { file } = result;
  const extension = file.extension.toLowerCase();
  const isImage = [".png", ".jpg", ".jpeg", ".webp"].includes(extension);
  const isDocx = extension === ".docx";
  const isPptx = extension === ".pptx";
  const shouldShowDocumentThumbnail = isDocx || isPptx;
  const [isImagePreviewBroken, setIsImagePreviewBroken] = useState(false);
  const [documentThumbnailSnippet, setDocumentThumbnailSnippet] = useState<
    string | null
  >(null);
  const [isDocumentThumbnailLoading, setIsDocumentThumbnailLoading] =
    useState(false);

  useEffect(() => {
    setIsImagePreviewBroken(false);
  }, [file.id, file.storedPath]);

  useEffect(() => {
    let cancelled = false;

    if (!shouldShowDocumentThumbnail) {
      setIsDocumentThumbnailLoading(false);
      setDocumentThumbnailSnippet(null);
      return () => {
        cancelled = true;
      };
    }

    const cachedSnippet = documentThumbnailSnippetCache.get(file.id);
    if (cachedSnippet !== undefined) {
      setDocumentThumbnailSnippet(cachedSnippet);
      setIsDocumentThumbnailLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setIsDocumentThumbnailLoading(true);
    setDocumentThumbnailSnippet(null);

    void window.remember
      .getFilePreviewText(file.id)
      .then((value) => {
        if (cancelled) {
          return;
        }

        const snippet = value
          ? isPptx
            ? extractPptxThumbnailSnippet(value)
            : extractDocxThumbnailSnippet(value)
          : null;

        documentThumbnailSnippetCache.set(file.id, snippet);
        setDocumentThumbnailSnippet(snippet);
      })
      .catch(() => {
        if (cancelled) {
          return;
        }
        documentThumbnailSnippetCache.set(file.id, null);
        setDocumentThumbnailSnippet(null);
      })
      .finally(() => {
        if (cancelled) {
          return;
        }
        setIsDocumentThumbnailLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [file.id, isPptx, shouldShowDocumentThumbnail]);

  return (
    <article
      className={clsx(
        "rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:border-slate-800 dark:bg-slate-900",
        viewMode === "list" ? "flex items-center gap-4" : "space-y-3",
      )}
    >
      <button
        className="w-full text-left"
        onClick={() => onOpen(file.id)}
        type="button"
      >
        <div
          className={clsx(
            viewMode === "list" ? "flex items-center gap-4" : "space-y-3",
          )}
        >
          <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-lg bg-slate-900 dark:bg-slate-800">
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
            ) : shouldShowDocumentThumbnail ? (
              <div className="h-full w-full p-1.5">
                <div
                  className={clsx(
                    "h-full w-full overflow-hidden rounded border bg-white px-1.5 py-1 shadow-sm dark:bg-slate-900",
                    isPptx
                      ? "border-violet-200 dark:border-violet-800/80"
                      : "border-slate-200 dark:border-slate-700",
                  )}
                >
                  <p className="truncate text-[7px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    {isPptx ? "Slide 1" : "Page 1"}
                  </p>
                  <p className="mt-1 line-clamp-4 break-words text-[8px] leading-3 text-slate-600 dark:text-slate-300">
                    {isDocumentThumbnailLoading
                      ? "Loading preview..."
                      : (documentThumbnailSnippet ??
                        (isPptx
                          ? "No text on first slide."
                          : "No text on first page."))}
                  </p>
                </div>
              </div>
            ) : (
              <span className="text-2xl">
                {extension === ".pdf"
                  ? "📄"
                  : extension === ".docx"
                    ? "📝"
                    : extension === ".pptx"
                      ? "📊"
                      : "📃"}
              </span>
            )}
          </div>

          <div className="min-w-0 flex-1 space-y-1">
            <h3 className="truncate text-sm font-semibold">
              {highlight(file.originalName, query)}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {file.extension.toUpperCase().replace(".", "")} ·{" "}
              {formatFileSize(file.sizeBytes)} · {formatDate(file.uploadedAt)}
            </p>
            <p className={clsx("text-xs font-medium", statusTone(file.status))}>
              {file.status === "processing"
                ? "Processing with AI..."
                : file.status}
            </p>

            {file.analysis?.summary ? (
              <p className="line-clamp-2 text-xs text-slate-600 dark:text-slate-300">
                {highlight(file.analysis.summary, query)}
              </p>
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
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Matched: {result.matchedTags.join(", ")}
          </p>
        ) : null}
      </div>
    </article>
  );
}
