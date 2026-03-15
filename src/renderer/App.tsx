import { useEffect, useMemo, useState } from "react";
import { FileDetailModal } from "../components/FileDetailModal";
import { SearchInput } from "../components/SearchInput";
import { useLibraryData } from "../hooks/useLibraryData";
import { useTagCloud } from "../hooks/useTagCloud";
import { LibraryPage } from "../pages/LibraryPage";
import { SettingsPage } from "../pages/SettingsPage";
import type { AppSettings, FileRow } from "../shared/types";
import { useUIStore } from "../store/uiStore";
import type { JSX } from "react";

export function App(): JSX.Element {
  const {
    filters,
    setFilter,
    viewMode,
    setViewMode,
    selectedFileId,
    setSelectedFileId
  } = useUIStore();

  const { results, loading, error, refresh } = useLibraryData(filters);
  const { items: tagCloud, refresh: refreshTagCloud } = useTagCloud();
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<FileRow | null>(null);

  const refreshSettings = async (): Promise<void> => {
    const next = await window.tagmind.getSettings();
    setSettings(next);
  };

  const refreshAll = async (): Promise<void> => {
    await Promise.all([refresh(), refreshTagCloud(), refreshSettings()]);
  };

  useEffect(() => {
    void refreshSettings();
  }, []);

  useEffect(() => {
    if (!selectedFileId) {
      setSelectedFile(null);
      return;
    }

    const run = async (): Promise<void> => {
      const file = await window.tagmind.getFile(selectedFileId);
      setSelectedFile(file);
    };

    void run();

    const interval = window.setInterval(() => {
      void run();
    }, 1500);

    return () => window.clearInterval(interval);
  }, [selectedFileId]);

  useEffect(() => {
    if (!isSettingsOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        setIsSettingsOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isSettingsOpen]);

  const currentPage = useMemo(() => {
    return (
      <LibraryPage
        error={error}
        loading={loading}
        onAnalyze={(fileId) => {
          void window.tagmind.triggerAnalysis(fileId).then(refreshAll);
        }}
        onDropPaths={async (paths) => {
          const output = await window.tagmind.ingestFilePaths(paths);
          if (output.rejected.length > 0) {
            setToast(output.rejected.map((item) => `${item.path}: ${item.reason}`).join(" | "));
          }
          await refreshAll();
        }}
        onOpenFile={setSelectedFileId}
        onPickFiles={async () => {
          const output = await window.tagmind.pickFiles();
          if (output.rejected.length > 0) {
            setToast(output.rejected.map((item) => `${item.path}: ${item.reason}`).join(" | "));
          }
          await refreshAll();
        }}
        onRetry={(fileId) => {
          void window.tagmind.retryAnalysis(fileId).then(refreshAll);
        }}
        onSelectTag={(tag) => setFilter("selectedTag", tag)}
        onSetViewMode={setViewMode}
        query={filters.query}
        results={results}
        selectedTag={filters.selectedTag}
        tagCloud={tagCloud}
        viewMode={viewMode}
      />
    );
  }, [
    error,
    filters,
    loading,
    refreshAll,
    results,
    setFilter,
    setSelectedFileId,
    setViewMode,
    tagCloud,
    viewMode
  ]);

  return (
    <div className="no-drag flex h-full overflow-hidden bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="no-drag border-b border-slate-200 bg-white/70 px-6 py-4 backdrop-blur dark:border-slate-800 dark:bg-slate-900/70">
          <div className="h-2" />
          <div className="no-drag flex items-center justify-between gap-3">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <h1 className="shrink-0 text-lg font-semibold tracking-tight">TagLine</h1>
              <SearchInput onChange={(value) => setFilter("query", value)} value={filters.query} />
            </div>
            <button
              className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
              onClick={() => setIsSettingsOpen(true)}
              type="button"
            >
              Settings
            </button>
          </div>

          {toast ? (
            <div className="mt-2 rounded-md bg-amber-100 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/70 dark:text-amber-300">
              {toast}
            </div>
          ) : null}
        </header>

        <section className={`no-drag flex-1 p-6 ${isSettingsOpen ? "overflow-y-hidden" : "overflow-y-auto"}`}>
          {currentPage}
        </section>
      </main>

      {isSettingsOpen ? (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/45 p-6"
          onClick={() => setIsSettingsOpen(false)}
          role="presentation"
        >
          <div
            className="max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-4 shadow-xl dark:border-slate-800 dark:bg-slate-950"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Settings"
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold">Settings</h2>
              <button
                className="rounded-md border border-slate-300 px-3 py-1 text-sm hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
                onClick={() => setIsSettingsOpen(false)}
                type="button"
              >
                Close
              </button>
            </div>
            <SettingsPage
              onClearApiKey={async () => {
                await window.tagmind.clearApiKey();
                await refreshSettings();
              }}
              onClearLibrary={async () => {
                await window.tagmind.clearLibrary();
                await refreshAll();
              }}
              onSaveApiKey={async (apiKey) => {
                await window.tagmind.setApiKey(apiKey);
                await refreshSettings();
              }}
              onToggleAutoAnalyze={async (enabled) => {
                await window.tagmind.setAutoAnalyzeOnUpload(enabled);
                await refreshSettings();
              }}
              onToggleRestApi={async (enabled) => {
                await window.tagmind.setRestApiEnabled(enabled);
                await refreshSettings();
              }}
              onSetWatchFolderPaths={async (watchFolderPaths) => {
                await window.tagmind.setWatchFolderPaths(watchFolderPaths);
                await refreshSettings();
              }}
              onBrowseWatchFolderPath={async () => {
                return window.tagmind.pickFolderPath();
              }}
              onSaveAiProfile={async (profile) => {
                await window.tagmind.saveAiProfile(profile);
                await refreshSettings();
              }}
              onApplyAiProfile={async (profileId) => {
                await window.tagmind.applyAiProfile(profileId);
                await refreshSettings();
              }}
              onDeleteAiProfile={async (profileId) => {
                await window.tagmind.deleteAiProfile(profileId);
                await refreshSettings();
              }}
              settings={settings}
            />
          </div>
        </div>
      ) : null}

      <FileDetailModal
        file={selectedFile}
        onAddTag={async (tag) => {
          if (!selectedFile) return;
          await window.tagmind.addManualTag(selectedFile.id, tag);
          await refreshAll();
        }}
        onAnalyze={async () => {
          if (!selectedFile) return;
          await window.tagmind.triggerAnalysis(selectedFile.id);
          await refreshAll();
        }}
        onClose={() => setSelectedFileId(null)}
        onDeleteTag={async (tag) => {
          if (!selectedFile) return;
          await window.tagmind.deleteTag(selectedFile.id, tag);
          await refreshAll();
        }}
        onRetry={async () => {
          if (!selectedFile) return;
          await window.tagmind.retryAnalysis(selectedFile.id);
          await refreshAll();
        }}
      />
    </div>
  );
}
