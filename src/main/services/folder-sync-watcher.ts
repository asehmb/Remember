import fs from "node:fs";
import { SettingsService } from "./settings";

const SYNC_DEBOUNCE_MS = 1200;

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
    for (const watchFolderPath of watchFolderPaths) {
      try {
        const watcher = fs.watch(watchFolderPath, { recursive: true }, () => {
          this.scheduleSync();
        });

        watcher.on("error", (error) => {
          const message = error instanceof Error ? error.message : String(error);
          console.error(`[tagline] folder watch error for "${watchFolderPath}": ${message}`);
        });

        this.watchers.push(watcher);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[tagline] unable to watch folder "${watchFolderPath}": ${message}`);
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
