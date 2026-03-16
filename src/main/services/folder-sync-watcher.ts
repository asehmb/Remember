import fs from "node:fs";
import path from "node:path";
import { SettingsService } from "./settings";

const SYNC_DEBOUNCE_MS = 1200;

function isPathWithinRoot(filePath: string, rootPath: string): boolean {
  const normalizedFilePath = path.normalize(filePath);
  const normalizedRootPath = path.normalize(rootPath);
  return (
    normalizedFilePath === normalizedRootPath ||
    normalizedFilePath.startsWith(`${normalizedRootPath}${path.sep}`)
  );
}

function isPathExcluded(filePath: string, excludedRootPaths: string[]): boolean {
  return excludedRootPaths.some((excludedRootPath) => isPathWithinRoot(filePath, excludedRootPath));
}

export class FolderSyncWatcherService {
  private watchers: fs.FSWatcher[] = [];
  private syncTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly settingsService: SettingsService,
    private readonly runSync: () => Promise<void>
  ) {}

  start(): void {
    this.refresh();
  }

  refresh(): void {
    this.stopWatchers();

    const watchFolderPaths = this.settingsService.getWatchFolderPaths();
    const watchFolderExcludePaths = this.settingsService.getWatchFolderExcludePaths();
    for (const watchFolderPath of watchFolderPaths) {
      const excludedPathsForRoot = watchFolderExcludePaths.filter((excludedPath) =>
        isPathWithinRoot(excludedPath, watchFolderPath)
      );
      try {
        const watcher = fs.watch(
          watchFolderPath,
          { recursive: true },
          (_eventType, relativePath) => {
            if (relativePath) {
              const relativeValue = relativePath.toString();
              if (relativeValue) {
                const changedPath = path.join(watchFolderPath, relativeValue);
                if (isPathExcluded(changedPath, excludedPathsForRoot)) {
                  return;
                }
              }
            }

            this.scheduleSync();
          }
        );

        watcher.on("error", (error) => {
          const message = error instanceof Error ? error.message : String(error);
          console.error(`[remember] folder watch error for "${watchFolderPath}": ${message}`);
        });

        this.watchers.push(watcher);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[remember] unable to watch folder "${watchFolderPath}": ${message}`);
      }
    }
  }

  stop(): void {
    if (this.syncTimer) {
      clearTimeout(this.syncTimer);
      this.syncTimer = null;
    }
    this.stopWatchers();
  }

  private scheduleSync(): void {
    if (this.syncTimer) {
      clearTimeout(this.syncTimer);
    }

    this.syncTimer = setTimeout(() => {
      this.syncTimer = null;
      void this.runSync();
    }, SYNC_DEBOUNCE_MS);
  }

  private stopWatchers(): void {
    for (const watcher of this.watchers) {
      watcher.close();
    }
    this.watchers = [];
  }
}
