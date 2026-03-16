import { useEffect, useMemo, useState } from "react";
import type { FileRow } from "../shared/types";
import { formatDate, formatFileSize } from "../lib/utils/format";
import { toFileUrl } from "../lib/utils/file-url";
import { TagPill } from "./TagPill";
import type { JSX } from "react";

interface FileDetailModalProps {
  file: FileRow | null;
  onClose: () => void;
  onAddTag: (tag: string) => Promise<void>;
  onDeleteTag: (tag: string) => Promise<void>;
  onRetry: () => Promise<void>;
  onAnalyze: () => Promise<void>;
}

interface PreviewPage {
  title: string;
  content: string;
}

function splitLongText(value: string, maxLength: number): string[] {
  if (value.length <= maxLength) {
    return [value];
  }

  const words = value.split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return [value];
  }

  const chunks: string[] = [];
  let currentChunk = "";

  for (const word of words) {
    const nextChunk = currentChunk ? `${currentChunk} ${word}` : word;
    if (nextChunk.length > maxLength && currentChunk) {
      chunks.push(currentChunk);
      currentChunk = word;
      continue;
    }

    currentChunk = nextChunk;
  }

  if (currentChunk) {
    chunks.push(currentChunk);
  }

  return chunks;
}

function buildDocxPreviewPages(rawText: string): PreviewPage[] {
  const normalized = rawText.replace(/\r\n/g, "\n").trim();
  if (!normalized) {
    return [];
  }

  const paragraphBlocks = normalized
    .split(/\n{2,}/)
    .map((segment) => segment.trim())
    .filter(Boolean);

  const sourceBlocks = paragraphBlocks.length > 0 ? paragraphBlocks : [normalized];
  const pages: string[] = [];
  let currentPage = "";

  for (const block of sourceBlocks) {
    const blockChunks = splitLongText(block, 1200);

    for (const chunk of blockChunks) {
      const nextPage = currentPage ? `${currentPage}\n\n${chunk}` : chunk;
      if (nextPage.length > 1800 && currentPage) {
        pages.push(currentPage);
        currentPage = chunk;
        continue;
      }
      currentPage = nextPage;
    }
  }

  if (currentPage) {
    pages.push(currentPage);
  }

  return pages.map((content, index) => ({
    title: `Page ${index + 1}`,
    content,
  }));
}

function buildPptxPreviewPages(rawText: string): PreviewPage[] {
  const normalized = rawText.replace(/\r\n/g, "\n").trim();
  if (!normalized) {
    return [];
  }

  const slideBlocks = normalized
    .split(/\n{2,}/)
    .map((segment) => segment.trim())
    .filter(Boolean);

  return slideBlocks.map((segment, index) => {
    const lines = segment.split("\n");
    const firstLine = lines[0]?.trim() ?? "";
    const hasSlideTitle = /^slide\s+\d+/i.test(firstLine);

    const title = hasSlideTitle ? firstLine : `Slide ${index + 1}`;
    const content = hasSlideTitle
      ? lines.slice(1).join("\n").trim()
      : segment;

    return {
      title,
      content: content || "No text found on this slide.",
    };
  });
}

export function FileDetailModal({
  file,
  onClose,
  onAddTag,
  onDeleteTag,
  onRetry,
  onAnalyze
}: FileDetailModalProps): JSX.Element | null {
  const [tagInput, setTagInput] = useState("");
  const [previewText, setPreviewText] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [isImagePreviewBroken, setIsImagePreviewBroken] = useState(false);
  const extension = file?.extension.toLowerCase() ?? "";
  const isImage = [".png", ".jpg", ".jpeg", ".webp"].includes(extension);
  const isPdf = extension === ".pdf";
  const isDocx = extension === ".docx";
  const isPptx = extension === ".pptx";
  const usesPagedDocumentPreview = isDocx || isPptx;
  const supportsTextPreview = [".txt", ".docx", ".pptx"].includes(extension);
  const pagedPreviewPages = useMemo(() => {
    if (!usesPagedDocumentPreview || !previewText || !previewText.trim()) {
      return [];
    }

    if (isPptx) {
      return buildPptxPreviewPages(previewText);
    }

    return buildDocxPreviewPages(previewText);
  }, [isPptx, previewText, usesPagedDocumentPreview]);

  useEffect(() => {
    setIsImagePreviewBroken(false);
  }, [file?.id, file?.storedPath]);

  useEffect(() => {
    let cancelled = false;

    setPreviewText(null);
    setPreviewError(null);

    if (!file || !supportsTextPreview) {
      setPreviewLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setPreviewLoading(true);
    void window.remember
      .getFilePreviewText(file.id)
      .then((value) => {
        if (cancelled) {
          return;
        }
        setPreviewText(value);
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }
        setPreviewError(error instanceof Error ? error.message : "Failed to load preview");
      })
      .finally(() => {
        if (cancelled) {
          return;
        }
        setPreviewLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [file?.id, supportsTextPreview]);

  if (!file) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/50 p-6" onClick={onClose}>
      <div
        className="max-h-[88vh] w-full max-w-4xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-900"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold">{file.originalName}</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {file.extension.toUpperCase().replace(".", "")} · {formatFileSize(file.sizeBytes)} · Uploaded {formatDate(file.uploadedAt)}
            </p>
          </div>

          <button className="rounded-md px-3 py-1 text-sm hover:bg-slate-100 dark:hover:bg-slate-800" onClick={onClose} type="button">
            Close
          </button>
        </div>

        <div className="mt-5 grid gap-5 md:grid-cols-[1.15fr,0.85fr]">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950">
            {isImage && !isImagePreviewBroken ? (
              <img
                alt={file.originalName}
                className="mx-auto max-h-[420px] rounded-lg object-contain"
                onError={() => setIsImagePreviewBroken(true)}
                src={toFileUrl(file.storedPath)}
              />
            ) : isImage ? (
              <div className="flex h-[240px] flex-col items-center justify-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                <span>Image preview unavailable.</span>
                <a className="text-accent-500 underline" href={toFileUrl(file.storedPath)} rel="noreferrer" target="_blank">
                  Open file
                </a>
              </div>
            ) : isPdf ? (
              <object
                className="h-[420px] w-full rounded-lg border border-slate-200 dark:border-slate-800"
                data={toFileUrl(file.storedPath)}
                type="application/pdf"
              >
                <div className="flex h-full items-center justify-center text-sm text-slate-500 dark:text-slate-400">
                  Unable to preview this PDF inline.
                  <a className="ml-1 text-accent-500 underline" href={toFileUrl(file.storedPath)} rel="noreferrer" target="_blank">
                    Open file
                  </a>
                </div>
              </object>
            ) : usesPagedDocumentPreview ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                  <span>{isPptx ? "Presentation preview" : "Document preview"}</span>
                  <a className="text-accent-500 underline" href={toFileUrl(file.storedPath)} rel="noreferrer" target="_blank">
                    Open file
                  </a>
                </div>
                <div className="h-[420px] overflow-y-auto rounded-lg border border-slate-200 bg-slate-200/60 p-4 dark:border-slate-800 dark:bg-slate-950">
                  {previewLoading ? (
                    <p className="text-sm text-slate-500 dark:text-slate-400">Loading preview...</p>
                  ) : previewError ? (
                    <p className="text-sm text-rose-500">{previewError}</p>
                  ) : pagedPreviewPages.length > 0 ? (
                    <div className="space-y-4">
                      {pagedPreviewPages.map((page, index) => (
                        <article
                          key={`${page.title}-${index}`}
                          className="mx-auto w-full max-w-[560px] rounded-sm border border-slate-200 bg-white px-6 py-5 text-sm text-slate-700 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                        >
                          <p className="mb-3 border-b border-slate-200 pb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:text-slate-400">
                            {page.title}
                          </p>
                          <pre className="whitespace-pre-wrap break-words font-sans leading-relaxed">
                            {page.content}
                          </pre>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-slate-500 dark:text-slate-400">No readable preview text available.</p>
                  )}
                </div>
              </div>
            ) : supportsTextPreview ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                  <span>Document text preview</span>
                  <a className="text-accent-500 underline" href={toFileUrl(file.storedPath)} rel="noreferrer" target="_blank">
                    Open file
                  </a>
                </div>
                <div className="h-[420px] overflow-y-auto rounded-lg border border-slate-200 bg-white p-3 text-sm dark:border-slate-800 dark:bg-slate-900">
                  {previewLoading ? (
                    <p className="text-slate-500 dark:text-slate-400">Loading preview...</p>
                  ) : previewError ? (
                    <p className="text-rose-500">{previewError}</p>
                  ) : previewText && previewText.trim() ? (
                    <pre className="whitespace-pre-wrap break-words font-sans">{previewText}</pre>
                  ) : (
                    <p className="text-slate-500 dark:text-slate-400">No readable preview text available.</p>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex h-[240px] items-center justify-center text-sm text-slate-500 dark:text-slate-400">
                Preview is limited for this format. <a className="ml-1 text-accent-500 underline" href={toFileUrl(file.storedPath)} rel="noreferrer" target="_blank">Open file</a>
              </div>
            )}
          </div>

          <div className="space-y-4">
            <section className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
              <h3 className="text-sm font-semibold">Tags</h3>
              <div className="mt-2 flex flex-wrap gap-2">
                {file.tags.length === 0 ? <p className="text-sm text-slate-500">No tags yet</p> : null}
                {file.tags.map((tag) => (
                  <div key={tag} className="flex items-center gap-1">
                    <TagPill label={tag} />
                    <button
                      className="rounded text-xs text-rose-500 hover:text-rose-600"
                      onClick={() => void onDeleteTag(tag)}
                      type="button"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>

              <div className="mt-3 flex gap-2">
                <input
                  className="flex-1 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-accent-400 dark:border-slate-700 dark:bg-slate-900"
                  onChange={(event) => setTagInput(event.target.value)}
                  placeholder="Add custom tag"
                  value={tagInput}
                />
                <button
                  className="rounded-md bg-accent-500 px-3 py-1.5 text-sm text-white hover:bg-accent-600"
                  onClick={() => {
                    const value = tagInput.trim();
                    if (value) {
                      void onAddTag(value);
                      setTagInput("");
                    }
                  }}
                  type="button"
                >
                  Add
                </button>
              </div>
            </section>

            <section className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
              <h3 className="text-sm font-semibold">Analysis</h3>

              {file.analysis ? (
                <div className="mt-2 space-y-2 text-sm">
                  {file.analysis.mainTopic ? (
                    <p>
                      <span className="font-medium">Main topic:</span> {file.analysis.mainTopic}
                    </p>
                  ) : null}

                  {file.analysis.summary ? (
                    <p>
                      <span className="font-medium">Summary:</span> {file.analysis.summary}
                    </p>
                  ) : null}

                  {file.analysis.sceneDescription ? (
                    <p>
                      <span className="font-medium">Scene:</span> {file.analysis.sceneDescription}
                    </p>
                  ) : null}

                  {file.analysis.moodTone ? (
                    <p>
                      <span className="font-medium">Mood:</span> {file.analysis.moodTone}
                    </p>
                  ) : null}

                  {file.analysis.sentiment ? (
                    <p>
                      <span className="font-medium">Sentiment:</span> {file.analysis.sentiment}
                    </p>
                  ) : null}

                  {file.analysis.dominantColors.length > 0 ? (
                    <div>
                      <p className="font-medium">Dominant colors</p>
                      <ul className="mt-1 space-y-1">
                        {file.analysis.dominantColors.map((color) => (
                          <li key={`${color.hex}-${color.name}`} className="flex items-center gap-2">
                            <span className="inline-block h-3.5 w-3.5 rounded-full border border-slate-300" style={{ backgroundColor: color.hex }} />
                            {color.name} ({color.hex})
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  {file.analysis.entities.length > 0 ? (
                    <p>
                      <span className="font-medium">Entities:</span> {file.analysis.entities.join(", ")}
                    </p>
                  ) : null}

                  {file.analysis.ocrText ? (
                    <p>
                      <span className="font-medium">Detected text:</span> {file.analysis.ocrText}
                    </p>
                  ) : null}
                </div>
              ) : (
                <p className="mt-2 text-sm text-slate-500">No AI analysis yet.</p>
              )}

              <div className="mt-4 flex gap-2">
                {file.status === "error" ? (
                  <button className="rounded-md bg-rose-500 px-3 py-1.5 text-xs font-medium text-white" onClick={() => void onRetry()} type="button">
                    Retry analysis
                  </button>
                ) : null}

                {file.status === "pending" ? (
                  <button className="rounded-md bg-accent-500 px-3 py-1.5 text-xs font-medium text-white" onClick={() => void onAnalyze()} type="button">
                    Run analysis
                  </button>
                ) : null}
              </div>

              {file.errorMessage ? <p className="mt-2 text-xs text-rose-500">{file.errorMessage}</p> : null}
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
