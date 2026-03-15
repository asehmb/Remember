import { useState } from "react";
import type { FileRow } from "../shared/types";
import { formatDate, formatFileSize } from "../lib/utils/format";
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

export function FileDetailModal({
  file,
  onClose,
  onAddTag,
  onDeleteTag,
  onRetry,
  onAnalyze
}: FileDetailModalProps): JSX.Element | null {
  const [tagInput, setTagInput] = useState("");

  if (!file) {
    return null;
  }

  const isImage = [".png", ".jpg", ".jpeg", ".webp"].includes(file.extension);

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
            {isImage ? (
              <img alt={file.originalName} className="mx-auto max-h-[420px] rounded-lg object-contain" src={`file://${file.storedPath}`} />
            ) : file.extension === ".pdf" ? (
              <iframe className="h-[420px] w-full rounded-lg border border-slate-200 dark:border-slate-800" src={`file://${file.storedPath}`} title={file.originalName} />
            ) : (
              <div className="flex h-[240px] items-center justify-center text-sm text-slate-500 dark:text-slate-400">
                Preview is limited for this format. <a className="ml-1 text-accent-500 underline" href={`file://${file.storedPath}`} rel="noreferrer" target="_blank">Open file</a>
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
