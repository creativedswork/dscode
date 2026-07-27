import { Logger } from "../../utils/logger.js";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { ImageContent } from "@earendil-works/pi-ai";
import type { ImageRef } from "./types.js";

const CACHE_SUBDIR = join(homedir(), ".dscode", "data", "images");
const MAX_HEIGHT = 480;

const _cacheLogger = new Logger({ type: "harness", id: process.env.DSCODE_RUNTIME_ID ?? "unknown" });

let sharpAvailable = true;
let sharpInstance: typeof import("sharp") | null = null;

async function getSharp(): Promise<typeof import("sharp") | null> {
  if (!sharpAvailable) return null;
  if (sharpInstance) return sharpInstance;
  try {
    sharpInstance = (await import("sharp")).default;
    return sharpInstance;
  } catch {
    sharpAvailable = false;
    _cacheLogger.warn("ImageCache", "sharp not available, images will be stored uncompressed");
    return null;
  }
}

function ensureCacheDir(): void {
  if (!existsSync(CACHE_SUBDIR)) {
    mkdirSync(CACHE_SUBDIR, { recursive: true });
  }
}

function contentHash(data: string): string {
  return createHash("sha256").update(data).digest("hex").slice(0, 16);
}

function mimeToExt(mime: string): string {
  const map: Record<string, string> = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/gif": ".gif",
    "image/webp": ".webp",
    "image/bmp": ".bmp",
  };
  return map[mime] ?? ".png";
}

export class ImageCache {
  /**
   * Compress an image and write to cache directory as PNG.
   * PNG is used because terminal graphics protocols (Kitty, iTerm2)
   * universally support PNG but have inconsistent JPEG support.
   * Returns an ImageRef referencing the cached file.
   */
  static async put(image: ImageContent): Promise<ImageRef> {
    ensureCacheDir();
    const hash = contentHash(image.data);
    const filename = `${hash}.png`;
    const filepath = join(CACHE_SUBDIR, filename);

    // Already cached — deduplication
    if (existsSync(filepath)) {
      return { type: "image_ref", hash: filename, mimeType: "image/png" };
    }

    const sharp = await getSharp();
    if (sharp) {
      try {
        const buffer = Buffer.from(image.data, "base64");
        const metadata = await sharp(buffer).metadata();
        let pipeline = sharp(buffer);

        // Only resize if height > MAX_HEIGHT — never upscale
        if (metadata.height && metadata.height > MAX_HEIGHT) {
          pipeline = pipeline.resize({ height: MAX_HEIGHT, withoutEnlargement: true });
        }

        await pipeline.png().toFile(filepath);
        return { type: "image_ref", hash: filename, mimeType: "image/png" };
      } catch (err) {
        _cacheLogger.warn("ImageCache", `sharp processing failed, storing original: ${String(err)}`);
        // Fall through to fallback
      }
    }

    // Fallback: store original as-is (PNG extension, may not be valid PNG)
    if (!existsSync(filepath)) {
      writeFileSync(filepath, Buffer.from(image.data, "base64"));
    }
    return { type: "image_ref", hash: filename, mimeType: "image/png" };
  }

  /**
   * Read a cached image by its ImageRef and return as ImageContent.
   * Returns null if the cache file does not exist.
   */
  static async get(ref: ImageRef): Promise<ImageContent | null> {
    return ImageCache.getSync(ref);
  }

  /** Synchronous version of get() for use in non-async contexts. */
  static getSync(ref: ImageRef): ImageContent | null {
    if (!ref || !ref.hash) return null;
    const filepath = join(CACHE_SUBDIR, ref.hash);
    if (!existsSync(filepath)) return null;
    try {
      const data = readFileSync(filepath).toString("base64");
      return { type: "image", data, mimeType: ref.mimeType };
    } catch {
      return null;
    }
  }

  /** Get the cache directory path (for debugging / inspection). */
  static cacheDir(): string {
    return CACHE_SUBDIR;
  }

  /**
   * Synchronous fallback: store raw image data to cache.
   * Uses original format extension from mimeType.
   * Returns an ImageRef with the cache filename as hash.
   */
  static putSync(image: ImageContent): ImageRef {
    ensureCacheDir();
    const hash = contentHash(image.data);
    const mimeExt = mimeToExt(image.mimeType);
    const filename = `${hash}${mimeExt}`;
    const filepath = join(CACHE_SUBDIR, filename);
    if (!existsSync(filepath)) {
      writeFileSync(filepath, Buffer.from(image.data, "base64"));
    }
    return { type: "image_ref", hash: filename, mimeType: image.mimeType };
  }
}
