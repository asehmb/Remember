import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { safeStorage } from "electron";
import { AI_PROVIDER_IDS, getAiProviderPreset, type AiProviderId } from "../../shared/ai";
import type { AiProfile, AppSettings } from "../../shared/types";

interface PreferenceSchema {
  autoAnalyzeOnUpload: boolean;
  aiRequestDelayMs: number;
  restApiEnabled: boolean;
  restApiPort: number;
  watchFolderPaths: string[];
  watchFolderExcludePaths: string[];
  lastHeartbeatAt: string | null;
  lastHeartbeatSummary: string | null;
  heartbeatSeenFileMarkers: string[];
  aiProvider: AiProviderId;
  aiBaseUrl: string | null;
  aiChatModel: string;
  aiVisionModel: string;
  aiProfiles: AiProfile[];
  activeAiProfileId: string | null;
}

type RawPreferenceSchema = Partial<PreferenceSchema> & {
  watchFolderPath?: string | null;
};

interface SecretPayload {
  encrypted: boolean;
  apiKey: string;
}

interface AiModelSettings {
  chatModel: string;
  visionModel: string;
}

interface SaveAiProfileInput {
  profileId: string | null;
  name: string;
  provider: AiProviderId;
  baseUrl: string | null;
  chatModel: string;
  visionModel: string;
}

const OPENAI_PRESET = getAiProviderPreset("openai");

const DEFAULT_PREFERENCES: PreferenceSchema = {
  autoAnalyzeOnUpload: true,
  aiRequestDelayMs: 2000,
  restApiEnabled: true,
  restApiPort: 47821,
  watchFolderPaths: [],
  watchFolderExcludePaths: [],
  lastHeartbeatAt: null,
  lastHeartbeatSummary: null,
  heartbeatSeenFileMarkers: [],
  aiProvider: "openai",
  aiBaseUrl: OPENAI_PRESET.defaultBaseUrl,
  aiChatModel: OPENAI_PRESET.defaultChatModel,
  aiVisionModel: OPENAI_PRESET.defaultVisionModel,
  aiProfiles: [],
  activeAiProfileId: null
};

export class SettingsService {
  private readonly preferencePath: string;
  private readonly secretPath: string;

  constructor(userDataPath: string) {
    this.preferencePath = path.join(userDataPath, "preferences.json");
    this.secretPath = path.join(userDataPath, "secrets.json");
  }

  getSettings(): AppSettings {
    const preferences = this.readPreferences();
    return {
      autoAnalyzeOnUpload: preferences.autoAnalyzeOnUpload,
      aiRequestDelayMs: preferences.aiRequestDelayMs,
      restApiEnabled: preferences.restApiEnabled,
      restApiPort: preferences.restApiPort,
      watchFolderPaths: [...preferences.watchFolderPaths],
      watchFolderExcludePaths: [...preferences.watchFolderExcludePaths],
      lastHeartbeatAt: preferences.lastHeartbeatAt,
      lastHeartbeatSummary: preferences.lastHeartbeatSummary,
      aiProvider: preferences.aiProvider,
      aiBaseUrl: preferences.aiBaseUrl,
      aiChatModel: preferences.aiChatModel,
      aiVisionModel: preferences.aiVisionModel,
      aiProfiles: preferences.aiProfiles.map((profile) => ({ ...profile })),
      activeAiProfileId: preferences.activeAiProfileId,
      hasApiKey: this.hasStoredApiKey()
    };
  }

  getAiConfig(): {
    provider: AiProviderId;
    baseUrl: string | null;
    chatModel: string;
    visionModel: string;
  } {
    const preferences = this.readPreferences();
    return {
      provider: preferences.aiProvider,
      baseUrl: preferences.aiBaseUrl,
      chatModel: preferences.aiChatModel,
      visionModel: preferences.aiVisionModel
    };
  }

  setAiProvider(provider: AiProviderId): void {
    const validatedProvider = this.validateAiProvider(provider);
    const preset = getAiProviderPreset(validatedProvider);

    const nextPreferences = {
      ...this.readPreferences(),
      aiProvider: validatedProvider,
      aiBaseUrl: preset.defaultBaseUrl,
      aiChatModel: preset.defaultChatModel,
      aiVisionModel: preset.defaultVisionModel
    };

    this.writePreferences(nextPreferences);
  }

  setAiBaseUrl(baseUrl: string | null): void {
    const nextPreferences = {
      ...this.readPreferences(),
      aiBaseUrl: this.validateAiBaseUrl(baseUrl)
    };

    this.writePreferences(nextPreferences);
  }

  setAiModels(models: AiModelSettings): void {
    const nextPreferences = {
      ...this.readPreferences(),
      aiChatModel: this.validateModelName(models.chatModel, "chatModel"),
      aiVisionModel: this.validateModelName(models.visionModel, "visionModel")
    };

    this.writePreferences(nextPreferences);
  }

  saveAiProfile(input: SaveAiProfileInput): void {
    const preferences = this.readPreferences();
    const normalizedName = this.validateProfileName(input.name);
    const normalizedProvider = this.validateAiProvider(input.provider);
    const normalizedBaseUrl = this.validateAiBaseUrl(input.baseUrl);
    const normalizedChatModel = this.validateModelName(input.chatModel, "chatModel");
    const normalizedVisionModel = this.validateModelName(input.visionModel, "visionModel");
    const normalizedProfileId = input.profileId ? this.validateProfileId(input.profileId) : null;

    const profileId = normalizedProfileId ?? crypto.randomUUID();
    const nextProfile: AiProfile = {
      id: profileId,
      name: normalizedName,
      provider: normalizedProvider,
      baseUrl: normalizedBaseUrl,
      chatModel: normalizedChatModel,
      visionModel: normalizedVisionModel
    };

    const remainingProfiles = preferences.aiProfiles.filter((profile) => profile.id !== profileId);
    const nextPreferences = {
      ...preferences,
      aiProvider: nextProfile.provider,
      aiBaseUrl: nextProfile.baseUrl,
      aiChatModel: nextProfile.chatModel,
      aiVisionModel: nextProfile.visionModel,
      aiProfiles: [...remainingProfiles, nextProfile].sort((left, right) =>
        left.name.localeCompare(right.name)
      ),
      activeAiProfileId: profileId
    };
    this.writePreferences(nextPreferences);
  }

  applyAiProfile(profileId: string): void {
    const normalizedProfileId = this.validateProfileId(profileId);
    const preferences = this.readPreferences();
    const profile = preferences.aiProfiles.find((item) => item.id === normalizedProfileId);
    if (!profile) {
      throw new Error("AI profile not found");
    }

    const nextPreferences = {
      ...preferences,
      aiProvider: profile.provider,
      aiBaseUrl: profile.baseUrl,
      aiChatModel: profile.chatModel,
      aiVisionModel: profile.visionModel,
      activeAiProfileId: profile.id
    };
    this.writePreferences(nextPreferences);
  }

  deleteAiProfile(profileId: string): void {
    const normalizedProfileId = this.validateProfileId(profileId);
    const preferences = this.readPreferences();
    const nextProfiles = preferences.aiProfiles.filter((profile) => profile.id !== normalizedProfileId);
    if (nextProfiles.length === preferences.aiProfiles.length) {
      throw new Error("AI profile not found");
    }

    const nextPreferences = {
      ...preferences,
      aiProfiles: nextProfiles,
      activeAiProfileId:
        preferences.activeAiProfileId === normalizedProfileId ? null : preferences.activeAiProfileId
    };
    this.writePreferences(nextPreferences);
  }

  setAutoAnalyzeOnUpload(enabled: boolean): void {
    const nextPreferences = {
      ...this.readPreferences(),
      autoAnalyzeOnUpload: enabled
    };
    this.writePreferences(nextPreferences);
  }

  setAiRequestDelayMs(delayMs: number): void {
    const nextPreferences = {
      ...this.readPreferences(),
      aiRequestDelayMs: this.validateAiRequestDelayMs(delayMs)
    };
    this.writePreferences(nextPreferences);
  }

  getAiRequestDelayMs(): number {
    return this.readPreferences().aiRequestDelayMs;
  }

  getAutoAnalyzeOnUpload(): boolean {
    return this.readPreferences().autoAnalyzeOnUpload;
  }

  setRestApiEnabled(enabled: boolean): void {
    if (typeof enabled !== "boolean") {
      throw new Error("restApiEnabled must be a boolean");
    }

    const nextPreferences = {
      ...this.readPreferences(),
      restApiEnabled: enabled
    };
    this.writePreferences(nextPreferences);
  }

  getRestApiEnabled(): boolean {
    return this.readPreferences().restApiEnabled;
  }

  getRestApiPort(): number {
    return this.readPreferences().restApiPort;
  }

  setWatchFolderPaths(watchFolderPaths: string[]): void {
    const nextPreferences = {
      ...this.readPreferences(),
      watchFolderPaths: this.validateWatchFolderPaths(watchFolderPaths)
    };
    this.writePreferences(nextPreferences);
  }

  getWatchFolderPaths(): string[] {
    return [...this.readPreferences().watchFolderPaths];
  }

  setWatchFolderExcludePaths(watchFolderExcludePaths: string[]): void {
    const nextPreferences = {
      ...this.readPreferences(),
      watchFolderExcludePaths: this.validateWatchFolderExcludePaths(watchFolderExcludePaths)
    };
    this.writePreferences(nextPreferences);
  }

  getWatchFolderExcludePaths(): string[] {
    return [...this.readPreferences().watchFolderExcludePaths];
  }

  setHeartbeatMetadata(lastHeartbeatAt: string | null, lastHeartbeatSummary: string | null): void {
    const validatedTimestamp = this.validateHeartbeatTimestamp(lastHeartbeatAt);
    const validatedSummary = this.validateHeartbeatSummary(lastHeartbeatSummary);
    if (validatedSummary !== null && validatedTimestamp === null) {
      throw new Error("lastHeartbeatSummary requires lastHeartbeatAt");
    }

    const nextPreferences = {
      ...this.readPreferences(),
      lastHeartbeatAt: validatedTimestamp,
      lastHeartbeatSummary: validatedSummary
    };
    this.writePreferences(nextPreferences);
  }

  clearHeartbeatMetadata(): void {
    this.setHeartbeatMetadata(null, null);
  }

  getHeartbeatMetadata(): Pick<PreferenceSchema, "lastHeartbeatAt" | "lastHeartbeatSummary"> {
    const preferences = this.readPreferences();
    return {
      lastHeartbeatAt: preferences.lastHeartbeatAt,
      lastHeartbeatSummary: preferences.lastHeartbeatSummary
    };
  }

  getHeartbeatSeenFileMarkers(): string[] {
    return [...this.readPreferences().heartbeatSeenFileMarkers];
  }

  setHeartbeatSeenFileMarkers(markers: Iterable<string>): void {
    const normalizedMarkers = this.validateHeartbeatSeenFileMarkers([...markers]);
    const nextPreferences = {
      ...this.readPreferences(),
      heartbeatSeenFileMarkers: normalizedMarkers
    };
    this.writePreferences(nextPreferences);
  }

  clearHeartbeatSeenFileMarkers(): void {
    this.setHeartbeatSeenFileMarkers([]);
  }

  setApiKey(apiKey: string): void {
    const trimmed = apiKey.trim();
    if (!trimmed) {
      throw new Error("API key cannot be empty");
    }

    if (safeStorage.isEncryptionAvailable()) {
      const encrypted = safeStorage.encryptString(trimmed).toString("base64");
      this.writeSecretPayload({ encrypted: true, apiKey: encrypted });
      return;
    }

    this.writeSecretPayload({ encrypted: false, apiKey: trimmed });
  }

  clearApiKey(): void {
    if (fs.existsSync(this.secretPath)) {
      fs.unlinkSync(this.secretPath);
    }
  }

  getApiKey(): string | null {
    const payload = this.readSecretPayload();
    if (!payload) {
      return null;
    }

    if (payload.encrypted) {
      if (!safeStorage.isEncryptionAvailable()) {
        throw new Error("Secure key storage is unavailable on this system");
      }
      try {
        return safeStorage.decryptString(Buffer.from(payload.apiKey, "base64"));
      } catch {
        throw new Error(
          "Unable to decrypt stored API key. Please clear and re-save your API key in Settings."
        );
      }
    }

    return payload.apiKey || null;
  }

  private hasStoredApiKey(): boolean {
    return this.readSecretPayload() !== null;
  }

  private readPreferences(): PreferenceSchema {
    try {
      const raw = fs.readFileSync(this.preferencePath, "utf8");
      const parsed = JSON.parse(raw) as RawPreferenceSchema;
      const autoAnalyzeOnUpload =
        parsed.autoAnalyzeOnUpload === undefined
          ? DEFAULT_PREFERENCES.autoAnalyzeOnUpload
          : this.validateAutoAnalyzeOnUpload(parsed.autoAnalyzeOnUpload);
      const aiRequestDelayMs =
        parsed.aiRequestDelayMs === undefined
          ? DEFAULT_PREFERENCES.aiRequestDelayMs
          : this.validateAiRequestDelayMs(parsed.aiRequestDelayMs);
      const restApiEnabled =
        parsed.restApiEnabled === undefined
          ? DEFAULT_PREFERENCES.restApiEnabled
          : this.validateRestApiEnabled(parsed.restApiEnabled);
      const restApiPort =
        parsed.restApiPort === undefined
          ? DEFAULT_PREFERENCES.restApiPort
          : this.validateRestApiPort(parsed.restApiPort);
      const watchFolderPaths =
        parsed.watchFolderPaths === undefined
          ? parsed.watchFolderPath === undefined || parsed.watchFolderPath === null
            ? DEFAULT_PREFERENCES.watchFolderPaths
            : this.validateWatchFolderPaths([parsed.watchFolderPath])
          : this.validateWatchFolderPaths(parsed.watchFolderPaths);
      const watchFolderExcludePaths =
        parsed.watchFolderExcludePaths === undefined
          ? DEFAULT_PREFERENCES.watchFolderExcludePaths
          : this.validateWatchFolderExcludePaths(parsed.watchFolderExcludePaths);
      const lastHeartbeatAt =
        parsed.lastHeartbeatAt === undefined
          ? DEFAULT_PREFERENCES.lastHeartbeatAt
          : this.validateHeartbeatTimestamp(parsed.lastHeartbeatAt);
      const lastHeartbeatSummary =
        parsed.lastHeartbeatSummary === undefined
          ? DEFAULT_PREFERENCES.lastHeartbeatSummary
          : this.validateHeartbeatSummary(parsed.lastHeartbeatSummary);
      const heartbeatSeenFileMarkers =
        parsed.heartbeatSeenFileMarkers === undefined
          ? DEFAULT_PREFERENCES.heartbeatSeenFileMarkers
          : this.validateHeartbeatSeenFileMarkers(parsed.heartbeatSeenFileMarkers);

      const aiProvider =
        parsed.aiProvider === undefined
          ? DEFAULT_PREFERENCES.aiProvider
          : this.validateAiProvider(parsed.aiProvider);
      const providerPreset = getAiProviderPreset(aiProvider);
      const aiBaseUrl =
        parsed.aiBaseUrl === undefined
          ? providerPreset.defaultBaseUrl
          : this.validateAiBaseUrl(parsed.aiBaseUrl);
      const aiChatModel =
        parsed.aiChatModel === undefined
          ? providerPreset.defaultChatModel
          : this.validateModelName(parsed.aiChatModel, "aiChatModel");
      const aiVisionModel =
        parsed.aiVisionModel === undefined
          ? providerPreset.defaultVisionModel
          : this.validateModelName(parsed.aiVisionModel, "aiVisionModel");
      const aiProfiles =
        parsed.aiProfiles === undefined
          ? DEFAULT_PREFERENCES.aiProfiles
          : this.validateAiProfiles(parsed.aiProfiles);
      const activeAiProfileId =
        parsed.activeAiProfileId === undefined
          ? DEFAULT_PREFERENCES.activeAiProfileId
          : this.validateActiveAiProfileId(parsed.activeAiProfileId, aiProfiles);

      if (lastHeartbeatSummary !== null && lastHeartbeatAt === null) {
        throw new Error(
          "Stored preferences are invalid: lastHeartbeatSummary requires lastHeartbeatAt"
        );
      }

      return {
        autoAnalyzeOnUpload,
        aiRequestDelayMs,
        restApiEnabled,
        restApiPort,
        watchFolderPaths,
        watchFolderExcludePaths,
        lastHeartbeatAt,
        lastHeartbeatSummary,
        heartbeatSeenFileMarkers,
        aiProvider,
        aiBaseUrl,
        aiChatModel,
        aiVisionModel,
        aiProfiles,
        activeAiProfileId
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return {
          ...DEFAULT_PREFERENCES,
          heartbeatSeenFileMarkers: [...DEFAULT_PREFERENCES.heartbeatSeenFileMarkers]
        };
      }
      if (error instanceof SyntaxError) {
        throw new Error("Stored preferences are invalid JSON");
      }
      throw error;
    }
  }

  private writePreferences(preferences: PreferenceSchema): void {
    fs.writeFileSync(this.preferencePath, JSON.stringify(preferences), "utf8");
  }

  private writeSecretPayload(payload: SecretPayload): void {
    fs.writeFileSync(this.secretPath, JSON.stringify(payload), "utf8");
  }

  private readSecretPayload(): SecretPayload | null {
    try {
      const raw = fs.readFileSync(this.secretPath, "utf8");
      const parsed = JSON.parse(raw) as Partial<SecretPayload>;

      if (typeof parsed.apiKey !== "string" || typeof parsed.encrypted !== "boolean") {
        throw new Error("Stored secret payload is invalid");
      }

      return {
        apiKey: parsed.apiKey,
        encrypted: parsed.encrypted
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return null;
      }
      throw error;
    }
  }

  private validateAutoAnalyzeOnUpload(value: unknown): boolean {
    if (typeof value !== "boolean") {
      throw new Error("Stored preferences are invalid: autoAnalyzeOnUpload must be a boolean");
    }
    return value;
  }

  private validateAiRequestDelayMs(value: unknown): number {
    if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 120000) {
      throw new Error(
        "Stored preferences are invalid: aiRequestDelayMs must be an integer in 0-120000"
      );
    }
    return value;
  }

  private validateRestApiEnabled(value: unknown): boolean {
    if (typeof value !== "boolean") {
      throw new Error("Stored preferences are invalid: restApiEnabled must be a boolean");
    }
    return value;
  }

  private validateRestApiPort(value: unknown): number {
    if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 65535) {
      throw new Error("Stored preferences are invalid: restApiPort must be an integer in 1-65535");
    }
    return value;
  }

  private validateSingleWatchFolderPath(value: unknown): string {
    if (typeof value !== "string") {
      throw new Error("watchFolderPaths must be an array of non-empty absolute path strings");
    }

    const trimmed = value.trim();
    if (!trimmed) {
      throw new Error("watchFolderPaths must be an array of non-empty absolute path strings");
    }
    if (!path.isAbsolute(trimmed)) {
      throw new Error("watchFolderPaths must contain only absolute paths");
    }
    return path.normalize(trimmed);
  }

  private validateWatchFolderPaths(value: unknown): string[] {
    if (!Array.isArray(value)) {
      throw new Error("watchFolderPaths must be an array of non-empty absolute path strings");
    }

    const deduped = new Set<string>();
    for (const folderPath of value) {
      deduped.add(this.validateSingleWatchFolderPath(folderPath));
    }

    return [...deduped];
  }

  private validateSingleWatchFolderExcludePath(value: unknown): string {
    if (typeof value !== "string") {
      throw new Error("watchFolderExcludePaths must be an array of non-empty absolute path strings");
    }

    const trimmed = value.trim();
    if (!trimmed) {
      throw new Error("watchFolderExcludePaths must be an array of non-empty absolute path strings");
    }
    if (!path.isAbsolute(trimmed)) {
      throw new Error("watchFolderExcludePaths must contain only absolute paths");
    }
    return path.normalize(trimmed);
  }

  private validateWatchFolderExcludePaths(value: unknown): string[] {
    if (!Array.isArray(value)) {
      throw new Error("watchFolderExcludePaths must be an array of non-empty absolute path strings");
    }

    const deduped = new Set<string>();
    for (const folderPath of value) {
      deduped.add(this.validateSingleWatchFolderExcludePath(folderPath));
    }

    return [...deduped];
  }

  private validateHeartbeatTimestamp(value: unknown): string | null {
    if (value === null) {
      return null;
    }
    if (typeof value !== "string") {
      throw new Error("lastHeartbeatAt must be null or a valid ISO-8601 timestamp");
    }
    const trimmed = value.trim();
    if (!trimmed || Number.isNaN(Date.parse(trimmed))) {
      throw new Error("lastHeartbeatAt must be null or a valid ISO-8601 timestamp");
    }
    return trimmed;
  }

  private validateHeartbeatSummary(value: unknown): string | null {
    if (value === null) {
      return null;
    }
    if (typeof value !== "string") {
      throw new Error("lastHeartbeatSummary must be null or a non-empty string");
    }
    const trimmed = value.trim();
    if (!trimmed) {
      throw new Error("lastHeartbeatSummary must be null or a non-empty string");
    }
    return trimmed;
  }

  private validateHeartbeatSeenFileMarkers(value: unknown): string[] {
    if (!Array.isArray(value)) {
      throw new Error("heartbeatSeenFileMarkers must be an array of non-empty strings");
    }

    const deduped = new Set<string>();
    for (const marker of value) {
      if (typeof marker !== "string") {
        throw new Error("heartbeatSeenFileMarkers must be an array of non-empty strings");
      }
      const trimmed = marker.trim();
      if (!trimmed) {
        throw new Error("heartbeatSeenFileMarkers must be an array of non-empty strings");
      }
      deduped.add(trimmed);
    }

    return [...deduped].sort((left, right) => left.localeCompare(right));
  }

  private validateAiProvider(value: unknown): AiProviderId {
    if (typeof value !== "string" || !AI_PROVIDER_IDS.includes(value as AiProviderId)) {
      throw new Error("aiProvider must be one of the supported provider identifiers");
    }

    return value as AiProviderId;
  }

  private validateAiBaseUrl(value: unknown): string | null {
    if (value === null) {
      return null;
    }

    if (typeof value !== "string") {
      throw new Error("aiBaseUrl must be null or a valid URL string");
    }

    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(trimmed);
    } catch {
      throw new Error("aiBaseUrl must be a valid URL");
    }

    if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
      throw new Error("aiBaseUrl must use http or https");
    }

    return parsedUrl.toString().replace(/\/$/, "");
  }

  private validateAiProfiles(value: unknown): AiProfile[] {
    if (!Array.isArray(value)) {
      throw new Error("aiProfiles must be an array");
    }

    const seenIds = new Set<string>();
    const normalizedProfiles: AiProfile[] = [];
    for (const rawProfile of value) {
      if (!rawProfile || typeof rawProfile !== "object" || Array.isArray(rawProfile)) {
        throw new Error("aiProfiles must contain valid profile objects");
      }

      const profile = rawProfile as Record<string, unknown>;
      const id = this.validateProfileId(profile.id);
      if (seenIds.has(id)) {
        throw new Error("aiProfiles must not contain duplicate ids");
      }
      seenIds.add(id);

      normalizedProfiles.push({
        id,
        name: this.validateProfileName(profile.name),
        provider: this.validateAiProvider(profile.provider),
        baseUrl: this.validateAiBaseUrl(profile.baseUrl),
        chatModel: this.validateModelName(profile.chatModel, "chatModel"),
        visionModel: this.validateModelName(profile.visionModel, "visionModel")
      });
    }

    return normalizedProfiles.sort((left, right) => left.name.localeCompare(right.name));
  }

  private validateActiveAiProfileId(value: unknown, profiles: AiProfile[]): string | null {
    if (value === null) {
      return null;
    }

    const profileId = this.validateProfileId(value);
    if (!profiles.some((profile) => profile.id === profileId)) {
      return null;
    }
    return profileId;
  }

  private validateProfileId(value: unknown): string {
    if (typeof value !== "string") {
      throw new Error("profileId must be a non-empty string");
    }

    const trimmed = value.trim();
    if (!trimmed) {
      throw new Error("profileId must be a non-empty string");
    }
    return trimmed;
  }

  private validateProfileName(value: unknown): string {
    if (typeof value !== "string") {
      throw new Error("profile name must be a non-empty string");
    }
    const trimmed = value.trim();
    if (!trimmed) {
      throw new Error("profile name must be a non-empty string");
    }
    return trimmed;
  }

  private validateModelName(value: unknown, fieldName: string): string {
    if (typeof value !== "string") {
      throw new Error(`${fieldName} must be a non-empty string`);
    }

    const trimmed = value.trim();
    if (!trimmed) {
      throw new Error(`${fieldName} must be a non-empty string`);
    }

    return trimmed;
  }
}
