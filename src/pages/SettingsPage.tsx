import { useEffect, useState } from "react";
import { AI_PROVIDER_PRESETS, getAiProviderPreset, type AiProviderId } from "../shared/ai";
import type { AppSettings } from "../shared/types";
import type { JSX } from "react";

interface SettingsPageProps {
  settings: AppSettings | null;
  onToggleAutoAnalyze: (enabled: boolean) => Promise<void>;
  onSetAiRequestDelay: (delayMs: number) => Promise<void>;
  onToggleRestApi: (enabled: boolean) => Promise<void>;
  onSetWatchFolderPaths: (watchFolderPaths: string[]) => Promise<void>;
  onBrowseWatchFolderPath: () => Promise<string | null>;
  onSaveAiProfile: (profile: {
    profileId: string | null;
    name: string;
    provider: AiProviderId;
    baseUrl: string | null;
    chatModel: string;
    visionModel: string;
  }) => Promise<void>;
  onApplyAiProfile: (profileId: string) => Promise<void>;
  onDeleteAiProfile: (profileId: string) => Promise<void>;
  onSaveApiKey: (apiKey: string) => Promise<void>;
  onClearApiKey: () => Promise<void>;
  onClearLibrary: () => Promise<void>;
}

type InfoSectionKey =
  | "aiProvider"
  | "apiKey"
  | "processingDefaults"
  | "folderSync"
  | "openclawIntegration"
  | "dangerZone";

export function SettingsPage({
  settings,
  onToggleAutoAnalyze,
  onSetAiRequestDelay,
  onToggleRestApi,
  onSetWatchFolderPaths,
  onBrowseWatchFolderPath,
  onSaveAiProfile,
  onApplyAiProfile,
  onDeleteAiProfile,
  onSaveApiKey,
  onClearApiKey,
  onClearLibrary
}: SettingsPageProps): JSX.Element {
  const [apiKey, setApiKey] = useState("");
  const [watchFolderPathInput, setWatchFolderPathInput] = useState("");
  const [profileNameInput, setProfileNameInput] = useState("");
  const [selectedProfileId, setSelectedProfileId] = useState<string>("");
  const [providerInput, setProviderInput] = useState<AiProviderId>("openai");
  const [baseUrlInput, setBaseUrlInput] = useState("");
  const [chatModelInput, setChatModelInput] = useState("");
  const [visionModelInput, setVisionModelInput] = useState("");
  const [aiRequestDelayInput, setAiRequestDelayInput] = useState("2000");
  const [infoOpen, setInfoOpen] = useState<Record<InfoSectionKey, boolean>>({
    aiProvider: false,
    apiKey: false,
    processingDefaults: false,
    folderSync: false,
    openclawIntegration: false,
    dangerZone: false
  });
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!settings) {
      return;
    }

    setProviderInput(settings.aiProvider);
    setBaseUrlInput(settings.aiBaseUrl ?? "");
    setChatModelInput(settings.aiChatModel);
    setVisionModelInput(settings.aiVisionModel);
    setAiRequestDelayInput(String(settings.aiRequestDelayMs));
    setSelectedProfileId(settings.activeAiProfileId ?? "");
    const activeProfile =
      settings.activeAiProfileId === null
        ? null
        : settings.aiProfiles.find((profile) => profile.id === settings.activeAiProfileId) ?? null;
    setProfileNameInput(activeProfile?.name ?? "");
  }, [settings]);

  if (!settings) {
    return <p className="text-sm text-slate-500">Loading settings...</p>;
  }

  const selectedProvider = getAiProviderPreset(providerInput);
  const isCustomProvider = providerInput === "custom";
  const activeProfileId = selectedProfileId || null;
  const toggleInfo = (key: InfoSectionKey): void => {
    setInfoOpen((current) => ({ ...current, [key]: !current[key] }));
  };

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold">AI Provider</h2>
          <button
            aria-expanded={infoOpen.aiProvider}
            aria-label="Show AI provider info"
            className="h-5 w-5 rounded-full border border-slate-300 text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            onClick={() => toggleInfo("aiProvider")}
            type="button"
          >
            i
          </button>
        </div>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Choose a popular OpenAI-compatible endpoint, or set your own custom base URL.
        </p>
        {infoOpen.aiProvider ? (
          <div className="mt-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
            Save your provider/model setup as a profile so you can quickly switch between model
            configurations from the dropdown.
          </div>
        ) : null}

        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <label className="text-xs text-slate-500 dark:text-slate-400">
            Saved profiles
            <select
              className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-accent-400 dark:border-slate-700 dark:bg-slate-950"
              onChange={(event) => {
                const profileId = event.target.value;
                setSelectedProfileId(profileId);
                if (!profileId) {
                  setStatusMessage("Using unsaved AI configuration.");
                  return;
                }

                void onApplyAiProfile(profileId).then(() => {
                  const appliedProfile = settings.aiProfiles.find((profile) => profile.id === profileId);
                  setStatusMessage(
                    appliedProfile ? `Switched to profile "${appliedProfile.name}".` : "AI profile applied."
                  );
                });
              }}
              value={selectedProfileId}
            >
              <option value="">Unsaved configuration</option>
              {settings.aiProfiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.name}
                </option>
              ))}
            </select>
          </label>

          <label className="text-xs text-slate-500 dark:text-slate-400">
            Profile name
            <input
              className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-accent-400 dark:border-slate-700 dark:bg-slate-950"
              onChange={(event) => setProfileNameInput(event.target.value)}
              placeholder="My preferred models"
              type="text"
              value={profileNameInput}
            />
          </label>
        </div>

        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <label className="text-xs text-slate-500 dark:text-slate-400">
            Provider
            <select
              className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-accent-400 dark:border-slate-700 dark:bg-slate-950"
              onChange={(event) => {
                const provider = event.target.value as AiProviderId;
                setProviderInput(provider);
              }}
              value={providerInput}
            >
              {AI_PROVIDER_PRESETS.map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.label}
                </option>
              ))}
            </select>
          </label>

          <label className="text-xs text-slate-500 dark:text-slate-400">
            Base URL
            <input
              className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-accent-400 dark:border-slate-700 dark:bg-slate-950"
              onChange={(event) => setBaseUrlInput(event.target.value)}
              placeholder={selectedProvider.defaultBaseUrl ?? "https://api.example.com/v1"}
              type="text"
              value={baseUrlInput}
            />
            <span className="mt-1 block text-[11px] text-slate-500 dark:text-slate-400">
              {isCustomProvider
                ? "Custom provider requires a valid base URL."
                : `Preset: ${selectedProvider.defaultBaseUrl ?? "none"}`}
            </span>
          </label>
        </div>

        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <label className="text-xs text-slate-500 dark:text-slate-400">
            Chat model
            <input
              className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-accent-400 dark:border-slate-700 dark:bg-slate-950"
              onChange={(event) => setChatModelInput(event.target.value)}
              type="text"
              value={chatModelInput}
            />
          </label>

          <label className="text-xs text-slate-500 dark:text-slate-400">
            Vision model
            <input
              className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-accent-400 dark:border-slate-700 dark:bg-slate-950"
              onChange={(event) => setVisionModelInput(event.target.value)}
              type="text"
              value={visionModelInput}
            />
          </label>
        </div>

        <div className="mt-3 flex gap-2">
          <button
            className="rounded-md bg-accent-500 px-4 py-2 text-sm text-white hover:bg-accent-600"
            onClick={() => {
              const trimmedProfileName = profileNameInput.trim();
              if (!trimmedProfileName) {
                setStatusMessage("Enter a profile name before saving.");
                return;
              }

              void onSaveAiProfile({
                profileId: activeProfileId,
                name: trimmedProfileName,
                provider: providerInput,
                baseUrl: baseUrlInput.trim() || null,
                chatModel: chatModelInput,
                visionModel: visionModelInput
              }).then(() => {
                setStatusMessage(`Saved profile "${trimmedProfileName}".`);
              });
            }}
            type="button"
          >
            Save
          </button>
          <button
            className="rounded-md border border-slate-300 px-4 py-2 text-sm hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-800"
            disabled={!activeProfileId}
            onClick={() => {
              if (!activeProfileId) {
                return;
              }
              void onDeleteAiProfile(activeProfileId).then(() => {
                setSelectedProfileId("");
                setProfileNameInput("");
                setStatusMessage("Profile deleted.");
              });
            }}
            type="button"
          >
            Delete
          </button>
        </div>

        <div className="mt-4 border-t border-slate-200 pt-4 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              API Key
            </h3>
            <button
              aria-expanded={infoOpen.apiKey}
              aria-label="Show API key info"
              className="h-5 w-5 rounded-full border border-slate-300 text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              onClick={() => toggleInfo("apiKey")}
              type="button"
            >
              i
            </button>
          </div>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Used to authenticate with the selected provider.
          </p>
          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
            Optional for Ollama and some custom/local providers.
          </p>
          {infoOpen.apiKey ? (
            <div className="mt-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
              Your key is stored locally and used only when sending AI requests. Clearing it
              removes stored credentials from this machine.
            </div>
          ) : null}

          <div className="mt-3 flex gap-2">
            <input
              className="flex-1 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-accent-400 dark:border-slate-700 dark:bg-slate-950"
              onChange={(event) => setApiKey(event.target.value)}
              placeholder={settings.hasApiKey ? "API key configured" : "Enter API key"}
              type="password"
              value={apiKey}
            />
            <button
              className="rounded-md bg-accent-500 px-4 py-2 text-sm text-white hover:bg-accent-600"
              onClick={() => {
                if (apiKey.trim()) {
                  void onSaveApiKey(apiKey.trim());
                  setApiKey("");
                  setStatusMessage("API key saved.");
                }
              }}
              type="button"
            >
              Save
            </button>
            <button
              className="rounded-md border border-slate-300 px-4 py-2 text-sm hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
              onClick={() => {
                void onClearApiKey();
                setStatusMessage("API key removed.");
              }}
              type="button"
            >
              Clear
            </button>
          </div>
        </div>

        {statusMessage ? <p className="mt-2 text-xs text-slate-500">{statusMessage}</p> : null}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold">Processing Defaults</h2>
          <button
            aria-expanded={infoOpen.processingDefaults}
            aria-label="Show processing defaults info"
            className="h-5 w-5 rounded-full border border-slate-300 text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            onClick={() => toggleInfo("processingDefaults")}
            type="button"
          >
            i
          </button>
        </div>
        {infoOpen.processingDefaults ? (
          <div className="mt-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
            Controls default behavior for newly ingested files. You can still trigger analysis
            manually per file from the library.
          </div>
        ) : null}
        <label className="mt-3 flex items-center gap-2 text-sm">
          <input
            checked={settings.autoAnalyzeOnUpload}
            onChange={(event) => {
              void onToggleAutoAnalyze(event.target.checked);
            }}
            type="checkbox"
          />
          Auto-analyze files immediately after upload
        </label>
        <div className="mt-3 flex items-end gap-2">
          <label className="text-xs text-slate-500 dark:text-slate-400">
            AI request delay (ms)
            <input
              className="mt-1 w-44 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-accent-400 dark:border-slate-700 dark:bg-slate-950"
              min={0}
              onChange={(event) => setAiRequestDelayInput(event.target.value)}
              step={100}
              type="number"
              value={aiRequestDelayInput}
            />
          </label>
          <button
            className="rounded-md border border-slate-300 px-4 py-2 text-sm hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
            onClick={() => {
              const parsed = Number.parseInt(aiRequestDelayInput, 10);
              if (!Number.isInteger(parsed) || parsed < 0) {
                setStatusMessage("Delay must be a non-negative integer (milliseconds).");
                return;
              }
              void onSetAiRequestDelay(parsed).then(() => {
                setStatusMessage(`AI request delay saved (${parsed} ms).`);
              });
            }}
            type="button"
          >
            Save delay
          </button>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold">Folder Sync</h2>
          <button
            aria-expanded={infoOpen.folderSync}
            aria-label="Show folder sync info"
            className="h-5 w-5 rounded-full border border-slate-300 text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            onClick={() => toggleInfo("folderSync")}
            type="button"
          >
            i
          </button>
        </div>
        <div className="mt-3 space-y-3 text-sm">
          {infoOpen.folderSync ? (
            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
              Add one or more absolute folder paths to keep them synced automatically. Newly added
              supported files are ingested, and if synced source files are deleted from those folders,
              they are removed from your library.
            </div>
          ) : null}

          <div>
            <label className="text-xs text-slate-500 dark:text-slate-400">Watch folders</label>
            <div className="mt-1 flex gap-2">
              <input
                className="flex-1 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-accent-400 dark:border-slate-700 dark:bg-slate-950"
                onChange={(event) => setWatchFolderPathInput(event.target.value)}
                placeholder="/absolute/path/to/watch"
                type="text"
                value={watchFolderPathInput}
              />
              <button
                className="rounded-md bg-accent-500 px-4 py-2 text-sm text-white hover:bg-accent-600"
                onClick={() => {
                  const trimmed = watchFolderPathInput.trim();
                  if (!trimmed) {
                    return;
                  }
                  const nextPaths = [...new Set([...settings.watchFolderPaths, trimmed])];
                  void onSetWatchFolderPaths(nextPaths);
                  setWatchFolderPathInput("");
                  setStatusMessage("Watch folder added.");
                }}
                type="button"
              >
                Add
              </button>
              <button
                className="rounded-md border border-slate-300 px-4 py-2 text-sm hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
                onClick={() => {
                  void onBrowseWatchFolderPath().then((pickedPath) => {
                    if (!pickedPath) {
                      return;
                    }
                    const nextPaths = [...new Set([...settings.watchFolderPaths, pickedPath])];
                    void onSetWatchFolderPaths(nextPaths);
                    setWatchFolderPathInput("");
                    setStatusMessage("Watch folder added.");
                  });
                }}
                type="button"
              >
                Browse
              </button>
              <button
                className="rounded-md border border-slate-300 px-4 py-2 text-sm hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
                onClick={() => {
                  setWatchFolderPathInput("");
                  void onSetWatchFolderPaths([]);
                  setStatusMessage("All watch folders cleared.");
                }}
                type="button"
              >
                Clear all
              </button>
            </div>
            <div className="mt-2 space-y-2">
              {settings.watchFolderPaths.length === 0 ? (
                <p className="text-xs text-slate-500 dark:text-slate-400">Current: not set</p>
              ) : (
                settings.watchFolderPaths.map((folderPath) => (
                  <div
                    key={folderPath}
                    className="flex items-center justify-between gap-2 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs dark:border-slate-800 dark:bg-slate-950"
                  >
                    <span className="truncate">{folderPath}</span>
                    <button
                      className="rounded border border-slate-300 px-2 py-0.5 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
                      onClick={() => {
                        const nextPaths = settings.watchFolderPaths.filter((path) => path !== folderPath);
                        void onSetWatchFolderPaths(nextPaths);
                        setStatusMessage("Watch folder removed.");
                      }}
                      type="button"
                    >
                      Remove
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold">OpenClaw Integration</h2>
          <button
            aria-expanded={infoOpen.openclawIntegration}
            aria-label="Show OpenClaw integration info"
            className="h-5 w-5 rounded-full border border-slate-300 text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            onClick={() => toggleInfo("openclawIntegration")}
            type="button"
          >
            i
          </button>
        </div>
        <div className="mt-3 space-y-3 text-sm">
          {infoOpen.openclawIntegration ? (
            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
              Enables a local REST endpoint for tools like OpenClaw to query status, tags, and search
              results from your local Remember library.
            </div>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-slate-500 dark:text-slate-400">Local REST API</span>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                settings.restApiEnabled
                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                  : "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
              }`}
            >
              {settings.restApiEnabled ? "Enabled" : "Disabled"}
            </span>
            <span className="text-slate-500 dark:text-slate-400">Port {settings.restApiPort}</span>
          </div>

          <label className="flex items-center gap-2">
            <input
              checked={settings.restApiEnabled}
              onChange={(event) => {
                void onToggleRestApi(event.target.checked);
              }}
              type="checkbox"
            />
            Enable local REST API
          </label>

          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs dark:border-slate-800 dark:bg-slate-950">
            <p>
              <span className="font-medium">Last heartbeat:</span>{" "}
              {settings.lastHeartbeatAt ? new Date(settings.lastHeartbeatAt).toLocaleString() : "Never"}
            </p>
            <p className="mt-1">
              <span className="font-medium">Summary:</span>{" "}
              {settings.lastHeartbeatSummary ?? "No heartbeat received yet."}
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-rose-200 bg-rose-50 p-4 dark:border-rose-900 dark:bg-rose-950/40">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-rose-700 dark:text-rose-300">Danger Zone</h2>
          <button
            aria-expanded={infoOpen.dangerZone}
            aria-label="Show danger zone info"
            className="h-5 w-5 rounded-full border border-rose-300 text-xs font-semibold text-rose-600 hover:bg-rose-100 dark:border-rose-700 dark:text-rose-300 dark:hover:bg-rose-900/40"
            onClick={() => toggleInfo("dangerZone")}
            type="button"
          >
            i
          </button>
        </div>
        <p className="mt-1 text-xs text-rose-700/80 dark:text-rose-300/80">
          Clear all file records, tags, analyses, and locally stored file copies.
        </p>
        {infoOpen.dangerZone ? (
          <div className="mt-2 rounded-md border border-rose-200 bg-rose-100 px-3 py-2 text-xs text-rose-700 dark:border-rose-900 dark:bg-rose-950/60 dark:text-rose-200">
            This permanently deletes your local library data and copied files from Remember storage.
            It cannot be undone.
          </div>
        ) : null}
        <button
          className="mt-3 rounded-md bg-rose-500 px-4 py-2 text-sm text-white hover:bg-rose-600"
          onClick={() => {
            if (window.confirm("Clear all files and analysis data? This cannot be undone.")) {
              void onClearLibrary();
            }
          }}
          type="button"
        >
          Clear library data
        </button>
      </section>
    </div>
  );
}
