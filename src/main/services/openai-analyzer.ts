import fs from "node:fs/promises";
import OpenAI from "openai";
import { z } from "zod";
import { DOCUMENT_ANALYSIS_PROMPT, IMAGE_ANALYSIS_PROMPT } from "../../lib/ai/prompts";
import type { AiProviderId } from "../../shared/ai";
import type { AnalysisSaveInput } from "../db/repository";

interface AiClientConfig {
  provider: AiProviderId;
  baseUrl: string | null;
  chatModel: string;
  visionModel: string;
}

const imageResponseSchema = z
  .object({
    sceneDescription: z.string().min(1),
    mainSubjects: z.array(z.string().min(1)).min(1),
    dominantColors: z
      .array(
        z.object({
          name: z.string().min(1),
          hex: z.string().regex(/^#[0-9A-Fa-f]{6}$/)
        })
      )
      .min(2)
      .max(6),
    moodTone: z.string().min(1),
    visibleText: z.string(),
    keywordTags: z.array(z.string().min(1)).min(3).max(6)
  })
  .strict();

const documentResponseSchema = z
  .object({
    mainTopic: z.string().min(1),
    summary: z.string().min(1),
    entities: z.array(z.string().min(1)).default([]),
    sentiment: z.enum(["positive", "neutral", "negative"]),
    keywordTags: z.array(z.string().min(1)).min(5).max(8)
  })
  .strict();

function extractJson(content: string | null): Record<string, unknown> {
  if (!content) {
    throw new Error("AI response was empty");
  }

  return JSON.parse(content) as Record<string, unknown>;
}

export class OpenAIAnalyzer {
  constructor(
    private readonly getApiKey: () => string | null,
    private readonly getAiConfig: () => AiClientConfig
  ) {}

  private createClient(): { client: OpenAI; config: AiClientConfig } {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      throw new Error("AI API key is not configured");
    }

    const config = this.getAiConfig();
    if (config.provider === "custom" && !config.baseUrl) {
      throw new Error("Custom provider requires a valid base URL");
    }

    const client = new OpenAI({
      apiKey,
      baseURL: config.baseUrl ?? undefined
    });

    return { client, config };
  }

  async analyzeImage(params: {
    filePath: string;
    mimeType: string;
    originalName: string;
  }): Promise<AnalysisSaveInput> {
    const imageBuffer = await fs.readFile(params.filePath);
    const imageBase64 = imageBuffer.toString("base64");

    const { client, config } = this.createClient();
    const completion = await client.chat.completions.create({
      model: config.visionModel,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: IMAGE_ANALYSIS_PROMPT },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Analyze this image file: ${params.originalName}.`
            },
            {
              type: "image_url",
              image_url: {
                url: `data:${params.mimeType};base64,${imageBase64}`
              }
            }
          ]
        }
      ]
    });

    const content = completion.choices[0]?.message?.content;
    const parsed = imageResponseSchema.parse(extractJson(typeof content === "string" ? content : null));

    return {
      mainTopic: parsed.mainSubjects.join(", "),
      summary: parsed.sceneDescription,
      sceneDescription: parsed.sceneDescription,
      moodTone: parsed.moodTone,
      sentiment: null,
      dominantColors: parsed.dominantColors.map((item) => ({
        name: item.name,
        hex: item.hex.toUpperCase()
      })),
      entities: parsed.mainSubjects,
      ocrText: parsed.visibleText,
      keywordTags: parsed.keywordTags,
      modelUsed: config.visionModel,
      rawJson: JSON.stringify(parsed)
    };
  }

  async analyzeDocument(params: { text: string; originalName: string }): Promise<AnalysisSaveInput> {
    const { client, config } = this.createClient();
    const clippedText = params.text.length > 24000 ? params.text.slice(0, 24000) : params.text;

    const completion = await client.chat.completions.create({
      model: config.chatModel,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: DOCUMENT_ANALYSIS_PROMPT },
        {
          role: "user",
          content: `Filename: ${params.originalName}\n\nDocument text:\n${clippedText}`
        }
      ]
    });

    const content = completion.choices[0]?.message?.content;
    const parsed = documentResponseSchema.parse(extractJson(typeof content === "string" ? content : null));

    return {
      mainTopic: parsed.mainTopic,
      summary: parsed.summary,
      sceneDescription: null,
      moodTone: null,
      sentiment: parsed.sentiment,
      dominantColors: [],
      entities: parsed.entities,
      ocrText: null,
      keywordTags: parsed.keywordTags,
      modelUsed: config.chatModel,
      rawJson: JSON.stringify(parsed)
    };
  }
}
