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

export class AnalysisQueueService {
  private readonly queue = new PQueue({ concurrency: 3 });
  private nextRequestSlot: Promise<void> = Promise.resolve();
  private lastRequestStartedAt = 0;

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

  enqueue(fileId: string): void {
    this.queue.add(async () => {
      const file = this.repository.getFile(fileId);
      if (!file) {
        throw new Error(`File not found: ${fileId}`);
      }

      this.repository.updateFileStatus(fileId, "processing", null);

      try {
        if (isImageExtension(file.extension)) {
          await this.waitForRequestSlot();
          const analysis = await this.analyzer.analyzeImage({
            filePath: file.storedPath,
            mimeType: file.mimeType,
            originalName: file.originalName
          });
          this.repository.saveAnalysis(fileId, analysis);
          this.repository.updateFileStatus(fileId, "done", null);
          return;
        }

        if (isDocumentExtension(file.extension)) {
          const text = await extractDocumentText(file.storedPath, file.extension);
          await this.waitForRequestSlot();
          const analysis = await this.analyzer.analyzeDocument({
            text,
            originalName: file.originalName
          });
          this.repository.saveAnalysis(fileId, analysis);
          this.repository.updateFileStatus(fileId, "done", null);
          return;
        }

        throw new Error(`Unsupported extension for analysis: ${file.extension}`);
      } catch (error) {
        this.repository.updateFileStatus(fileId, "error", normalizeError(error));
      }
    });
  }
}
