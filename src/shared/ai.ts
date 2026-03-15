export const AI_PROVIDER_IDS = [
  "openai",
  "openrouter",
  "groq",
  "together",
  "fireworks",
  "deepinfra",
  "ollama",
  "custom",
] as const;

export type AiProviderId = (typeof AI_PROVIDER_IDS)[number];

export interface AiProviderPreset {
  id: AiProviderId;
  label: string;
  description: string;
  defaultBaseUrl: string | null;
  defaultChatModel: string;
  defaultVisionModel: string;
}

export const AI_PROVIDER_PRESETS: readonly AiProviderPreset[] = [
  {
    id: "openai",
    label: "OpenAI",
    description: "OpenAI official endpoint",
    defaultBaseUrl: "https://api.openai.com/v1",
    defaultChatModel: "gpt-4o-mini",
    defaultVisionModel: "gpt-4o-mini",
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    description: "OpenRouter OpenAI-compatible gateway",
    defaultBaseUrl: "https://openrouter.ai/api/v1",
    defaultChatModel: "openai/gpt-4o-mini",
    defaultVisionModel: "openai/gpt-4o-mini",
  },
  {
    id: "groq",
    label: "Groq",
    description: "Groq OpenAI-compatible endpoint",
    defaultBaseUrl: "https://api.groq.com/openai/v1",
    defaultChatModel: "llama-3.1-8b-instant",
    defaultVisionModel: "llama-3.2-11b-vision-preview",
  },
  {
    id: "together",
    label: "Together",
    description: "Together AI OpenAI-compatible endpoint",
    defaultBaseUrl: "https://api.together.xyz/v1",
    defaultChatModel: "meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo",
    defaultVisionModel: "meta-llama/Llama-3.2-11B-Vision-Instruct-Turbo",
  },
  {
    id: "fireworks",
    label: "Fireworks",
    description: "Fireworks AI OpenAI-compatible endpoint",
    defaultBaseUrl: "https://api.fireworks.ai/inference/v1",
    defaultChatModel: "accounts/fireworks/models/llama-v3p1-8b-instruct",
    defaultVisionModel:
      "accounts/fireworks/models/llama-v3p2-11b-vision-instruct",
  },
  {
    id: "deepinfra",
    label: "DeepInfra",
    description: "DeepInfra OpenAI-compatible endpoint",
    defaultBaseUrl: "https://api.deepinfra.com/v1/openai",
    defaultChatModel: "meta-llama/Llama-3.3-70B-Instruct",
    defaultVisionModel: "meta-llama/Llama-3.2-11B-Vision-Instruct",
  },
  {
    id: "ollama",
    label: "Ollama (Local)",
    description: "Local Ollama OpenAI-compatible endpoint",
    defaultBaseUrl: "http://127.0.0.1:11434/v1",
    defaultChatModel: "llama3.1:8b",
    defaultVisionModel: "llava:latest",
  },
  {
    id: "custom",
    label: "Custom",
    description: "Provide your own OpenAI-compatible base URL",
    defaultBaseUrl: null,
    defaultChatModel: "gpt-4o-mini",
    defaultVisionModel: "gpt-4o-mini",
  },
] as const;

export function getAiProviderPreset(
  providerId: AiProviderId,
): AiProviderPreset {
  const preset = AI_PROVIDER_PRESETS.find((item) => item.id === providerId);
  if (!preset) {
    throw new Error(`Unsupported AI provider: ${providerId}`);
  }
  return preset;
}
