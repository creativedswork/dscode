import type { ImageContent } from "@earendil-works/pi-ai";

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
 *
 * Each image is assigned a monotonic integer ID at add() time
 * so placeholders like [image:1], [image:2] can be precisely
 * mapped back to the correct image for by-ID removal.
 */
export class ImageManager {
  private images: ImageContent[] = [];
  private idMap = new Map<number, ImageContent>();

  /** Append an image to the end of the list. Returns the assigned ID. */
  add(img: ImageContent): number {
    // Find the smallest positive integer not in use (reuse deleted slots)
    let id = 1;
    while (this.idMap.has(id)) id++;
    this.images.push(img);

    this.idMap.set(id, img);
    return id;
  }

  /** Remove the image with the given ID. Returns true if found and removed. */
  removeById(id: number): boolean {
    const img = this.idMap.get(id);
    if (!img) return false;
    this.idMap.delete(id);
    const idx = this.images.indexOf(img);
    if (idx !== -1) this.images.splice(idx, 1);
    return true;
  }

  /** Get the image with the given ID, or undefined if not found. */
  getById(id: number): ImageContent | undefined {
    return this.idMap.get(id);
  }

  /** Return all active image IDs in insertion order. */
  getAllIds(): number[] {
    const ids: number[] = [];
    for (const img of this.images) {
      // Find the id for this image by scanning idMap
      for (const [id, mapped] of this.idMap) {
        if (mapped === img) {
          ids.push(id);
          break;
        }
      }
    }
    return ids;
  }

  /**
   * Atomically capture all images AND clear the internal array.
   * Returns a new array (not a reference to internal state).
   * No other mutation can interleave between capture and clear.
   */
  drain(): ImageContent[] {
    const captured = [...this.images];
    this.images = [];
    this.idMap.clear();
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
    this.idMap.clear();
  }
}
