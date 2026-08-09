import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { ImageContent } from "@earendil-works/pi-ai";

import { getHostFacility } from "../../kernel/execution-context.js";
import { Logger } from "../../utils/logger.js";
import type { ImageRef } from "./types.js";

const DEFAULT_CACHE_DIR = join(homedir(), ".dscode", "data", "images");
const MAX_HEIGHT = 480;

export const IMAGE_CACHE_FACILITY = Symbol("dscode.image-cache");

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

export class ImageCacheStore {
  private sharpAvailable = true;
  private sharpInstance: typeof import("sharp") | null = null;

  constructor(
    private readonly directory = DEFAULT_CACHE_DIR,
    private readonly logger = new Logger({
      type: "image-cache",
      id: "standalone",
    }),
  ) {}

  async put(image: ImageContent): Promise<ImageRef> {
    this.ensureDirectory();
    const hash = contentHash(image.data);
    const filename = `${hash}.png`;
    const path = join(this.directory, filename);
    if (existsSync(path)) {
      return { type: "image_ref", hash: filename, mimeType: "image/png" };
    }

    const sharp = await this.getSharp();
    if (sharp) {
      try {
        const buffer = Buffer.from(image.data, "base64");
        const metadata = await sharp(buffer).metadata();
        let pipeline = sharp(buffer);
        if (metadata.height && metadata.height > MAX_HEIGHT) {
          pipeline = pipeline.resize({
            height: MAX_HEIGHT,
            withoutEnlargement: true,
          });
        }
        await pipeline.png().toFile(path);
        return { type: "image_ref", hash: filename, mimeType: "image/png" };
      } catch (error) {
        this.logger.warn(
          "ImageCache",
          `sharp processing failed, storing original: ${String(error)}`,
        );
      }
    }

    if (!existsSync(path)) {
      writeFileSync(path, Buffer.from(image.data, "base64"));
    }
    return { type: "image_ref", hash: filename, mimeType: "image/png" };
  }

  async get(ref: ImageRef): Promise<ImageContent | null> {
    return this.getSync(ref);
  }

  getSync(ref: ImageRef): ImageContent | null {
    if (!ref?.hash) return null;
    const path = join(this.directory, ref.hash);
    if (!existsSync(path)) return null;
    try {
      return {
        type: "image",
        data: readFileSync(path).toString("base64"),
        mimeType: ref.mimeType,
      };
    } catch {
      return null;
    }
  }

  putSync(image: ImageContent): ImageRef {
    this.ensureDirectory();
    const filename = `${contentHash(image.data)}${mimeToExt(image.mimeType)}`;
    const path = join(this.directory, filename);
    if (!existsSync(path)) {
      writeFileSync(path, Buffer.from(image.data, "base64"));
    }
    return { type: "image_ref", hash: filename, mimeType: image.mimeType };
  }

  cacheDir(): string {
    return this.directory;
  }

  private ensureDirectory(): void {
    if (!existsSync(this.directory)) {
      mkdirSync(this.directory, { recursive: true });
    }
  }

  private async getSharp(): Promise<typeof import("sharp") | null> {
    if (!this.sharpAvailable) return null;
    if (this.sharpInstance) return this.sharpInstance;
    try {
      this.sharpInstance = (await import("sharp")).default;
      return this.sharpInstance;
    } catch {
      this.sharpAvailable = false;
      this.logger.warn(
        "ImageCache",
        "sharp not available, images will be stored uncompressed",
      );
      return null;
    }
  }
}

function currentStore(): ImageCacheStore {
  return getHostFacility<ImageCacheStore>(IMAGE_CACHE_FACILITY)
    ?? new ImageCacheStore();
}

export class ImageCache {
  static put(image: ImageContent): Promise<ImageRef> {
    return currentStore().put(image);
  }

  static get(ref: ImageRef): Promise<ImageContent | null> {
    return currentStore().get(ref);
  }

  static getSync(ref: ImageRef): ImageContent | null {
    return currentStore().getSync(ref);
  }

  static putSync(image: ImageContent): ImageRef {
    return currentStore().putSync(image);
  }

  static cacheDir(): string {
    return currentStore().cacheDir();
  }
}
