import { describe, it, expect } from "vitest";
import { readImageFile } from "../../../src/drivers/vision/reader.js";
import { writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("vision reader", () => {
  describe("readImageFile", () => {
    it("reads a PNG file and returns ImageContent", async () => {
      const png = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==",
        "base64"
      );
      const tmpPath = join(tmpdir(), `dscode_test_${Date.now()}.png`);
      writeFileSync(tmpPath, png);

      try {
        const result = await readImageFile(tmpPath);
        expect(result).not.toBeNull();
        expect(result!.type).toBe("image");
        expect(result!.mimeType).toBe("image/png");
        expect(result!.data).toBeTruthy();
        expect(result!.data.length).toBeGreaterThan(0);
      } finally {
        try { unlinkSync(tmpPath); } catch { /* ignore */ }
      }
    });

    it("detects JPEG mime type from extension", async () => {
      const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
      const tmpPath = join(tmpdir(), `dscode_test_${Date.now()}.jpg`);
      writeFileSync(tmpPath, jpg);

      try {
        const result = await readImageFile(tmpPath);
        expect(result!.mimeType).toBe("image/jpeg");
      } finally {
        try { unlinkSync(tmpPath); } catch { /* ignore */ }
      }
    });
  });

  describe("readClipboardImageNonBlocking", () => {
    it("resolves with null or ImageContent without crashing", async () => {
      const { readClipboardImageNonBlocking } = await import(
        "../../../src/drivers/vision/reader.js"
      );
      const result = await readClipboardImageNonBlocking();
      expect(result === null || result?.type === "image").toBe(true);
    });
  });

  describe("readClipboardImage", () => {
    it("resolves with null or ImageContent without crashing", async () => {
      const { readClipboardImage } = await import(
        "../../../src/drivers/vision/reader.js"
      );
      const result = await readClipboardImage();
      expect(result === null || result?.type === "image").toBe(true);
    });
  });
});
