import fs from "node:fs/promises";
import type { Dirent } from "node:fs";
import path from "node:path";
import { isSupportedExtension, normalizeExtension } from "../../lib/utils/files";
import { TagMindRepository } from "../db/repository";
import { FileIngestionService } from "./file-ingestion";
import { SettingsService } from "./settings";

const HEARTBEAT_INTERVAL_MS = 6 * 60 * 60 * 1000;
const MAX_SEEN_MARKERS = 50_000;
const TOP_FILE_ITEMS_LIMIT = 3;
const TOP_TAG_ITEMS_LIMIT = 3;
const MAX_SUMMARY_ITEM_LENGTH = 32;

interface ScannedFile {
  path: string;
  marker: string;
}

interface TopTagItem {
  tag: string;
  count: number;
}

interface HeartbeatSummary {
  trigger: "startup" | "interval" | "manual";
  status: "ok" | "skipped" | "error";
  watchFolderPaths: string[];
  scannedSupportedFileCount: number;
  discoveredNewFileCount: number;
  ingestedFileCount: number;
  removedFileCount: number;
  rejectedFileCount: number;
  topNewFiles: string[];
  topTagItems: TopTagItem[];
  errorCount: number;
  errors: string[];
  startedAt: string;
  finishedAt: string;
  durationMs: number;
}

function normalizeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return "Unknown heartbeat error";
}

function createSeenMarker(filePath: string, sizeBytes: number, modifiedAtMs: number): string {
  return `${path.normalize(filePath)}::${sizeBytes}::${Math.trunc(modifiedAtMs)}`;
}

function parseMarkerFilePath(marker: string): string | null {
  const separatorIndex = marker.indexOf("::");
  if (separatorIndex <= 0) {
    return null;
  }
  return marker.slice(0, separatorIndex);
}

function isPathWithinRoot(filePath: string, rootPath: string): boolean {
  const normalizedFilePath = path.normalize(filePath);
  const normalizedRootPath = path.normalize(rootPath);
  return (
    normalizedFilePath === normalizedRootPath ||
    normalizedFilePath.startsWith(`${normalizedRootPath}${path.sep}`)
  );
}

function sanitizeSummaryToken(value: string): string {
  return value.replace(/[,\n\r;|]+/g, " ").replace(/\s+/g, " ").trim();
}

function truncateSummaryToken(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength - 1)}…`;
}

function formatSummaryFileItem(filePath: string): string {
  const normalized = sanitizeSummaryToken(path.basename(filePath));
  return truncateSummaryToken(normalized, MAX_SUMMARY_ITEM_LENGTH);
}

function summarizeTopNewFiles(filePaths: string[]): string[] {
  const deduped = new Set<string>();
  for (const filePath of filePaths) {
    const item = formatSummaryFileItem(filePath);
    if (!item) {
      continue;
    }
    deduped.add(item);
  }

  return [...deduped]
    .sort((left, right) => left.localeCompare(right))
    .slice(0, TOP_FILE_ITEMS_LIMIT);
}

function summarizeTopTagItems(scannedFiles: ScannedFile[]): TopTagItem[] {
  const countsByTag = new Map<string, number>();
  for (const file of scannedFiles) {
    const extension = normalizeExtension(file.path);
    if (!extension) {
      continue;
    }
    countsByTag.set(extension, (countsByTag.get(extension) ?? 0) + 1);
  }

  return [...countsByTag.entries()]
    .sort((left, right) => {
      if (right[1] !== left[1]) {
        return right[1] - left[1];
      }
      return left[0].localeCompare(right[0]);
    })
    .slice(0, TOP_TAG_ITEMS_LIMIT)
    .map(([tag, count]) => ({ tag, count }));
}

function summarize(summary: HeartbeatSummary): string {
  const topFiles = summary.topNewFiles.length > 0 ? summary.topNewFiles.join(", ") : "none";
  const topTags =
    summary.topTagItems.length > 0
      ? summary.topTagItems.map(({ tag, count }) => `${tag}(${count})`).join(", ")
      : "none";

  return [
    `heartbeat ${summary.trigger}/${summary.status}`,
    `watch paths=${summary.watchFolderPaths.length}`,
    `counts scanned=${summary.scannedSupportedFileCount} new=${summary.discoveredNewFileCount} ingested=${summary.ingestedFileCount} removed=${summary.removedFileCount} rejected=${summary.rejectedFileCount} errors=${summary.errorCount}`,
    `topFiles ${topFiles}`,
    `topTags ${topTags}`
  ].join("; ");
}

export class HeartbeatService {
  private timer: NodeJS.Timeout | null = null;
  private activeRun: Promise<void> | null = null;

  constructor(
    private readonly settingsService: SettingsService,
    private readonly ingestionService: FileIngestionService,
    private readonly repository: TagMindRepository
  ) {}

  start(): void {
    if (this.timer) {
      return;
    }

    this.timer = setInterval(() => {
      void this.run("interval");
    }, HEARTBEAT_INTERVAL_MS);

    void this.run("startup");
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  runNow(): Promise<void> {
    return this.run("manual");
  }

  private async run(trigger: HeartbeatSummary["trigger"]): Promise<void> {
    if (this.activeRun) {
      return this.activeRun;
    }

    this.activeRun = this.executeHeartbeat(trigger).finally(() => {
      this.activeRun = null;
    });

    return this.activeRun;
  }

  private async executeHeartbeat(trigger: HeartbeatSummary["trigger"]): Promise<void> {
    const startedAt = new Date();
    const summary: HeartbeatSummary = {
      trigger,
      status: "ok",
      watchFolderPaths: [],
      scannedSupportedFileCount: 0,
      discoveredNewFileCount: 0,
      ingestedFileCount: 0,
      removedFileCount: 0,
      rejectedFileCount: 0,
      topNewFiles: [],
      topTagItems: [],
      errorCount: 0,
      errors: [],
      startedAt: startedAt.toISOString(),
      finishedAt: startedAt.toISOString(),
      durationMs: 0
    };

    let persistedMarkers = this.settingsService.getHeartbeatSeenFileMarkers();
    try {
      const watchFolderPaths = this.settingsService.getWatchFolderPaths();
      summary.watchFolderPaths = [...watchFolderPaths];

      if (watchFolderPaths.length === 0) {
        summary.status = "skipped";
        summary.errors.push("Heartbeat skipped: watch folders are not configured.");
        return;
      }

      const scanErrors: string[] = [];
      const scannedByPath = new Map<string, ScannedFile>();
      const scannedRootPaths: string[] = [];
      for (const watchFolderPath of watchFolderPaths) {
        let rootStats;
        try {
          rootStats = await fs.stat(watchFolderPath);
        } catch (error) {
          scanErrors.push(
            `Unable to access watch folder "${watchFolderPath}": ${normalizeError(error)}`
          );
          continue;
        }

        if (!rootStats.isDirectory()) {
          scanErrors.push(`Watch folder path is not a directory: ${watchFolderPath}`);
          continue;
        }

        const scannedFilesForRoot = await this.scanSupportedFiles(watchFolderPath, scanErrors);
        scannedRootPaths.push(watchFolderPath);
        for (const scannedFile of scannedFilesForRoot) {
          scannedByPath.set(scannedFile.path, scannedFile);
        }
      }

      const scannedFiles = [...scannedByPath.values()];
      summary.scannedSupportedFileCount = scannedFiles.length;
      summary.topTagItems = summarizeTopTagItems(scannedFiles);
      summary.errors.push(...scanErrors);

      const scannedMarkerSet = new Set(scannedFiles.map((file) => file.marker));
      const seenMarkers = new Set(
        persistedMarkers.filter((marker) => {
          const markerPath = parseMarkerFilePath(marker);
          if (!markerPath) {
            return false;
          }

          const belongsToScannedRoots = scannedRootPaths.some((rootPath) =>
            isPathWithinRoot(markerPath, rootPath)
          );
          if (!belongsToScannedRoots) {
            return true;
          }

          return scannedMarkerSet.has(marker);
        })
      );
      const markerByPath = new Map(scannedFiles.map((file) => [file.path, file.marker]));
      const newFilePaths = scannedFiles
        .filter((file) => !seenMarkers.has(file.marker))
        .map((file) => file.path);

      summary.discoveredNewFileCount = newFilePaths.length;
      summary.topNewFiles = summarizeTopNewFiles(newFilePaths);

      if (newFilePaths.length > 0) {
        const ingestionResult = await this.ingestionService.ingestPaths(newFilePaths);
        summary.ingestedFileCount = ingestionResult.accepted.length;
        summary.rejectedFileCount = ingestionResult.rejected.length;

        for (const rejection of ingestionResult.rejected) {
          summary.errors.push(`Ingestion rejected "${rejection.path}": ${rejection.reason}`);
        }

        const rejectedPathSet = new Set(ingestionResult.rejected.map((entry) => entry.path));
        for (const filePath of newFilePaths) {
          if (rejectedPathSet.has(filePath)) {
            continue;
          }
          const marker = markerByPath.get(filePath);
          if (marker) {
            seenMarkers.add(marker);
          }
        }
      }

      const scannedPathSet = new Set(scannedFiles.map((file) => file.path));
      const trackedSourceFiles = this.repository.listTrackedSourceFilesByRoots(scannedRootPaths);
      const sourcePathsToRemove = trackedSourceFiles
        .map((trackedFile) => trackedFile.sourcePath)
        .filter((sourcePath) => !scannedPathSet.has(sourcePath));
      summary.removedFileCount = sourcePathsToRemove.length;

      if (sourcePathsToRemove.length > 0) {
        const storedPathsToRemove = this.repository.removeFilesBySourcePaths(sourcePathsToRemove);
        for (const storedPath of storedPathsToRemove) {
          try {
            await fs.rm(storedPath, { force: true });
          } catch (error) {
            summary.errors.push(
              `Failed to remove stored file "${storedPath}": ${normalizeError(error)}`
            );
          }
        }
      }

      persistedMarkers = [...seenMarkers];
      if (persistedMarkers.length > MAX_SEEN_MARKERS) {
        persistedMarkers = persistedMarkers
          .sort((left, right) => left.localeCompare(right))
          .slice(persistedMarkers.length - MAX_SEEN_MARKERS);
      }
      this.settingsService.setHeartbeatSeenFileMarkers(persistedMarkers);
      if (summary.errors.length > 0) {
        summary.status = "error";
      }
    } catch (error) {
      summary.status = "error";
      summary.errors.push(normalizeError(error));
    } finally {
      const finishedAt = new Date();
      summary.finishedAt = finishedAt.toISOString();
      summary.durationMs = finishedAt.getTime() - startedAt.getTime();
      summary.errorCount = summary.errors.length;

      try {
        this.settingsService.setHeartbeatMetadata(summary.finishedAt, summarize(summary));
      } catch (error) {
        const metadataError = `Failed to persist heartbeat metadata: ${normalizeError(error)}`;
        console.error(`[tagline] ${metadataError}`);
      }

      if (summary.status === "error") {
        console.error(`[tagline] heartbeat failed: ${summarize(summary)}`);
      } else {
        console.log(`[tagline] heartbeat completed: ${summarize(summary)}`);
      }
    }
  }

  private async scanSupportedFiles(rootPath: string, errors: string[]): Promise<ScannedFile[]> {
    const files: ScannedFile[] = [];
    const pendingDirectories = [rootPath];

    while (pendingDirectories.length > 0) {
      const currentDirectory = pendingDirectories.pop();
      if (!currentDirectory) {
        continue;
      }

      let entries: Dirent[];
      try {
        entries = await fs.readdir(currentDirectory, { withFileTypes: true });
      } catch (error) {
        errors.push(`Unable to read directory "${currentDirectory}": ${normalizeError(error)}`);
        continue;
      }

      for (const entry of entries) {
        const entryPath = path.join(currentDirectory, entry.name);
        if (entry.isDirectory()) {
          pendingDirectories.push(entryPath);
          continue;
        }

        if (!entry.isFile()) {
          continue;
        }

        const extension = normalizeExtension(entry.name);
        if (!isSupportedExtension(extension)) {
          continue;
        }

        try {
          const stats = await fs.stat(entryPath);
          if (!stats.isFile()) {
            continue;
          }

          files.push({
            path: entryPath,
            marker: createSeenMarker(entryPath, stats.size, stats.mtimeMs)
          });
        } catch (error) {
          errors.push(`Unable to stat file "${entryPath}": ${normalizeError(error)}`);
        }
      }
    }

    return files;
  }
}
