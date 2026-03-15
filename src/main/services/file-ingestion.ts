import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { guessMimeType, isSupportedExtension, normalizeExtension } from "../../lib/utils/files";
import type { UploadResult } from "../../shared/types";
import { TagMindRepository } from "../db/repository";
import { AnalysisQueueService } from "./analysis-queue";
import { SettingsService } from "./settings";

export class FileIngestionService {
  constructor(
    private readonly repository: TagMindRepository,
    private readonly settingsService: SettingsService,
    private readonly queueService: AnalysisQueueService,
    private readonly filesDirectory: string
  ) {}

  async ingestPaths(inputPaths: string[]): Promise<UploadResult> {
    await fs.mkdir(this.filesDirectory, { recursive: true });

    const acceptedIds: string[] = [];
    const rejected: UploadResult["rejected"] = [];

    for (const sourcePath of [...new Set(inputPaths)]) {
      const normalizedSourcePath = path.normalize(sourcePath);
      const extension = normalizeExtension(normalizedSourcePath);
      if (!isSupportedExtension(extension)) {
        rejected.push({
          path: normalizedSourcePath,
          reason: `Unsupported file type: ${extension || "unknown"}`
        });
        continue;
      }

      const fileId = crypto.randomUUID();
      const destinationPath = path.join(this.filesDirectory, `${fileId}${extension}`);

      try {
        const stats = await fs.stat(normalizedSourcePath);
        if (!stats.isFile()) {
          rejected.push({
            path: normalizedSourcePath,
            reason: "Path is not a file"
          });
          continue;
        }

        await fs.copyFile(normalizedSourcePath, destinationPath);

        const status = this.settingsService.getAutoAnalyzeOnUpload() ? "queued" : "pending";

        this.repository.insertFile({
          id: fileId,
          originalName: path.basename(normalizedSourcePath),
          sourcePath: normalizedSourcePath,
          storedPath: destinationPath,
          mimeType: guessMimeType(extension),
          extension,
          sizeBytes: stats.size,
          uploadedAt: new Date().toISOString(),
          status
        });

        acceptedIds.push(fileId);

        if (status === "queued") {
          this.queueService.enqueue(fileId);
        }
      } catch (error) {
        rejected.push({
          path: normalizedSourcePath,
          reason: error instanceof Error ? error.message : "File ingestion failed"
        });
      }
    }

    const accepted = acceptedIds
      .map((id) => this.repository.getFile(id))
      .filter((file): file is NonNullable<typeof file> => file !== null);

    return {
      accepted,
      rejected
    };
  }

  triggerAnalysis(fileId: string): void {
    const file = this.repository.getFile(fileId);
    if (!file) {
      throw new Error("File not found");
    }

    this.repository.updateFileStatus(fileId, "queued", null);
    this.queueService.enqueue(fileId);
  }
}
