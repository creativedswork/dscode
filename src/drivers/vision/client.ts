import type { Api, Context, ImageContent, Model } from "@mariozechner/pi-ai";
import { streamSimple } from "@mariozechner/pi-ai";
import { getEnvApiKey } from "@mariozechner/pi-ai";
import { resolveModel } from "../../models/index.js";
import type { VisionConfig } from "./types.js";

export interface ResolvedVisionModel {
  model: Model<Api>;
  apiKey: string;
}

export interface VisionCallbacks {
  /** Called for non-fatal warnings (e.g., vision model not configured, missing API key). */
  onWarning: (message: string) => void;
}

/**
 * Resolve a vision model from configuration.
 * Returns null if no vision model is configured, the model doesn't support images,
 * or no API key is available.
 */
export function resolveVisionModel(
  visionConfig: VisionConfig | undefined,
  fallbackApiKey: string | undefined,
  onWarning: (message: string) => void,
): ResolvedVisionModel | null {
  if (!visionConfig?.provider || !visionConfig?.model) return null;
  try {
    const model = resolveModel(visionConfig.provider, visionConfig.model);
    if (!model.input.includes("image")) {
      onWarning(`Vision model ${visionConfig.provider}/${visionConfig.model} does not support image input — falling back to OCR.`);
      return null;
    }
    const apiKey = visionConfig.key ?? getEnvApiKey(visionConfig.provider) ?? fallbackApiKey;
    if (!apiKey) {
      onWarning(`No API key for vision model ${visionConfig.provider}/${visionConfig.model} — configure via /config set_vision_key. Falling back to OCR.`);
      return null;
    }
    return { model, apiKey };
  } catch (err) {
    onWarning(`Failed to resolve vision model ${visionConfig?.provider ?? "?"}/${visionConfig?.model ?? "?"}: ${err instanceof Error ? err.message : String(err)}. Falling back to OCR.`);
    return null;
  }
}

/**
 * Call a vision model to describe the given images.
 * Returns the description text (may be empty).
 */
export async function describeImagesViaVisionModel(
  images: ImageContent[],
  visionModel: Model<Api>,
  apiKey: string,
  signal?: AbortSignal,
): Promise<string> {
  const ctx: Context = {
    systemPrompt: "You are an image description assistant. Describe the image in detail, including text, layout, and visual elements. Be thorough but concise.",
    messages: [
      { role: "user", content: [{ type: "text", text: "请详细描述这张图片的内容，包括文字、布局和视觉元素。" }, ...images], timestamp: Date.now() },
    ],
    tools: [],
  };
  const stream = streamSimple(visionModel, ctx, {
    apiKey,
    maxTokens: 4096,
    timeoutMs: 60_000,
    maxRetries: 0,
    reasoning: "off" as any,
    signal,
  });
  let text = "";
  try {
    for await (const event of stream) {
      if (event.type === "text_delta") {
        text += event.delta;
      }
    }
    return text;
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw err; // re-throw so pipeline can distinguish abort from failure
    }
    throw err;
  }
}
