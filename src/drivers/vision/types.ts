import type { ImageContent } from "@earendil-works/pi-ai";
import type { ImageRef } from "../../resources/images/types.js";

export interface VisionConfig {
  provider: string;
  model: string;
  key?: string;
}

/** Result of processing images through the pipeline. */
export interface ProcessResult {
  /** Child Agent process ID when the generic Agent runtime handled the request. */
  agentId?: string;
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
  onWarning?: (message: string) => void;
  /** User-facing prompt before runtime-only context or attachment metadata is added. */
  displayPrompt?: string;
  /** Abort signal to cancel in-progress vision/OCR calls. */
  signal?: AbortSignal;
  /** Application-owned system prompt used by the configured vision model. */
  systemPrompt?: string;
  /** Application-owned instruction sent with the image content. */
  visionPrompt?: string;
  /** Model selected by the Vision Agent Application. */
  visionConfig?: VisionConfig;
}

export interface ImageProcessingPort {
  process(
    images: ImageContent[],
    text: string,
    options?: ProcessOptions,
  ): Promise<ProcessResult>;
  updateConfig(config: {
    visionConfig?: VisionConfig;
    fallbackApiKey?: string;
  }): void;
  shutdown(): Promise<void>;
}

export interface ImageStorePort {
  put(image: ImageContent): Promise<ImageRef>;
  get(ref: ImageRef): Promise<ImageContent | null>;
  getSync(ref: ImageRef): ImageContent | null;
  putSync(image: ImageContent): ImageRef;
}

// Re-export commonly used types for consumers
export type { ImageRef, ImageContent };
