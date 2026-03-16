import PQueue from "p-queue";
import { extractDocumentText } from "../../lib/parsers";
import { isDocumentExtension, isImageExtension } from "../../lib/utils/files";
import { RememberRepository } from "../db/repository";
import { OpenAIAnalyzer } from "./openai-analyzer";

function normalizeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown analysis error";
}

class AnalysisCancelledError extends Error {
  constructor() {
    super("Analysis cancelled");
  }
}

export class AnalysisQueueService {
  private readonly queue = new PQueue({ concurrency: 3 });
  private nextRequestSlot: Promise<void> = Promise.resolve();
  private lastRequestStartedAt = 0;
  private readonly cancelledFileIds = new Set<string>();
  private readonly queuedFileIds = new Set<string>();
  private readonly activeFileIds = new Set<string>();

  constructor(
    private readonly repository: RememberRepository,
    private readonly analyzer: OpenAIAnalyzer,
    private readonly getRequestDelayMs: () => number
  ) {}

  private resolvedDelayMs(): number {
    const delayMs = this.getRequestDelayMs();
    if (!Number.isFinite(delayMs)) {
      return 0;
    }
    return Math.max(0, Math.floor(delayMs));
  }

  private async waitForRequestSlot(): Promise<void> {
    const previousSlot = this.nextRequestSlot;
    let releaseSlot: () => void = () => {};
    this.nextRequestSlot = new Promise<void>((resolve) => {
      releaseSlot = resolve;
    });

    await previousSlot;

    try {
      const delayMs = this.resolvedDelayMs();
      if (delayMs > 0) {
        const now = Date.now();
        const nextAllowedAt = this.lastRequestStartedAt + delayMs;
        const waitMs = Math.max(0, nextAllowedAt - now);
        if (waitMs > 0) {
          await new Promise<void>((resolve) => {
            setTimeout(resolve, waitMs);
          });
        }
      }
      this.lastRequestStartedAt = Date.now();
    } finally {
      releaseSlot();
    }
  }

  cancel(fileId: string): void {
    this.cancelledFileIds.add(fileId);
  }

  private throwIfCancelled(fileId: string): void {
    if (this.cancelledFileIds.has(fileId)) {
      throw new AnalysisCancelledError();
    }
  }

  enqueue(fileId: string): void {
    if (this.queuedFileIds.has(fileId) || this.activeFileIds.has(fileId)) {
      return;
    }

    this.cancelledFileIds.delete(fileId);
    this.queuedFileIds.add(fileId);

    this.queue.add(async () => {
      this.queuedFileIds.delete(fileId);
      if (this.cancelledFileIds.has(fileId)) {
        this.cancelledFileIds.delete(fileId);
        return;
      }

      const file = this.repository.getFile(fileId);
      if (!file) {
        this.cancelledFileIds.delete(fileId);
        return;
      }

      this.activeFileIds.add(fileId);

      try {
        this.throwIfCancelled(fileId);
        this.repository.updateFileStatus(fileId, "processing", null);

        if (isImageExtension(file.extension)) {
          await this.waitForRequestSlot();
          this.throwIfCancelled(fileId);
          const analysis = await this.analyzer.analyzeImage({
            filePath: file.storedPath,
            mimeType: file.mimeType,
            originalName: file.originalName
          });
          this.throwIfCancelled(fileId);
          this.repository.saveAnalysis(fileId, analysis);
          this.throwIfCancelled(fileId);
          this.repository.updateFileStatus(fileId, "done", null);
          return;
        }

        if (isDocumentExtension(file.extension)) {
          const text = await extractDocumentText(file.storedPath, file.extension);
          this.throwIfCancelled(fileId);
          await this.waitForRequestSlot();
          this.throwIfCancelled(fileId);
          const analysis = await this.analyzer.analyzeDocument({
            text,
            originalName: file.originalName
          });
          this.throwIfCancelled(fileId);
          this.repository.saveAnalysis(fileId, analysis);
          this.throwIfCancelled(fileId);
          this.repository.updateFileStatus(fileId, "done", null);
          return;
        }

        throw new Error(`Unsupported extension for analysis: ${file.extension}`);
      } catch (error) {
        if (error instanceof AnalysisCancelledError) {
          this.repository.updateFileStatus(fileId, "pending", null);
          return;
        }
        this.repository.updateFileStatus(fileId, "error", normalizeError(error));
      } finally {
        this.activeFileIds.delete(fileId);
        this.cancelledFileIds.delete(fileId);
      }
    });
  }
}
