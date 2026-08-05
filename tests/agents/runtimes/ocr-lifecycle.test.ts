import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createWorker: vi.fn(),
  terminate: vi.fn(async () => {}),
}));

vi.mock("tesseract.js", () => ({
  createWorker: mocks.createWorker,
}));

import { ocrImage, shutdownOcr } from "../../../src/drivers/vision/ocr.js";

const image = {
  type: "image" as const,
  data: "aW1hZ2U=",
  mimeType: "image/png",
};

describe("OCR worker lifecycle", () => {
  beforeEach(async () => {
    await shutdownOcr();
    mocks.createWorker.mockReset();
    mocks.terminate.mockClear();
    mocks.createWorker.mockImplementation(async () => ({
      recognize: vi.fn(async () => ({ data: { text: "recognized text" } })),
      terminate: mocks.terminate,
    }));
  });

  afterEach(async () => {
    await shutdownOcr();
  });

  it("terminates the shared worker on shutdown and creates a fresh worker later", async () => {
    await ocrImage(image);
    await shutdownOcr();
    await ocrImage(image);

    expect(mocks.terminate).toHaveBeenCalledTimes(1);
    expect(mocks.createWorker).toHaveBeenCalledTimes(2);
  });
});
