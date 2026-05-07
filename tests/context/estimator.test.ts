import { describe, it, expect } from "vitest";
import { estimateTokens, estimateMessagesTokens } from "../../src/context/estimator.js";

describe("estimateTokens", () => {
  it("should return 0 for empty string", () => {
    expect(estimateTokens("")).toBe(0);
  });

  it("should estimate tokens for ASCII text", () => {
    const text = "hello world this is a test";
    const tokens = estimateTokens(text);
    expect(tokens).toBeGreaterThan(0);
    expect(tokens).toBeLessThanOrEqual(text.length);
  });

  it("should estimate tokens for CJK text (lower divisor = more tokens per char)", () => {
    // CJK divisor is 2.5, ASCII divisor is 3.5
    // So for same char count, CJK should have more tokens
    const cjkText = "你好世界这是一个测试"; // 10 chars
    const asciiText = "abcdefghij";          // 10 chars
    const cjkTokens = estimateTokens(cjkText);
    const asciiTokens = estimateTokens(asciiText);
    // Same length, CJK should have more tokens (smaller divisor)
    expect(cjkTokens).toBeGreaterThan(asciiTokens);
  });

  it("should handle mixed CJK and ASCII", () => {
    const text = "你好 world 测试 test";
    const tokens = estimateTokens(text);
    expect(tokens).toBeGreaterThan(0);
  });

  it("should handle single character", () => {
    expect(estimateTokens("a")).toBe(1);
    expect(estimateTokens("你")).toBe(1);
  });

  it("should handle long text", () => {
    const text = "a".repeat(1000);
    const tokens = estimateTokens(text);
    expect(tokens).toBeGreaterThan(200);
    expect(tokens).toBeLessThan(400);
  });
});

describe("estimateMessagesTokens", () => {
  it("should return 0 for empty array", () => {
    expect(estimateMessagesTokens([])).toBe(0);
  });

  it("should estimate tokens for messages with string content", () => {
    const messages = [
      { role: "user", content: "hello" },
      { role: "assistant", content: "world" },
    ];
    const tokens = estimateMessagesTokens(messages);
    expect(tokens).toBeGreaterThan(0);
  });

  it("should estimate tokens for messages with content blocks", () => {
    const messages = [
      {
        role: "user",
        content: [
          { type: "text", text: "hello world" },
        ],
      },
    ];
    const tokens = estimateMessagesTokens(messages);
    expect(tokens).toBeGreaterThan(0);
  });

  it("should handle messages with no content", () => {
    const messages = [
      { role: "user", content: undefined },
    ];
    const tokens = estimateMessagesTokens(messages);
    expect(tokens).toBe(4); // just framing overhead
  });

  it("should handle messages with non-text content blocks", () => {
    const messages = [
      {
        role: "user",
        content: [
          { type: "image", data: "base64..." },
        ],
      },
    ];
    const tokens = estimateMessagesTokens(messages);
    expect(tokens).toBe(4); // just framing overhead
  });

  it("should add framing overhead per message", () => {
    const oneMsg = estimateMessagesTokens([{ role: "user", content: "hi" }]);
    const twoMsgs = estimateMessagesTokens([
      { role: "user", content: "hi" },
      { role: "assistant", content: "hello" },
    ]);
    // Two messages should have more overhead than one
    expect(twoMsgs - oneMsg).toBeGreaterThan(4);
  });
});
