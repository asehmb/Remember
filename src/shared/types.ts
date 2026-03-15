import type { AiProviderId } from "./ai";

export const SUPPORTED_EXTENSIONS = [
  ".pdf",
  ".txt",
  ".docx",
  ".png",
  ".jpg",
  ".jpeg",
  ".webp"
] as const;

export type SupportedExtension = (typeof SUPPORTED_EXTENSIONS)[number];

export type FileProcessStatus = "queued" | "pending" | "processing" | "done" | "error";

export type Sentiment = "positive" | "neutral" | "negative";

export interface DominantColor {
  name: string;
  hex: string;
}

export interface FileAnalysis {
  mainTopic: string | null;
  summary: string | null;
  sceneDescription: string | null;
  moodTone: string | null;
  sentiment: Sentiment | null;
  dominantColors: DominantColor[];
  entities: string[];
  ocrText: string | null;
  keywordTags: string[];
  modelUsed: string | null;
}

export interface FileRow {
  id: string;
  originalName: string;
  sourcePath: string | null;
  storedPath: string;
  mimeType: string;
  extension: string;
  sizeBytes: number;
  uploadedAt: string;
  processedAt: string | null;
  status: FileProcessStatus;
  errorMessage: string | null;
  tags: string[];
  analysis: FileAnalysis | null;
}

export interface LibraryFilters {
  query: string;
  fileType: string | null;
  dominantColor: string | null;
  sentiment: Sentiment | null;
  uploadedWithin: "all" | "7d" | "30d" | "365d";
  selectedTag: string | null;
}

export interface SearchResult {
  file: FileRow;
  matchedTags: string[];
}

export interface TagCloudItem {
  tag: string;
  count: number;
}

export interface AppSettings {
  autoAnalyzeOnUpload: boolean;
  restApiEnabled: boolean;
  restApiPort: number;
  watchFolderPaths: string[];
  lastHeartbeatAt: string | null;
  lastHeartbeatSummary: string | null;
  aiProvider: AiProviderId;
  aiBaseUrl: string | null;
  aiChatModel: string;
  aiVisionModel: string;
  aiProfiles: AiProfile[];
  activeAiProfileId: string | null;
  hasApiKey: boolean;
}

export interface AiProfile {
  id: string;
  name: string;
  provider: AiProviderId;
  baseUrl: string | null;
  chatModel: string;
  visionModel: string;
}

export interface UploadResult {
  accepted: FileRow[];
  rejected: Array<{ path: string; reason: string }>;
}

export interface TagMindAPI {
  pickFiles: () => Promise<UploadResult>;
  pickFolderPath: () => Promise<string | null>;
  ingestFilePaths: (paths: string[]) => Promise<UploadResult>;
  listFiles: (filters: LibraryFilters) => Promise<SearchResult[]>;
  getFile: (fileId: string) => Promise<FileRow | null>;
  getTagCloud: () => Promise<TagCloudItem[]>;
  addManualTag: (fileId: string, tag: string) => Promise<void>;
  deleteTag: (fileId: string, tag: string) => Promise<void>;
  retryAnalysis: (fileId: string) => Promise<void>;
  triggerAnalysis: (fileId: string) => Promise<void>;
  getSettings: () => Promise<AppSettings>;
  setAutoAnalyzeOnUpload: (enabled: boolean) => Promise<void>;
  setRestApiEnabled: (enabled: boolean) => Promise<void>;
  setWatchFolderPaths: (watchFolderPaths: string[]) => Promise<void>;
  setAiProvider: (provider: AiProviderId) => Promise<void>;
  setAiBaseUrl: (baseUrl: string | null) => Promise<void>;
  setAiModels: (models: { chatModel: string; visionModel: string }) => Promise<void>;
  saveAiProfile: (profile: {
    profileId: string | null;
    name: string;
    provider: AiProviderId;
    baseUrl: string | null;
    chatModel: string;
    visionModel: string;
  }) => Promise<void>;
  applyAiProfile: (profileId: string) => Promise<void>;
  deleteAiProfile: (profileId: string) => Promise<void>;
  setApiKey: (apiKey: string) => Promise<void>;
  clearApiKey: () => Promise<void>;
  clearLibrary: () => Promise<void>;
}
