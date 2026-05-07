import { describe, it, expect, beforeEach } from "vitest";
import { ContextManager } from "../../src/context/manager.js";

describe("ContextManager", () => {
  let config: Parameters<typeof ContextManager.prototype.constructor>[0];

  beforeEach(() => {
    config = {
      strategy: "sliding-window",
      targetUtilization: 0.85,
      minRetainedMessages: 6,
    };
  });

  it("should update model limits", () => {
    const cm = new ContextManager(config);
    cm.updateModel(128000, 8192);
    // No direct getter, but transform should work
    expect(() => cm.transform([])).not.toThrow();
  });

  it("should return messages unchanged when under budget", async () => {
    const cm = new ContextManager(config);
    cm.updateModel(128000, 8192);
    const messages = [
      { role: "user", content: "hi" },
      { role: "assistant", content: "hello" },
    ];
    const result = await cm.transform(messages);
    expect(result).toEqual(messages);
  });

  it("should compact using sliding-window strategy", async () => {
    const cm = new ContextManager({ ...config, strategy: "sliding-window" });
    // Use a tiny context window so messages exceed budget
    cm.updateModel(1000, 500);
    // Create many messages to trigger compaction
    const messages = Array.from({ length: 100 }, (_, i) => ({
      role: i % 2 === 0 ? "user" : "assistant",
      content: `message ${i} `.repeat(50), // ~500 chars each
    }));
    const result = await cm.transform(messages);
    // Should have been compacted
    expect(result.length).toBeLessThan(messages.length);
  });

  it("should compact using drop-oldest strategy", async () => {
    const cm = new ContextManager({ ...config, strategy: "drop-oldest" });
    cm.updateModel(1000, 500);
    const messages = Array.from({ length: 100 }, (_, i) => ({
      role: i % 2 === 0 ? "user" : "assistant",
      content: `message ${i} `.repeat(50),
    }));
    const result = await cm.transform(messages);
    expect(result.length).toBeLessThan(messages.length);
  });

  it("should compact using summarize-prefix strategy (falls back to sliding-window)", async () => {
    const cm = new ContextManager({ ...config, strategy: "summarize-prefix" });
    cm.updateModel(1000, 500);
    const messages = Array.from({ length: 100 }, (_, i) => ({
      role: i % 2 === 0 ? "user" : "assistant",
      content: `message ${i} `.repeat(50),
    }));
    const result = await cm.transform(messages);
    expect(result.length).toBeLessThan(messages.length);
  });

  it("should return estimated tokens", () => {
    const cm = new ContextManager(config);
    const messages = [
      { role: "user", content: "hello" },
      { role: "assistant", content: "world" },
    ];
    const tokens = cm.getEstimatedTokens(messages);
    expect(tokens).toBeGreaterThan(0);
  });

  it("should handle empty messages", async () => {
    const cm = new ContextManager(config);
    cm.updateModel(128000, 8192);
    const result = await cm.transform([]);
    expect(result).toEqual([]);
  });

  it("should handle AbortSignal gracefully", async () => {
    const cm = new ContextManager(config);
    cm.updateModel(128000, 8192);
    const controller = new AbortController();
    const messages = [
      { role: "user", content: "hi" },
      { role: "assistant", content: "hello" },
    ];
    const result = await cm.transform(messages, controller.signal);
    expect(result).toEqual(messages);
  });
});
