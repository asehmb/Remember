import { type DragEventHandler, useState } from "react";
import type { JSX } from "react";

interface UploadDropzoneProps {
  onPickFiles: () => Promise<void>;
  onDropPaths: (paths: string[]) => Promise<void>;
}

export function UploadDropzone({ onPickFiles, onDropPaths }: UploadDropzoneProps): JSX.Element {
  const [isDragging, setIsDragging] = useState(false);

  const onDragOver: DragEventHandler<HTMLDivElement> = (event) => {
    event.preventDefault();
    setIsDragging(true);
  };

  const onDragLeave: DragEventHandler<HTMLDivElement> = (event) => {
    event.preventDefault();
    setIsDragging(false);
  };

  const onDrop: DragEventHandler<HTMLDivElement> = (event) => {
    event.preventDefault();
    setIsDragging(false);

    const paths = Array.from(event.dataTransfer.files)
      .map((file) => (file as File & { path?: string }).path)
      .filter((path): path is string => Boolean(path));

    if (paths.length > 0) {
      void onDropPaths(paths);
    }
  };

  return (
    <section
      className={`rounded-2xl border-2 border-dashed p-8 text-center transition ${
        isDragging
          ? "border-accent-400 bg-accent-50 dark:border-accent-300 dark:bg-accent-500/10"
          : "border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900"
      }`}
      onDragLeave={onDragLeave}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <h2 className="text-base font-semibold">Drop files here</h2>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        Supports PDF, TXT, DOCX, PNG, JPG, JPEG, and WEBP
      </p>
      <button
        className="mt-4 rounded-lg bg-accent-500 px-4 py-2 text-sm font-medium text-white shadow hover:bg-accent-600"
        onClick={() => void onPickFiles()}
        type="button"
      >
        Choose Files (Cmd/Ctrl+O)
      </button>
    </section>
  );
}
