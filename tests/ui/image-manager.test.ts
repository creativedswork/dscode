import { describe, expect, it } from "vitest";
import { ImageManager } from "../../src/ui/image-manager.js";

function makeImg(data = "abcd"): { type: "image"; data: string; mimeType: string } {
  return { type: "image" as const, data, mimeType: "image/png" };
}

describe("ImageManager", () => {
  it("add increments count", () => {
    const mgr = new ImageManager();
    mgr.add(makeImg("a"));
    expect(mgr.count).toBe(1);
    mgr.add(makeImg("b"));
    expect(mgr.count).toBe(2);
  });

  it("removeLast returns images in LIFO order", () => {
    const mgr = new ImageManager();
    const a = makeImg("a");
    const b = makeImg("b");
    mgr.add(a);
    mgr.add(b);
    expect(mgr.removeLast()).toBe(b);
    expect(mgr.count).toBe(1);
    expect(mgr.removeLast()).toBe(a);
    expect(mgr.count).toBe(0);
  });

  it("removeLast on empty returns undefined", () => {
    const mgr = new ImageManager();
    expect(mgr.removeLast()).toBeUndefined();
    expect(mgr.count).toBe(0);
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

  it("clear empties all images", () => {
    const mgr = new ImageManager();
    mgr.add(makeImg("a"));
    mgr.add(makeImg("b"));
    mgr.clear();
    expect(mgr.count).toBe(0);
  });

  it("add after drain works correctly", () => {
    const mgr = new ImageManager();
    mgr.add(makeImg("a"));
    mgr.drain();
    mgr.add(makeImg("b"));
    expect(mgr.count).toBe(1);
    expect(mgr.removeLast()?.data).toBe("b");
  });
});
