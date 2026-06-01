import type { ImageContent } from "@mariozechner/pi-ai";
import type { ImageRef } from "../../session/types.js";
import type { VisionConfig } from "../../core/types.js";

/** Result of processing images through the pipeline. */
export interface ProcessResult {
  /** The enriched text to send to the main model (original text + description). */
  enrichedText: string;
  /** References to the cached images. */
  cachedRefs: ImageRef[];
  /** Which processing step produced the result. */
  source: "vision" | "ocr" | "none" | "error";
}

/** Progress callback payload for MCP intermediate UI updates. */
export interface ProgressInfo {
  phase: "compressing" | "describing" | "ocr" | "done";
  cachedRefs: ImageRef[];
}

export type ProgressFn = (info: ProgressInfo) => void;

/** Options for ImagePipeline.process(). */
export interface ProcessOptions {
  onProgress?: ProgressFn;
}

// Re-export commonly used types for consumers
export type { ImageRef, ImageContent, VisionConfig };
