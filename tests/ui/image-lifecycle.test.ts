import { describe, expect, it } from "vitest";
import { ImageManager } from "../../src/ui/image-manager.js";

function makeImg(data: string) {
  return { type: "image" as const, data, mimeType: "image/png" };
}

describe("ImageManager — dual-array bug scenarios", () => {
  it("paste → delete → paste → submit = 1 image", () => {
    const mgr = new ImageManager();

    // First paste
    const imgA = makeImg("A");
    mgr.add(imgA);
    expect(mgr.count).toBe(1);

    // User deletes [image] placeholder
    mgr.removeLast();
    expect(mgr.count).toBe(0);

    // Second paste
    const imgB = makeImg("B");
    mgr.add(imgB);
    expect(mgr.count).toBe(1);

    // Submit: drain captures exactly 1 image (imgB)
    const drained = mgr.drain();
    expect(drained).toEqual([imgB]);
    expect(mgr.count).toBe(0);
  });

  it("paste → delete → type text → submit = 0 images", () => {
    const mgr = new ImageManager();

    // Paste
    mgr.add(makeImg("A"));
    expect(mgr.count).toBe(1);

    // Delete placeholder
    mgr.removeLast();
    expect(mgr.count).toBe(0);

    // Submit: no images
    const drained = mgr.drain();
    expect(drained).toEqual([]);
    expect(mgr.count).toBe(0);
  });

  it("drain before setText onChange is safe", () => {
    // Simulates: drainImages() → setText("") → onChange(no-op)
    const mgr = new ImageManager();
    mgr.add(makeImg("img"));

    // Step 1: drain (as done in handleSubmit before setText)
    const drained = mgr.drain();
    expect(drained).toHaveLength(1);
    expect(mgr.count).toBe(0);

    // Step 2: onChange fires (simulated by removeLast on empty)
    // This should be a no-op because count is already 0
    const removed = mgr.removeLast();
    expect(removed).toBeUndefined();
    expect(mgr.count).toBe(0);
  });

  it("multiple paste and delete cycles stay consistent", () => {
    const mgr = new ImageManager();

    mgr.add(makeImg("1"));
    mgr.add(makeImg("2"));
    expect(mgr.count).toBe(2);

    mgr.removeLast(); // remove "2"
    expect(mgr.count).toBe(1);

    mgr.add(makeImg("3"));
    expect(mgr.count).toBe(2);

    mgr.removeLast(); // remove "3"
    mgr.removeLast(); // remove "1"
    expect(mgr.count).toBe(0);

    mgr.add(makeImg("4"));
    expect(mgr.count).toBe(1);

    const drained = mgr.drain();
    expect(drained).toHaveLength(1);
    expect(drained[0].data).toBe("4");
  });

  it("clear during conversation reset works", () => {
    const mgr = new ImageManager();
    mgr.add(makeImg("1"));
    mgr.add(makeImg("2"));
    mgr.clear();
    expect(mgr.count).toBe(0);

    // After clear, can still add new images
    mgr.add(makeImg("3"));
    expect(mgr.count).toBe(1);
  });
});
