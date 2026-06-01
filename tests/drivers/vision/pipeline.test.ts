import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ImageContent } from "@mariozechner/pi-ai";
import { ImagePipeline } from "../../../src/drivers/vision/pipeline.js";
import type { ProcessResult } from "../../../src/drivers/vision/types.js";

// Mock dependencies
vi.mock("../../../src/drivers/vision/cache.js", () => ({
  ImageCache: {
    put: vi.fn(),
    getSync: vi.fn(),
  },
}));

vi.mock("../../../src/drivers/vision/client.js", () => ({
  resolveVisionModel: vi.fn(),
  describeImagesViaVisionModel: vi.fn(),
}));

vi.mock("../../../src/drivers/vision/ocr.js", () => ({
  ocrImages: vi.fn(),
}));

import { ImageCache } from "../../../src/drivers/vision/cache.js";
import {
  resolveVisionModel,
  describeImagesViaVisionModel,
} from "../../../src/drivers/vision/client.js";
import { ocrImages } from "../../../src/drivers/vision/ocr.js";

const mockImage: ImageContent = {
  type: "image",
  data: "bW9ja2RhdGE=",
  mimeType: "image/png",
};

const mockCachedRef = {
  type: "image_ref" as const,
  hash: "abc123.png",
  mimeType: "image/png",
};

function createPipeline(hasVision = true) {
  return new ImagePipeline({
    visionConfig: hasVision
      ? { provider: "openai", model: "gpt-4-vision" }
      : undefined,
    fallbackApiKey: "test-key",
    onWarning: vi.fn(),
  });
}

describe("ImagePipeline.process()", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: cache always succeeds
    vi.mocked(ImageCache.put).mockResolvedValue(mockCachedRef);
  });

  // ── Scenario 1: Vision success ──

  it("should return vision description when vision model succeeds", async () => {
    const pipeline = createPipeline(true);
    vi.mocked(resolveVisionModel).mockReturnValue({
      model: { name: "gpt-4-vision", input: ["image"] } as any,
      apiKey: "test-key",
    });
    vi.mocked(describeImagesViaVisionModel).mockResolvedValue(
      "A screenshot of code"
    );

    const result = await pipeline.process([mockImage], "Describe:");

    expect(result.source).toBe("vision");
    expect(result.enrichedText).toContain("A screenshot of code");
    expect(result.enrichedText).toContain("<image_description>");
    expect(result.cachedRefs).toEqual([mockCachedRef]);
    expect(describeImagesViaVisionModel).toHaveBeenCalledTimes(1);
    // OCR should NOT have been called
    expect(ocrImages).not.toHaveBeenCalled();
  });

  // ── Scenario 2: Vision empty → OCR fallback ──

  it("should fall back to OCR when vision model returns empty description", async () => {
    const pipeline = createPipeline(true);
    vi.mocked(resolveVisionModel).mockReturnValue({
      model: { name: "gpt-4-vision", input: ["image"] } as any,
      apiKey: "test-key",
    });
    vi.mocked(describeImagesViaVisionModel).mockResolvedValue("");
    vi.mocked(ocrImages).mockResolvedValue({
      hasText: true,
      content: "extracted text",
    });

    const result = await pipeline.process([mockImage], "User text:");

    expect(result.source).toBe("ocr");
    expect(result.enrichedText).toContain("extracted text");
    expect(pipeline["onWarning"]).toHaveBeenCalled();
  });

  // ── Scenario 3: Vision error → OCR fallback ──

  it("should fall back to OCR when vision model throws", async () => {
    const pipeline = createPipeline(true);
    vi.mocked(resolveVisionModel).mockReturnValue({
      model: { name: "gpt-4-vision", input: ["image"] } as any,
      apiKey: "test-key",
    });
    vi.mocked(describeImagesViaVisionModel).mockRejectedValue(
      new Error("API error")
    );
    vi.mocked(ocrImages).mockResolvedValue({
      hasText: true,
      content: "ocr fallback text",
    });

    const result = await pipeline.process([mockImage], "Text:");

    expect(result.source).toBe("ocr");
    expect(result.enrichedText).toContain("ocr fallback text");
    expect(pipeline["onWarning"]).toHaveBeenCalledWith(
      expect.stringContaining("Vision model failed")
    );
  });

  // ── Scenario 4: OCR finds no useful text → source "none" ──

  it("should return source=none when OCR finds no useful text", async () => {
    const pipeline = createPipeline(false); // no vision config
    // resolveVisionModel returns null when no config
    vi.mocked(resolveVisionModel).mockReturnValue(null);
    vi.mocked(ocrImages).mockResolvedValue({
      hasText: false,
      content: "",
    });

    const result = await pipeline.process([mockImage], "Hello:");

    expect(result.source).toBe("none");
    // Original text preserved unchanged — no empty message
    expect(result.enrichedText).toBe("Hello:");
    expect(result.cachedRefs).toEqual([mockCachedRef]);
  });

  // ── Scenario 5: Double failure (vision + OCR both fail) ──

  it("should return source=error when both vision and OCR fail", async () => {
    const pipeline = createPipeline(true);
    vi.mocked(resolveVisionModel).mockReturnValue({
      model: { name: "gpt-4-vision", input: ["image"] } as any,
      apiKey: "test-key",
    });
    vi.mocked(describeImagesViaVisionModel).mockRejectedValue(
      new Error("Vision down")
    );
    vi.mocked(ocrImages).mockRejectedValue(new Error("OCR down"));

    const result = await pipeline.process([mockImage], "User text:");

    expect(result.source).toBe("error");
    expect(result.enrichedText).toContain("[Image(s) could not be processed]");
  });

  // ── Scenario 6: No vision config → directly to OCR ──

  it("should skip vision when no vision config is provided", async () => {
    const pipeline = createPipeline(false);
    vi.mocked(resolveVisionModel).mockReturnValue(null);
    vi.mocked(ocrImages).mockResolvedValue({
      hasText: true,
      content: "pure ocr text",
    });

    const result = await pipeline.process([mockImage], "");

    expect(result.source).toBe("ocr");
    expect(result.enrichedText).toContain("pure ocr text");
    expect(describeImagesViaVisionModel).not.toHaveBeenCalled();
  });

  // ── Scenario 7: onProgress callback ──

  it("should call onProgress at each phase", async () => {
    const pipeline = createPipeline(true);
    vi.mocked(resolveVisionModel).mockReturnValue({
      model: { name: "gpt-4-vision", input: ["image"] } as any,
      apiKey: "test-key",
    });
    vi.mocked(describeImagesViaVisionModel).mockResolvedValue("description");

    const progressCalls: string[] = [];
    await pipeline.process([mockImage], "", {
      onProgress: (info) => progressCalls.push(info.phase),
    });

    // Should see: compressing (x2), describing, done
    expect(progressCalls).toContain("compressing");
    expect(progressCalls).toContain("describing");
    expect(progressCalls).toContain("done");
    // compressing may appear twice (before and after caching)
    expect(progressCalls.filter((p) => p === "compressing").length).toBe(2);
  });

  // ── Scenario 8: Image normalization ──

  it("should normalize images missing mimeType", async () => {
    const pipeline = createPipeline(false);
    vi.mocked(resolveVisionModel).mockReturnValue(null);
    vi.mocked(ocrImages).mockResolvedValue({ hasText: false, content: "" });

    const badImage = { type: "image" as const, data: "xyz" } as ImageContent;
    await pipeline.process([badImage], "");

    // ImageCache.put should have been called with normalized image
    expect(ImageCache.put).toHaveBeenCalledWith(
      expect.objectContaining({ mimeType: "image/png", data: "xyz" })
    );
  });

  // ── Scenario 9: Empty text with vision success ──

  it("should produce enrichedText with just description when input text is empty", async () => {
    const pipeline = createPipeline(true);
    vi.mocked(resolveVisionModel).mockReturnValue({
      model: { name: "gpt-4-vision", input: ["image"] } as any,
      apiKey: "test-key",
    });
    vi.mocked(describeImagesViaVisionModel).mockResolvedValue("description");

    const result = await pipeline.process([mockImage], "");

    expect(result.source).toBe("vision");
    // Should start directly with <image_description>, no leading newlines from empty text
    expect(result.enrichedText).toBe(
      "<image_description>\ndescription\n</image_description>"
    );
  });
});
