import { useEffect, useMemo, useState } from "react";
import { FileDetailModal } from "../components/FileDetailModal";
import { SearchInput } from "../components/SearchInput";
import { useLibraryData } from "../hooks/useLibraryData";
import { useTagCloud } from "../hooks/useTagCloud";
import { LibraryPage } from "../pages/LibraryPage";
import { SettingsPage } from "../pages/SettingsPage";
import type { AppSettings, FileRow, LibraryStatusCounts } from "../shared/types";
import { useUIStore } from "../store/uiStore";
import type { JSX } from "react";

const EMPTY_STATUS_COUNTS: LibraryStatusCounts = {
  queued: 0,
  pending: 0,
  processing: 0,
  done: 0,
  error: 0
};

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
  const [libraryStatusCounts, setLibraryStatusCounts] = useState<LibraryStatusCounts>(
    EMPTY_STATUS_COUNTS
  );

  const refreshSettings = async (): Promise<void> => {
    const next = await window.remember.getSettings();
    setSettings(next);
  };

  const refreshAll = async (): Promise<void> => {
    await Promise.all([
      refresh(),
      refreshTagCloud(),
      refreshSettings(),
      window.remember.getLibraryStatusCounts().then(setLibraryStatusCounts)
    ]);
  };

  useEffect(() => {
    void refreshSettings();
  }, []);

  useEffect(() => {
    const run = async (): Promise<void> => {
      const counts = await window.remember.getLibraryStatusCounts();
      setLibraryStatusCounts(counts);
    };

    void run();
    const interval = window.setInterval(() => {
      void run();
    }, 1500);

    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!selectedFileId) {
      setSelectedFile(null);
      return;
    }

    const run = async (): Promise<void> => {
      const file = await window.remember.getFile(selectedFileId);
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
          void window.remember.triggerAnalysis(fileId).then(refreshAll);
        }}
        onDropPaths={async (paths) => {
          const output = await window.remember.ingestFilePaths(paths);
          if (output.rejected.length > 0) {
            setToast(output.rejected.map((item) => `${item.path}: ${item.reason}`).join(" | "));
          }
          await refreshAll();
        }}
        onOpenFile={setSelectedFileId}
        onPickFiles={async () => {
          const output = await window.remember.pickFiles();
          if (output.rejected.length > 0) {
            setToast(output.rejected.map((item) => `${item.path}: ${item.reason}`).join(" | "));
          }
          await refreshAll();
        }}
        onRetry={(fileId) => {
          void window.remember.retryAnalysis(fileId).then(refreshAll);
        }}
        onRetryAllFailed={() => {
          void window.remember.retryAllFailedAnalysis().then((count) => {
            setToast(count > 0 ? `Queued ${count} failed scan${count === 1 ? "" : "s"}.` : "No failed scans to retry.");
            void refreshAll();
          });
        }}
        onSelectTag={(tag) => setFilter("selectedTag", tag)}
        onSetViewMode={setViewMode}
        query={filters.query}
        results={results}
        selectedTag={filters.selectedTag}
        tagCloud={tagCloud}
        hasQueuedFiles={libraryStatusCounts.queued > 0}
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
    libraryStatusCounts.queued,
    viewMode
  ]);

  return (
    <div className="no-drag flex h-full overflow-hidden bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="drag-region border-b border-slate-200 bg-white/70 px-6 py-4 backdrop-blur dark:border-slate-800 dark:bg-slate-900/70">
          <div className="h-5" />
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <h1 className="shrink-0 text-lg font-semibold tracking-tight">Remember</h1>
              <SearchInput onChange={(value) => setFilter("query", value)} value={filters.query} />
            </div>
            <button
              className="no-drag rounded-md border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
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
                await window.remember.clearApiKey();
                await refreshSettings();
              }}
              onClearLibrary={async () => {
                await window.remember.clearLibrary();
                await refreshAll();
              }}
              onSaveApiKey={async (apiKey) => {
                await window.remember.setApiKey(apiKey);
                await refreshSettings();
              }}
              onToggleAutoAnalyze={async (enabled) => {
                await window.remember.setAutoAnalyzeOnUpload(enabled);
                await refreshSettings();
              }}
              onSetAiRequestDelay={async (delayMs) => {
                await window.remember.setAiRequestDelayMs(delayMs);
                await refreshSettings();
              }}
              onToggleRestApi={async (enabled) => {
                await window.remember.setRestApiEnabled(enabled);
                await refreshSettings();
              }}
              onSetWatchFolderPaths={async (watchFolderPaths) => {
                await window.remember.setWatchFolderPaths(watchFolderPaths);
                await refreshSettings();
              }}
              onSetWatchFolderExcludePaths={async (watchFolderExcludePaths) => {
                await window.remember.setWatchFolderExcludePaths(watchFolderExcludePaths);
                await refreshSettings();
              }}
              onBrowseWatchFolderPath={async () => {
                return window.remember.pickFolderPath();
              }}
              onSaveAiProfile={async (profile) => {
                await window.remember.saveAiProfile(profile);
                await refreshSettings();
              }}
              onApplyAiProfile={async (profileId) => {
                await window.remember.applyAiProfile(profileId);
                await refreshSettings();
              }}
              onDeleteAiProfile={async (profileId) => {
                await window.remember.deleteAiProfile(profileId);
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
          await window.remember.addManualTag(selectedFile.id, tag);
          await refreshAll();
        }}
        onAnalyze={async () => {
          if (!selectedFile) return;
          await window.remember.triggerAnalysis(selectedFile.id);
          await refreshAll();
        }}
        onClose={() => setSelectedFileId(null)}
        onDeleteTag={async (tag) => {
          if (!selectedFile) return;
          await window.remember.deleteTag(selectedFile.id, tag);
          await refreshAll();
        }}
        onRetry={async () => {
          if (!selectedFile) return;
          await window.remember.retryAnalysis(selectedFile.id);
          await refreshAll();
        }}
      />
    </div>
  );
}
