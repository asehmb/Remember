import path from "node:path";
import fs from "node:fs/promises";
import { pathToFileURL } from "node:url";
import {
  BrowserWindow,
  app,
  dialog,
  globalShortcut,
  ipcMain,
  net,
  nativeTheme,
  protocol,
  shell,
} from "electron";
import type { LibraryFilters, UploadResult } from "../shared/types";
import { extractDocumentText } from "../lib/parsers";
import {
  guessMimeType,
  isDocumentExtension,
  normalizeExtension,
} from "../lib/utils/files";
import { CHANNELS } from "./ipc/channels";
import { createDatabase } from "./db/database";
import { RememberRepository } from "./db/repository";
import { SettingsService } from "./services/settings";
import { OpenAIAnalyzer } from "./services/openai-analyzer";
import { AnalysisQueueService } from "./services/analysis-queue";
import { FileIngestionService } from "./services/file-ingestion";
import { HeartbeatService } from "./services/heartbeat";
import { FolderSyncWatcherService } from "./services/folder-sync-watcher";
import {
  createLocalRestServer,
  type LocalRestServer,
  type RestServerRouteHandlers,
} from "./services/rest-server";
import type { AiProviderId } from "../shared/ai";

const isDev = process.env.NODE_ENV === "development";
const devServerUrl = process.env.VITE_DEV_SERVER_URL ?? "http://localhost:5173";
const APP_DISPLAY_NAME = "Remember";
const USER_DATA_DIRECTORY_NAME = "Remember";
const LEGACY_USER_DATA_DIRECTORY_NAMES = ["TagLine", "TagMind"] as const;
const REST_SEARCH_LIMIT = 25;
const APP_FILE_PROTOCOL = "remember-file";
const APP_FILE_PATH_QUERY_PARAM = "path";

protocol.registerSchemesAsPrivileged([
  {
    scheme: APP_FILE_PROTOCOL,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      corsEnabled: true,
    },
  },
]);

app.setName(APP_DISPLAY_NAME);

let mainWindow: BrowserWindow | null = null;
let repository: RememberRepository;
let settingsService: SettingsService;
let queueService: AnalysisQueueService;
let ingestionService: FileIngestionService;
let heartbeatService: HeartbeatService;
let folderSyncWatcherService: FolderSyncWatcherService;
let localRestServer: LocalRestServer | null = null;
let restServerSyncPromise: Promise<void> = Promise.resolve();
let handlersRegistered = false;
let fileProtocolRegistered = false;

function defaultFilters(): LibraryFilters {
  return {
    query: "",
    fileType: null,
    dominantColor: null,
    sentiment: null,
    uploadedWithin: "all",
    selectedTag: null,
  };
}

function parseIngestFilePath(payload: unknown): string | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }

  const filePathValue = (payload as Record<string, unknown>).filePath;
  if (typeof filePathValue !== "string") {
    return null;
  }

  const trimmedPath = filePathValue.trim();
  if (!trimmedPath || !path.isAbsolute(trimmedPath)) {
    return null;
  }

  return trimmedPath;
}

function parseLimit(queryParam: unknown, fallback: number): number {
  if (typeof queryParam !== "string") {
    return fallback;
  }

  const parsed = Number.parseInt(queryParam, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.min(parsed, 100);
}

function truncatePreviewText(input: string, maxLength = 12000): string {
  const normalized = input.replace(/\r\n/g, "\n").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength)}\n\n… (preview truncated)`;
}

function normalizeResolvedProtocolPath(rawPath: string): string {
  if (process.platform === "win32") {
    if (/^\/[a-zA-Z]:[\\/]/.test(rawPath)) {
      return rawPath.slice(1);
    }

    const driveLetterMatch = rawPath.match(/^\/([a-zA-Z])\/(.*)$/);
    if (driveLetterMatch) {
      const [, driveLetter, remainder] = driveLetterMatch;
      return `${driveLetter.toUpperCase()}:/${remainder}`;
    }
  }

  return rawPath;
}

function resolveProtocolFilePath(requestUrl: URL): string {
  const queryPath = requestUrl.searchParams.get(APP_FILE_PATH_QUERY_PARAM);
  if (queryPath !== null && queryPath.length > 0) {
    return normalizeResolvedProtocolPath(queryPath);
  }

  const legacyEncodedPath = requestUrl.host
    ? `/${requestUrl.host}${requestUrl.pathname}`
    : requestUrl.pathname;
  const legacyDecodedPath = decodeURIComponent(legacyEncodedPath);
  return normalizeResolvedProtocolPath(legacyDecodedPath);
}

function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

async function fetchLocalFileWithMime(filePath: string): Promise<Response> {
  const extension = normalizeExtension(filePath);
  const expectedMimeType = guessMimeType(extension);
  const upstreamResponse = await net.fetch(pathToFileURL(filePath).toString());

  const headers = new Headers(upstreamResponse.headers);
  if (expectedMimeType !== "application/octet-stream") {
    headers.set("content-type", expectedMimeType);
  }

  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    headers
  });
}

function registerFileProtocol(): void {
  if (fileProtocolRegistered) {
    return;
  }

  protocol.handle(APP_FILE_PROTOCOL, async (request) => {
    try {
      const requestUrl = new URL(request.url);
      const filePath = resolveProtocolFilePath(requestUrl);
      if (!path.isAbsolute(filePath)) {
        return new Response("Invalid file path", { status: 400 });
      }

      try {
        const stats = await fs.stat(filePath);
        if (!stats.isFile()) {
          return new Response("Path is not a file", { status: 400 });
        }
      } catch (error) {
        if (isErrnoException(error) && error.code === "ENOENT") {
          return new Response("File not found", { status: 404 });
        }
        throw error;
      }

      return fetchLocalFileWithMime(filePath);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid file request";
      return new Response(message, { status: 400 });
    }
  });

  fileProtocolRegistered = true;
}

function createRestHandlers(): RestServerRouteHandlers {
  return {
    status: (req, res) => {
      if (req.method !== "GET") {
        res.status(405).json({ error: "Method not allowed" });
        return;
      }

      const heartbeat = settingsService.getHeartbeatMetadata();
      res.json({
        appStatus: app.isReady() ? "ready" : "starting",
        fileCount: repository.getFileCount(),
        restApiEnabled: settingsService.getRestApiEnabled(),
        restApiPort: settingsService.getRestApiPort(),
        lastHeartbeatAt: heartbeat.lastHeartbeatAt,
        lastHeartbeatSummary: heartbeat.lastHeartbeatSummary,
        heartbeat,
      });
    },
    search: (req, res) => {
      if (req.method !== "GET") {
        res.status(405).json({ error: "Method not allowed" });
        return;
      }

      try {
        const q = typeof req.query.q === "string" ? req.query.q : "";
        const limit = parseLimit(req.query.limit, REST_SEARCH_LIMIT);
        const snapshot = repository.searchSnapshot(q, limit);

        res.json({
          query: snapshot.normalizedQuery,
          count: snapshot.results.length,
          results: snapshot.results,
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Search failed";
        res.status(500).json({ error: message });
      }
    },
    tags: (req, res) => {
      if (req.method !== "GET") {
        res.status(405).json({ error: "Method not allowed" });
        return;
      }

      try {
        res.json({ tags: repository.getTagCloud() });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Tag query failed";
        res.status(500).json({ error: message });
      }
    },
    ingest: async (req, res) => {
      if (req.method !== "POST") {
        res.status(405).json({ error: "Method not allowed" });
        return;
      }

      const filePath = parseIngestFilePath(req.body);
      if (!filePath) {
        res
          .status(400)
          .json({ error: "Body must include an absolute filePath string" });
        return;
      }

      try {
        const output = await ingestionService.ingestPaths([filePath]);
        res.json({
          accepted: output.accepted.map((file) => ({
            id: file.id,
            originalName: file.originalName,
            status: file.status,
          })),
          rejected: output.rejected,
          acceptedCount: output.accepted.length,
          rejectedCount: output.rejected.length,
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Ingestion failed";
        res.status(500).json({ error: message });
      }
    },
  };
}

async function syncRestServerState(): Promise<void> {
  if (!localRestServer) {
    return;
  }

  const shouldRun = settingsService.getRestApiEnabled();

  try {
    if (shouldRun && !localRestServer.isRunning) {
      await localRestServer.start();
      console.log(
        `[remember] local REST server listening on ${localRestServer.baseUrl}`,
      );
      return;
    }

    if (!shouldRun && localRestServer.isRunning) {
      await localRestServer.stop();
      console.log("[remember] local REST server stopped");
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown REST server error";
    console.error(`[remember] failed to apply local REST setting: ${message}`);
  }
}

function queueRestServerSync(): Promise<void> {
  restServerSyncPromise = restServerSyncPromise.then(() =>
    syncRestServerState(),
  );
  return restServerSyncPromise;
}

async function createMainWindow(): Promise<BrowserWindow> {
  const window = new BrowserWindow({
    width: 1300,
    height: 860,
    minWidth: 1080,
    minHeight: 720,
    frame: false,
    transparent: true,
    title: APP_DISPLAY_NAME,
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    vibrancy: process.platform === "darwin" ? "sidebar" : undefined,
    // backgroundMaterial: process.platform === "darwin" ? "acrylic" : undefined,
    // backgroundColor: nativeTheme.shouldUseDarkColors ? "#0b1120" : "#f8fafc",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      plugins: true,
    },
  });

  if (isDev) {
    console.log(`[remember] loading dev url: ${devServerUrl}`);
    await window.loadURL(devServerUrl);
  } else {
    console.log("[remember] loading production file: dist/index.html");
    await window.loadFile(path.join(process.cwd(), "dist", "index.html"));
  }

  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  window.webContents.on(
    "did-fail-load",
    (_event, errorCode, errorDescription, validatedURL) => {
      console.error(
        `[remember] renderer failed to load (${errorCode}): ${errorDescription} url=${validatedURL}`,
      );
    },
  );

  window.on("closed", () => {
    mainWindow = null;
  });

  return window;
}

async function openFilePicker(window: BrowserWindow): Promise<UploadResult> {
  const { canceled, filePaths } = await dialog.showOpenDialog(window, {
    title: `Add files to ${APP_DISPLAY_NAME}`,
    properties: ["openFile", "multiSelections"],
    filters: [
      {
        name: "Supported files",
        extensions: ["pdf", "txt", "docx", "pptx", "png", "jpg", "jpeg", "webp"],
      },
    ],
  });

  if (canceled || filePaths.length === 0) {
    return { accepted: [], rejected: [] };
  }

  return ingestionService.ingestPaths(filePaths);
}

async function openFolderPicker(window: BrowserWindow): Promise<string | null> {
  const { canceled, filePaths } = await dialog.showOpenDialog(window, {
    title: "Select folder to sync",
    properties: ["openDirectory", "createDirectory"],
  });

  if (canceled || filePaths.length === 0) {
    return null;
  }

  return filePaths[0] ?? null;
}

function registerIpcHandlers(): void {
  if (handlersRegistered) {
    return;
  }

  ipcMain.handle(CHANNELS.PICK_FILES, async () => {
    if (!mainWindow) {
      throw new Error("Application window is not available");
    }
    return openFilePicker(mainWindow);
  });

  ipcMain.handle(CHANNELS.PICK_FOLDER_PATH, async () => {
    if (!mainWindow) {
      throw new Error("Application window is not available");
    }

    return openFolderPicker(mainWindow);
  });

  ipcMain.handle(
    CHANNELS.INGEST_FILE_PATHS,
    async (_event, paths: string[]) => {
      return ingestionService.ingestPaths(paths);
    },
  );

  ipcMain.handle(
    CHANNELS.LIST_FILES,
    (_event, filters: Partial<LibraryFilters>) => {
      const merged = {
        ...defaultFilters(),
        ...filters,
      };
      return repository.listFiles(merged);
    },
  );

  ipcMain.handle(CHANNELS.GET_LIBRARY_STATUS_COUNTS, () =>
    repository.getFileStatusCounts(),
  );

  ipcMain.handle(CHANNELS.GET_FILE, (_event, fileId: string) =>
    repository.getFile(fileId),
  );
  ipcMain.handle(CHANNELS.GET_FILE_PREVIEW_TEXT, async (_event, fileId: string) => {
    const file = repository.getFile(fileId);
    if (!file) {
      throw new Error("File not found");
    }
    if (!isDocumentExtension(file.extension)) {
      return null;
    }

    const text = await extractDocumentText(file.storedPath, file.extension);
    return truncatePreviewText(text);
  });
  ipcMain.handle(CHANNELS.GET_TAG_CLOUD, () => repository.getTagCloud());

  ipcMain.handle(
    CHANNELS.ADD_MANUAL_TAG,
    (_event, fileId: string, tag: string) => {
      repository.addManualTag(fileId, tag);
    },
  );

  ipcMain.handle(CHANNELS.DELETE_TAG, (_event, fileId: string, tag: string) => {
    repository.deleteTag(fileId, tag);
  });

  ipcMain.handle(CHANNELS.RETRY_ANALYSIS, (_event, fileId: string) => {
    repository.updateFileStatus(fileId, "queued", null);
    queueService.enqueue(fileId);
  });

  ipcMain.handle(CHANNELS.RETRY_ALL_FAILED_ANALYSIS, () => {
    const failedIds = repository.listFileIdsByStatus("error");
    for (const fileId of failedIds) {
      repository.updateFileStatus(fileId, "queued", null);
      queueService.enqueue(fileId);
    }
    return failedIds.length;
  });

  ipcMain.handle(CHANNELS.TRIGGER_ANALYSIS, (_event, fileId: string) => {
    ingestionService.triggerAnalysis(fileId);
  });

  ipcMain.handle(CHANNELS.GET_SETTINGS, () => settingsService.getSettings());

  ipcMain.handle(CHANNELS.SET_AUTO_ANALYZE, (_event, enabled: boolean) => {
    settingsService.setAutoAnalyzeOnUpload(enabled);
  });

  ipcMain.handle(CHANNELS.SET_AI_REQUEST_DELAY, (_event, delayMs: number) => {
    settingsService.setAiRequestDelayMs(delayMs);
  });

  ipcMain.handle(
    CHANNELS.SET_REST_API_ENABLED,
    async (_event, enabled: boolean) => {
      settingsService.setRestApiEnabled(enabled);
      await queueRestServerSync();
    },
  );

  ipcMain.handle(
    CHANNELS.SET_WATCH_FOLDER_PATHS,
    (_event, watchFolderPaths: string[]) => {
      settingsService.setWatchFolderPaths(watchFolderPaths);
      folderSyncWatcherService.refresh();
      if (watchFolderPaths.length === 0) {
        settingsService.clearHeartbeatSeenFileMarkers();
        settingsService.clearHeartbeatMetadata();
        return;
      }
      void heartbeatService.runNow();
    },
  );

  ipcMain.handle(CHANNELS.SET_AI_PROVIDER, (_event, provider: AiProviderId) => {
    settingsService.setAiProvider(provider);
  });

  ipcMain.handle(CHANNELS.SET_AI_BASE_URL, (_event, baseUrl: string | null) => {
    settingsService.setAiBaseUrl(baseUrl);
  });

  ipcMain.handle(
    CHANNELS.SET_AI_MODELS,
    (_event, models: { chatModel: string; visionModel: string }) => {
      settingsService.setAiModels(models);
    },
  );

  ipcMain.handle(
    CHANNELS.SAVE_AI_PROFILE,
    (
      _event,
      profile: {
        profileId: string | null;
        name: string;
        provider: AiProviderId;
        baseUrl: string | null;
        chatModel: string;
        visionModel: string;
      },
    ) => {
      settingsService.saveAiProfile(profile);
    },
  );

  ipcMain.handle(CHANNELS.APPLY_AI_PROFILE, (_event, profileId: string) => {
    settingsService.applyAiProfile(profileId);
  });

  ipcMain.handle(CHANNELS.DELETE_AI_PROFILE, (_event, profileId: string) => {
    settingsService.deleteAiProfile(profileId);
  });

  ipcMain.handle(CHANNELS.SET_API_KEY, (_event, apiKey: string) => {
    settingsService.setApiKey(apiKey);
  });

  ipcMain.handle(CHANNELS.CLEAR_API_KEY, () => {
    settingsService.clearApiKey();
  });

  ipcMain.handle(CHANNELS.CLEAR_LIBRARY, async () => {
    const paths = repository.clearLibrary();
    for (const filePath of paths) {
      await fs.rm(filePath, { force: true });
    }
  });

  handlersRegistered = true;
}

function registerShortcuts(): void {
  if (globalShortcut.isRegistered("CommandOrControl+O")) {
    return;
  }

  globalShortcut.register("CommandOrControl+O", () => {
    if (!mainWindow) {
      return;
    }
    void openFilePicker(mainWindow);
  });
}

function initializeServices(): void {
  if (ingestionService) {
    return;
  }

  const appDataPath = app.getPath("appData");
  const legacyUserDataPaths = LEGACY_USER_DATA_DIRECTORY_NAMES.map((directoryName) =>
    path.join(appDataPath, directoryName),
  );
  const userDataPath = app.getPath("userData");
  const fileStoragePath = path.join(userDataPath, "library-files");

  const database = createDatabase({
    userDataPath,
    legacyUserDataPaths,
  });
  repository = new RememberRepository(database);
  settingsService = new SettingsService(userDataPath);
  const analyzer = new OpenAIAnalyzer(
    () => settingsService.getApiKey(),
    () => settingsService.getAiConfig(),
  );
  queueService = new AnalysisQueueService(
    repository,
    analyzer,
    () => settingsService.getAiRequestDelayMs(),
  );
  ingestionService = new FileIngestionService(
    repository,
    settingsService,
    queueService,
    fileStoragePath,
  );
  heartbeatService = new HeartbeatService(
    settingsService,
    ingestionService,
    repository,
  );
  folderSyncWatcherService = new FolderSyncWatcherService(settingsService, () =>
    heartbeatService.runNow(),
  );
  localRestServer = createLocalRestServer({
    port: settingsService.getRestApiPort(),
    routes: createRestHandlers(),
  });
}

async function bootstrap(): Promise<void> {
  initializeServices();
  registerFileProtocol();
  registerIpcHandlers();
  registerShortcuts();
  await queueRestServerSync();
  heartbeatService.start();
  folderSyncWatcherService.start();

  if (!mainWindow) {
    mainWindow = await createMainWindow();
  }
}

app.whenReady().then(() => {
  app.setName(APP_DISPLAY_NAME);
  app.setPath(
    "userData",
    path.join(app.getPath("appData"), USER_DATA_DIRECTORY_NAME),
  );
  void bootstrap();

  app.on("activate", () => {
    void bootstrap();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("will-quit", () => {
  heartbeatService?.stop();
  folderSyncWatcherService?.stop();
  if (localRestServer?.isRunning) {
    void localRestServer.stop().catch((error) => {
      const message =
        error instanceof Error
          ? error.message
          : "Unknown REST server shutdown error";
      console.error(`[remember] failed to stop local REST server: ${message}`);
    });
  }
  globalShortcut.unregisterAll();
});
