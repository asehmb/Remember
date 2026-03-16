import { contextBridge, ipcRenderer } from "electron";
import type { RememberAPI } from "../shared/types";
import { CHANNELS } from "./ipc/channels";

const api: RememberAPI = {
  pickFiles: () => ipcRenderer.invoke(CHANNELS.PICK_FILES),
  pickFolderPath: () => ipcRenderer.invoke(CHANNELS.PICK_FOLDER_PATH),
  ingestFilePaths: (paths) => ipcRenderer.invoke(CHANNELS.INGEST_FILE_PATHS, paths),
  listFiles: (filters) => ipcRenderer.invoke(CHANNELS.LIST_FILES, filters),
  getLibraryStatusCounts: () => ipcRenderer.invoke(CHANNELS.GET_LIBRARY_STATUS_COUNTS),
  getFile: (fileId) => ipcRenderer.invoke(CHANNELS.GET_FILE, fileId),
  getFilePreviewText: (fileId) => ipcRenderer.invoke(CHANNELS.GET_FILE_PREVIEW_TEXT, fileId),
  getTagCloud: () => ipcRenderer.invoke(CHANNELS.GET_TAG_CLOUD),
  addManualTag: (fileId, tag) => ipcRenderer.invoke(CHANNELS.ADD_MANUAL_TAG, fileId, tag),
  deleteTag: (fileId, tag) => ipcRenderer.invoke(CHANNELS.DELETE_TAG, fileId, tag),
  retryAnalysis: (fileId) => ipcRenderer.invoke(CHANNELS.RETRY_ANALYSIS, fileId),
  retryAllFailedAnalysis: () => ipcRenderer.invoke(CHANNELS.RETRY_ALL_FAILED_ANALYSIS),
  triggerAnalysis: (fileId) => ipcRenderer.invoke(CHANNELS.TRIGGER_ANALYSIS, fileId),
  getSettings: () => ipcRenderer.invoke(CHANNELS.GET_SETTINGS),
  setAutoAnalyzeOnUpload: (enabled) => ipcRenderer.invoke(CHANNELS.SET_AUTO_ANALYZE, enabled),
  setAiRequestDelayMs: (delayMs) => ipcRenderer.invoke(CHANNELS.SET_AI_REQUEST_DELAY, delayMs),
  setRestApiEnabled: (enabled) => ipcRenderer.invoke(CHANNELS.SET_REST_API_ENABLED, enabled),
  setWatchFolderPaths: (watchFolderPaths) =>
    ipcRenderer.invoke(CHANNELS.SET_WATCH_FOLDER_PATHS, watchFolderPaths),
  setWatchFolderExcludePaths: (watchFolderExcludePaths) =>
    ipcRenderer.invoke(CHANNELS.SET_WATCH_FOLDER_EXCLUDE_PATHS, watchFolderExcludePaths),
  setAiProvider: (provider) => ipcRenderer.invoke(CHANNELS.SET_AI_PROVIDER, provider),
  setAiBaseUrl: (baseUrl) => ipcRenderer.invoke(CHANNELS.SET_AI_BASE_URL, baseUrl),
  setAiModels: (models) => ipcRenderer.invoke(CHANNELS.SET_AI_MODELS, models),
  saveAiProfile: (profile) => ipcRenderer.invoke(CHANNELS.SAVE_AI_PROFILE, profile),
  applyAiProfile: (profileId) => ipcRenderer.invoke(CHANNELS.APPLY_AI_PROFILE, profileId),
  deleteAiProfile: (profileId) => ipcRenderer.invoke(CHANNELS.DELETE_AI_PROFILE, profileId),
  setApiKey: (apiKey) => ipcRenderer.invoke(CHANNELS.SET_API_KEY, apiKey),
  clearApiKey: () => ipcRenderer.invoke(CHANNELS.CLEAR_API_KEY),
  clearLibrary: () => ipcRenderer.invoke(CHANNELS.CLEAR_LIBRARY)
};

contextBridge.exposeInMainWorld("remember", api);
