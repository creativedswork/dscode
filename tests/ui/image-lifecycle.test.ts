import { describe, expect, it } from "vitest";
import { ImageManager } from "../../src/ui/tui/image-manager.js";

function makeImg(data: string) {
  return { type: "image" as const, data, mimeType: "image/png" };
}

describe("ImageManager — ID-based lifecycle scenarios", () => {
  it("paste → delete → paste → submit = 1 image", () => {
    const mgr = new ImageManager();

    // First paste
    const imgA = makeImg("A");
    const idA = mgr.add(imgA);
    expect(mgr.count).toBe(1);

    // User deletes [image:1] placeholder — removes by ID
    mgr.removeById(idA);
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
    const id = mgr.add(makeImg("A"));
    expect(mgr.count).toBe(1);

    // Delete placeholder by ID
    mgr.removeById(id);
    expect(mgr.count).toBe(0);

    // Submit: no images
    const drained = mgr.drain();
    expect(drained).toEqual([]);
    expect(mgr.count).toBe(0);
  });

  it("drain before setText onChange is safe", () => {
    // Simulates: drainImages() → setText("") → onChange(no-op)
    const mgr = new ImageManager();
    const id = mgr.add(makeImg("img"));

    // Step 1: drain (as done in handleSubmit before setText)
    const drained = mgr.drain();
    expect(drained).toHaveLength(1);
    expect(mgr.count).toBe(0);

    // Step 2: onChange fires — tries to remove the now-drained image
    // This should be a no-op because the image is already gone
    expect(mgr.removeById(id)).toBe(false);
    expect(mgr.count).toBe(0);
  });

  it("multiple paste and delete cycles with positional accuracy", () => {
    const mgr = new ImageManager();

    const id1 = mgr.add(makeImg("1"));
    const id2 = mgr.add(makeImg("2"));
    expect(mgr.count).toBe(2);

    // Delete first image (id=1), NOT the last one
    mgr.removeById(id1);
    expect(mgr.count).toBe(1);
    expect(mgr.getAllIds()).toEqual([id2]);

    // Add a third image
    const id3 = mgr.add(makeImg("3"));
    expect(mgr.count).toBe(2);
    expect(mgr.getAllIds()).toEqual([id2, id3]);

    // Delete the second (now id2)
    mgr.removeById(id2);
    expect(mgr.count).toBe(1);
    expect(mgr.getAllIds()).toEqual([id3]);

    mgr.add(makeImg("4"));
    expect(mgr.count).toBe(2);

    const drained = mgr.drain();
    expect(drained).toHaveLength(2);
    expect(drained[0].data).toBe("3");
    expect(drained[1].data).toBe("4");
  });

  it("clear during conversation reset works and resets IDs", () => {
    const mgr = new ImageManager();
    mgr.add(makeImg("1"));
    mgr.add(makeImg("2"));
    mgr.clear();
    expect(mgr.count).toBe(0);

    // After clear, IDs reset — can still add new images
    expect(mgr.add(makeImg("3"))).toBe(1);
    expect(mgr.count).toBe(1);
  });
});
