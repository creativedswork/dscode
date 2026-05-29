import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { ImageContent } from "@mariozechner/pi-ai";
import type { ImageRef } from "../core/types.js";

const CACHE_SUBDIR = join(homedir(), ".dscode", "data", "images");
const JPEG_QUALITY = 85;
const MAX_HEIGHT = 480;

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
    console.error("[image-cache] sharp not available, images will be stored uncompressed");
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

export class ImageCache {
  /**
   * Compress an image to height=480px and write to cache directory.
   * Returns an ImageRef referencing the cached file.
   * If sharp is unavailable or processing fails, falls back to storing the original
   * image data as-is.
   */
  static async put(image: ImageContent): Promise<ImageRef> {
    ensureCacheDir();
    const hash = contentHash(image.data);
    const filename = `${hash}.jpg`;
    const filepath = join(CACHE_SUBDIR, filename);

    // Already cached — deduplication
    if (existsSync(filepath)) {
      return { type: "image_ref", hash: filename, mimeType: "image/jpeg" };
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

        await pipeline.jpeg({ quality: JPEG_QUALITY }).toFile(filepath);
        return { type: "image_ref", hash: filename, mimeType: "image/jpeg" };
      } catch (err) {
        console.error("[image-cache] sharp processing failed, storing original:", err);
        // Fall through to fallback
      }
    }

    // Fallback: store original as-is
    const mimeExt = mimeToExt(image.mimeType);
    const fallbackFilename = `${hash}${mimeExt}`;
    const fallbackPath = join(CACHE_SUBDIR, fallbackFilename);
    if (!existsSync(fallbackPath)) {
      writeFileSync(fallbackPath, Buffer.from(image.data, "base64"));
    }
    return { type: "image_ref", hash: fallbackFilename, mimeType: image.mimeType };
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
}

function mimeToExt(mime: string): string {
  const map: Record<string, string> = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/gif": ".gif",
    "image/webp": ".webp",
    "image/bmp": ".bmp",
  };
  return map[mime] ?? ".jpg";
}
