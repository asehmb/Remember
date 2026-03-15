import PQueue from "p-queue";
import { extractDocumentText } from "../../lib/parsers";
import { isDocumentExtension, isImageExtension } from "../../lib/utils/files";
import { TagMindRepository } from "../db/repository";
import { OpenAIAnalyzer } from "./openai-analyzer";

function normalizeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown analysis error";
}

export class AnalysisQueueService {
  private readonly queue = new PQueue({ concurrency: 3 });

  constructor(
    private readonly repository: TagMindRepository,
    private readonly analyzer: OpenAIAnalyzer
  ) {}

  enqueue(fileId: string): void {
    this.queue.add(async () => {
      const file = this.repository.getFile(fileId);
      if (!file) {
        throw new Error(`File not found: ${fileId}`);
      }

      this.repository.updateFileStatus(fileId, "processing", null);

      try {
        if (isImageExtension(file.extension)) {
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
