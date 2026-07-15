import type { ImageContent } from "@earendil-works/pi-ai";
import { ImageCache } from "./cache.js";
import { ocrImages } from "./ocr.js";
import { resolveVisionModel, describeImagesViaVisionModel } from "./client.js";
import { Logger } from "../../utils/logger.js";
import type { VisionConfig, ImageRef, ProcessResult, ProcessOptions, ProgressFn } from "./types.js";

const _plog = new Logger({ type: "harness", id: process.env.DSCODE_RUNTIME_ID ?? "pipeline" });

export interface ImagePipelineConfig {
  visionConfig?: VisionConfig;
  fallbackApiKey?: string;
  onWarning: (message: string) => void;
}

export class ImagePipeline {
  private visionConfig?: VisionConfig;
  private fallbackApiKey?: string;
  private onWarning: (message: string) => void;

  constructor(config: ImagePipelineConfig) {
    this.visionConfig = config.visionConfig;
    this.fallbackApiKey = config.fallbackApiKey;
    this.onWarning = config.onWarning;
  }

  /**
   * Process images through the vision→OCR→fallback chain.
   *
   * 1. Compress and cache all images
   * 2. If vision model is configured, try to get a description
   * 3. If vision fails or returns empty, fall back to OCR
   * 4. If both fail, return the original text with a placeholder
   */
  async process(
    images: ImageContent[],
    text: string,
    options?: ProcessOptions,
  ): Promise<ProcessResult> {
    const onProgress: ProgressFn | undefined = options?.onProgress;
    const signal = options?.signal;

    // Normalize: ensure every image has type: "image" and proper fields
    const normalizedImages: ImageContent[] = images.map((img) => ({
      type: "image" as const,
      data: img.data ?? "",
      mimeType: img.mimeType ?? "image/png",
    }));

    // Compress and cache all images
    onProgress?.({ phase: "compressing", cachedRefs: [] });
    const cachedRefs = await Promise.all(normalizedImages.map((img) => ImageCache.put(img)));
    onProgress?.({ phase: "compressing", cachedRefs });

    // Read compressed images back from cache for downstream use
    const compressedRaw = await Promise.all(cachedRefs.map((ref) => ImageCache.get(ref)));
    const compressedImages: ImageContent[] = compressedRaw.every((img): img is ImageContent => img !== null)
      ? compressedRaw
      : normalizedImages;

    if (signal?.aborted) throw new DOMException("The operation was aborted", "AbortError");

    // Try vision model
    const vision = resolveVisionModel(this.visionConfig, this.fallbackApiKey, this.onWarning);
    _plog.info("tool", "image-pipeline", `vision resolved: ${vision ? `${vision.model.provider}/${vision.model.id}` : "null — falling to OCR"}, images=${normalizedImages.length}, img[0].dataLen=${normalizedImages[0]?.data?.length ?? 0}, mime=${normalizedImages[0]?.mimeType ?? "?"}`);
    if (vision) {
      try {
        onProgress?.({ phase: "describing", cachedRefs });
        const description = await describeImagesViaVisionModel(compressedImages, vision.model, vision.apiKey, signal);
        if (!description || description.trim().length === 0) {
          // Vision model returned empty description — fall through to OCR
          throw new Error("Vision model returned empty description");
        }
        onProgress?.({ phase: "done", cachedRefs });
        const enrichedText = text
          ? `${text}\n\n<image_description>\n${description}\n</image_description>`
          : `<image_description>\n${description}\n</image_description>`;
        return { enrichedText, cachedRefs, source: "vision" };
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          throw err; // re-throw abort immediately, no fallback
        }
        const errMsg = err instanceof Error ? err.message : String(err);
        _plog.warn("tool", "image-pipeline", `vision FAILED: ${errMsg}. img[0].dataLen=${normalizedImages[0]?.data?.length ?? 0}, mime=${normalizedImages[0]?.mimeType ?? "?"}, preview=${normalizedImages[0]?.data?.slice(0, 80) ?? "?"}`);
        this.onWarning(`Vision model failed: ${errMsg}. Falling back to OCR.`);
      }
    }

    // OCR fallback
    _plog.info("tool", "image-pipeline", `entering OCR fallback, images=${normalizedImages.length}`);
    if (signal?.aborted) throw new DOMException("The operation was aborted", "AbortError");
    try {
      onProgress?.({ phase: "ocr", cachedRefs });
      const result = await ocrImages(compressedImages, signal);
      onProgress?.({ phase: "done", cachedRefs });
      if (result.hasText) {
        const ocrText = text
          ? `${text}\n\n<image_text>\n${result.content}\n</image_text>`
          : `<image_text>\n${result.content}\n</image_text>`;
        return { enrichedText: ocrText, cachedRefs, source: "ocr" };
      } else {
        // OCR found no useful text — return original text unchanged (not empty)
        return { enrichedText: text, cachedRefs, source: "none" };
      }
    } catch (err) {
      onProgress?.({ phase: "done", cachedRefs });
      if (err instanceof DOMException && err.name === "AbortError") {
        throw err; // re-throw abort immediately, no fallback
      }
      this.onWarning(`OCR failed: ${err instanceof Error ? err.message : String(err)}.`);
      // Both vision and OCR failed
      const fallbackText = text
        ? `${text}\n\n[Image(s) could not be processed]`
        : "[Image(s) could not be processed]";
      return { enrichedText: fallbackText, cachedRefs, source: "error" };
    }
  }

  /** Access the ImageCache for direct cache operations. */
  get cache(): typeof ImageCache {
    return ImageCache;
  }
}
