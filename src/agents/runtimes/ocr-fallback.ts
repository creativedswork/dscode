import type { ImageContent } from "@earendil-works/pi-ai";

import type { HarnessEventBus } from "../../core/events.js";
import { ImageCache } from "../../drivers/vision/cache.js";
import { ocrImages } from "../../drivers/vision/ocr.js";
import type { ImageRef } from "../../session/types.js";
import type {
  AgentFallbackContext,
  AgentFallbackHandler,
} from "../process/fallback.js";
import type { AgentProcessOutput } from "./runtime.js";

export interface VisionAgentOutput {
  source: "vision" | "ocr" | "none" | "error";
  executionSource: "pi-agent" | "ocr";
  enrichedText: string;
  cachedRefs: ImageRef[];
  warnings: string[];
  modelProvider?: string;
  modelId?: string;
}

export class OcrFallbackHandler implements AgentFallbackHandler {
  readonly name = "ocr";

  constructor(private readonly events: HarnessEventBus) {}

  async execute(context: AgentFallbackContext): Promise<AgentProcessOutput<VisionAgentOutput>> {
    const imageAttachments = context.input.attachments?.filter(
      (attachment) => attachment.type === "image",
    ) ?? [];
    if (imageAttachments.length === 0) {
      throw new Error("OCR fallback requires at least one image attachment");
    }

    const cachedRefs: ImageRef[] = [];
    const images: ImageContent[] = [];
    this.progress(context.agentId, "compressing", cachedRefs);
    for (const attachment of imageAttachments) {
      const data = attachment.data;
      const reference = data.type === "image" ? await ImageCache.put(data) : data;
      const image = data.type === "image" ? await ImageCache.get(reference) : await ImageCache.get(data);
      cachedRefs.push(reference);
      if (image) images.push(image);
    }
    if (images.length === 0) throw new Error("OCR fallback could not resolve image attachments");
    if (context.signal.aborted) throw new DOMException("The operation was aborted", "AbortError");

    this.progress(context.agentId, "ocr", cachedRefs);
    const result = await ocrImages(images, context.signal);
    this.progress(context.agentId, "done", cachedRefs);
    const enrichedText = result.hasText
      ? context.input.prompt
        ? `${context.input.prompt}\n\n<image_text>\n${result.content}\n</image_text>`
        : `<image_text>\n${result.content}\n</image_text>`
      : context.input.prompt;
    const details: VisionAgentOutput = {
      source: result.hasText ? "ocr" : "none",
      executionSource: "ocr",
      enrichedText,
      cachedRefs,
      warnings: [`Vision Agent failed: ${context.failure.message}. Used OCR fallback.`],
    };
    return { text: enrichedText, details };
  }

  private progress(
    agentId: string,
    phase: "compressing" | "ocr" | "done",
    cachedRefs: ImageRef[],
  ): void {
    this.events.emit({
      type: "agent:progress",
      agentId,
      phase,
      message: `${phase}: ${cachedRefs.length} image(s) cached`,
      details: { phase, cachedRefs: [...cachedRefs] },
    });
  }
}
