import { describe, it, expect } from "vitest";
import { dropOldest, slidingWindow } from "../../src/context/compaction.js";

describe("dropOldest", () => {
  it("should drop oldest pairs when over budget", () => {
    const messages = [
      { role: "user", content: "a" },
      { role: "assistant", content: "b" },
      { role: "user", content: "c" },
      { role: "assistant", content: "d" },
    ];
    // Very tight budget should drop oldest pair
    const result = dropOldest(messages, 1, 2);
    expect(result.length).toBeLessThan(messages.length);
    expect(result[0]).toEqual({ role: "user", content: "c" });
  });

  it("should not drop below minRetain", () => {
    const messages = [
      { role: "user", content: "a" },
      { role: "assistant", content: "b" },
    ];
    const result = dropOldest(messages, 1, 2);
    expect(result.length).toBe(2);
  });

  it("should return same messages if within budget", () => {
    const messages = [
      { role: "user", content: "hi" },
      { role: "assistant", content: "hello" },
    ];
    const result = dropOldest(messages, 10000, 2);
    expect(result).toEqual(messages);
  });

  it("should drop pairs until under budget", () => {
    const messages = [
      { role: "user", content: "x" },
      { role: "assistant", content: "y" },
      { role: "user", content: "a" },
      { role: "assistant", content: "b" },
      { role: "user", content: "c" },
      { role: "assistant", content: "d" },
    ];
    const result = dropOldest(messages, 10, 2);
    // Should have dropped some pairs
    expect(result.length).toBeLessThan(messages.length);
    expect(result.length).toBeGreaterThanOrEqual(2);
  });

  it("should handle empty messages", () => {
    const result = dropOldest([], 100, 2);
    expect(result).toEqual([]);
  });

  it("should handle single message", () => {
    const result = dropOldest([{ role: "user", content: "hi" }], 1, 2);
    expect(result.length).toBe(1);
  });
});

describe("slidingWindow", () => {
  it("should return all messages if under max", () => {
    const messages = [
      { role: "user", content: "a" },
      { role: "assistant", content: "b" },
    ];
    const result = slidingWindow(messages, 10);
    expect(result).toEqual(messages);
  });

  it("should return last N messages if over max", () => {
    const messages = [
      { role: "user", content: "a" },
      { role: "assistant", content: "b" },
      { role: "user", content: "c" },
      { role: "assistant", content: "d" },
      { role: "user", content: "e" },
      { role: "assistant", content: "f" },
    ];
    const result = slidingWindow(messages, 4);
    expect(result.length).toBe(4);
    expect(result[0]).toEqual({ role: "user", content: "c" });
    expect(result[result.length - 1]).toEqual({ role: "assistant", content: "f" });
  });

  it("should return empty for empty messages", () => {
    expect(slidingWindow([], 10)).toEqual([]);
  });

  it("should return all messages when count equals max", () => {
    const messages = [
      { role: "user", content: "a" },
      { role: "assistant", content: "b" },
    ];
    const result = slidingWindow(messages, 2);
    expect(result).toEqual(messages);
  });

  it("should handle maxMessages of 0", () => {
    const messages = [
      { role: "user", content: "a" },
    ];
    const result = slidingWindow(messages, 0);
    // slice(-0) returns the whole array in JS
    expect(result).toEqual(messages);
  });
});
