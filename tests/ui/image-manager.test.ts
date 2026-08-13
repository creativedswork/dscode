import { describe, expect, it } from "vitest";
import { ImageManager } from "../../src/ui/tui/image-manager.js";

function makeImg(data = "abcd"): { type: "image"; data: string; mimeType: string } {
  return { type: "image" as const, data, mimeType: "image/png" };
}

describe("ImageManager", () => {
  it("add returns sequential IDs and increments count", () => {
    const mgr = new ImageManager();
    expect(mgr.add(makeImg("a"))).toBe(1);
    expect(mgr.count).toBe(1);
    expect(mgr.add(makeImg("b"))).toBe(2);
    expect(mgr.count).toBe(2);
  });

  it("removeById removes the correct image", () => {
    const mgr = new ImageManager();
    const a = makeImg("a");
    const b = makeImg("b");
    mgr.add(a);
    mgr.add(b);
    expect(mgr.removeById(1)).toBe(true);
    expect(mgr.getById(1)).toBeUndefined();
    expect(mgr.getById(2)).toBe(b);
    expect(mgr.count).toBe(1);
  });

  it("removeById on non-existent ID returns false", () => {
    const mgr = new ImageManager();
    expect(mgr.removeById(99)).toBe(false);
    expect(mgr.count).toBe(0);
  });

  it("getById returns image or undefined", () => {
    const mgr = new ImageManager();
    const a = makeImg("a");
    mgr.add(a);
    expect(mgr.getById(1)).toBe(a);
    expect(mgr.getById(99)).toBeUndefined();
  });

  it("getAllIds returns active IDs in insertion order", () => {
    const mgr = new ImageManager();
    mgr.add(makeImg("a"));
    mgr.add(makeImg("b"));
    mgr.add(makeImg("c"));
    expect(mgr.getAllIds()).toEqual([1, 2, 3]);
    mgr.removeById(2);
    expect(mgr.getAllIds()).toEqual([1, 3]);
  });

  it("drain captures all and clears", () => {
    const mgr = new ImageManager();
    const a = makeImg("a");
    const b = makeImg("b");
    mgr.add(a);
    mgr.add(b);
    const captured = mgr.drain();
    expect(captured).toEqual([a, b]);
    expect(mgr.count).toBe(0);
    expect(mgr.getAllIds()).toEqual([]);
  });

  it("drain returns a copy, not internal reference", () => {
    const mgr = new ImageManager();
    mgr.add(makeImg("a"));
    const captured = mgr.drain();
    captured.push(makeImg("intruder"));
    expect(mgr.count).toBe(0);
  });

  it("drain on empty returns empty array", () => {
    const mgr = new ImageManager();
    const captured = mgr.drain();
    expect(captured).toEqual([]);
    expect(mgr.count).toBe(0);
  });

  it("clear empties all images and resets nextId", () => {
    const mgr = new ImageManager();
    mgr.add(makeImg("a"));
    mgr.add(makeImg("b"));
    mgr.clear();
    expect(mgr.count).toBe(0);
    expect(mgr.getAllIds()).toEqual([]);
    // After clear, IDs restart from 1
    expect(mgr.add(makeImg("c"))).toBe(1);
  });

  it("reuses the smallest available ID slot after removal", () => {
    const mgr = new ImageManager();
    mgr.add(makeImg("a")); // id=1
    mgr.add(makeImg("b")); // id=2
    mgr.add(makeImg("c")); // id=3
    mgr.removeById(2);
    // Next add should reuse id=2 (smallest gap)
    expect(mgr.add(makeImg("d"))).toBe(2);
    mgr.removeById(1);
    // Next add should reuse id=1
    expect(mgr.add(makeImg("e"))).toBe(1);
  });

  it("add after drain works correctly and IDs restart from 1", () => {
    const mgr = new ImageManager();
    mgr.add(makeImg("a"));
    mgr.drain();
    const id = mgr.add(makeImg("b"));
    expect(id).toBe(1); // after drain, IDs restart from 1
    expect(mgr.count).toBe(1);
    expect(mgr.count).toBe(1);
    expect(mgr.getById(id)).toBeDefined();
  });
});
