import type { ImageContent } from "@mariozechner/pi-ai";

/**
 * Single-source-of-truth image lifecycle manager.
 *
 * Replaces the dual-array pendingImages/imageStore pattern.
 * All mutations go through this class — no consumer directly
 * accesses the internal array.
 *
 * The key insight: drain() atomically captures AND clears,
 * so handleSubmit can capture images before setText("")
 * triggers onChange, which would otherwise empty the array.
 */
export class ImageManager {
  private images: ImageContent[] = [];

  /** Append an image to the end of the list. */
  add(img: ImageContent): void {
    this.images.push(img);
  }

  /** Remove and return the last image (LIFO). Returns undefined if empty. */
  removeLast(): ImageContent | undefined {
    return this.images.pop();
  }

  /**
   * Atomically capture all images AND clear the internal array.
   * Returns a new array (not a reference to internal state).
   * No other mutation can interleave between capture and clear.
   */
  drain(): ImageContent[] {
    const captured = [...this.images];
    this.images = [];
    return captured;
  }

  /** Number of images currently stored. */
  get count(): number {
    return this.images.length;
  }

  /** Total base64 byte length across all stored images (for status display). */
  get totalBase64Bytes(): number {
    return this.images.reduce((sum, img) => sum + img.data.length, 0);
  }

  /** Remove all images. */
  clear(): void {
    this.images = [];
  }
}
