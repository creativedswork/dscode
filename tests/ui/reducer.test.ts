import { describe, expect, it, vi } from "vitest";
import { conversationReducer } from "../../src/ui/shared/reducer.js";
import type { UIMessage, ServerEvent } from "../../src/ui/shared/types.js";

describe("conversationReducer — thinking timer anchors", () => {
  it("records thinkingStartedAt and thinkingUpdatedAt on first thinking_delta", () => {
    const now = 1700000000000;
    vi.spyOn(Date, "now").mockReturnValue(now);

    const result = conversationReducer([], { type: "thinking_delta", delta: "Let me think" });

    expect(result).toHaveLength(1);
    expect(result[0].thinkingStartedAt).toBe(now);
    expect(result[0].thinkingUpdatedAt).toBe(now);
    expect(result[0].thinking).toBe("Let me think");

    vi.restoreAllMocks();
  });

  it("refreshes thinkingUpdatedAt on subsequent thinking_delta, keeps thinkingStartedAt", () => {
    const startTime = 1700000000000;
    const deltaTime = 1700000003000;
    let currentTime = startTime;
    vi.spyOn(Date, "now").mockImplementation(() => currentTime);

    const afterFirst = conversationReducer([], { type: "thinking_delta", delta: "First" });

    currentTime = deltaTime;
    const afterSecond = conversationReducer(afterFirst, { type: "thinking_delta", delta: "Second" });

    expect(afterSecond).toHaveLength(1);
    expect(afterSecond[0].thinkingStartedAt).toBe(startTime);
    expect(afterSecond[0].thinkingUpdatedAt).toBe(deltaTime);
    expect(afterSecond[0].thinking).toBe("FirstSecond");

    vi.restoreAllMocks();
  });

  it("clears thinkingStartedAt on text_delta after thinking", () => {
    vi.spyOn(Date, "now").mockReturnValue(1700000000000);

    const afterThinking = conversationReducer([], { type: "thinking_delta", delta: "Think" });
    const afterText = conversationReducer(afterThinking, { type: "text_delta", delta: "Hello" });

    expect(afterText).toHaveLength(1);
    expect(afterText[0].thinkingStartedAt).toBeUndefined();
    expect(afterText[0].thinking).toBe("Think");
    expect(afterText[0].content).toBe("Hello");

    vi.restoreAllMocks();
  });

  it("clears thinkingStartedAt on tool_start after thinking", () => {
    vi.spyOn(Date, "now").mockReturnValue(1700000000000);

    const afterThinking = conversationReducer([], { type: "thinking_delta", delta: "Think" });
    const afterTool = conversationReducer(afterThinking, {
      type: "tool_start",
      name: "read_file",
      args: { path: "/foo" },
    });

    expect(afterTool).toHaveLength(1);
    expect(afterTool[0].thinkingStartedAt).toBeUndefined();
    expect(afterTool[0].thinking).toBe("Think");
    expect(afterTool[0].tools).toHaveLength(1);

    vi.restoreAllMocks();
  });

  it("new thinking segment after text_delta gets fresh thinkingStartedAt", () => {
    const firstStart = 1700000000000;
    const secondStart = 1700000005000;
    let currentTime = firstStart;
    vi.spyOn(Date, "now").mockImplementation(() => currentTime);

    // First thinking segment
    const afterFirstThink = conversationReducer([], { type: "thinking_delta", delta: "Think1" });

    // Text delta ends first segment
    const afterText = conversationReducer(afterFirstThink, { type: "text_delta", delta: "Hello" });

    // Second thinking segment
    currentTime = secondStart;
    const afterSecondThink = conversationReducer(afterText, { type: "thinking_delta", delta: "Think2" });

    expect(afterSecondThink).toHaveLength(1);
    expect(afterSecondThink[0].thinkingStartedAt).toBe(secondStart);
    expect(afterSecondThink[0].thinkingUpdatedAt).toBe(secondStart);
    expect(afterSecondThink[0].thinking).toBe("Think1Think2");

    vi.restoreAllMocks();
  });

  it("new thinking segment after tool_start gets fresh thinkingStartedAt", () => {
    const firstStart = 1700000000000;
    const secondStart = 1700000005000;
    let currentTime = firstStart;
    vi.spyOn(Date, "now").mockImplementation(() => currentTime);

    // First thinking segment
    const afterFirstThink = conversationReducer([], { type: "thinking_delta", delta: "Think1" });

    // Tool start ends first segment
    const afterTool = conversationReducer(afterFirstThink, {
      type: "tool_start",
      name: "read_file",
      args: { path: "/foo" },
    });

    // Second thinking segment
    currentTime = secondStart;
    const afterSecondThink = conversationReducer(afterTool, { type: "thinking_delta", delta: "Think2" });

    expect(afterSecondThink).toHaveLength(1);
    expect(afterSecondThink[0].thinkingStartedAt).toBe(secondStart);
    expect(afterSecondThink[0].thinkingUpdatedAt).toBe(secondStart);
    expect(afterSecondThink[0].thinking).toBe("Think1Think2");

    vi.restoreAllMocks();
  });

  it("does not set thinkingStartedAt on historical messages from ready event", () => {
    const readyEvent: ServerEvent = {
      type: "ready",
      model: "test-model",
      config: {} as any,
      messages: [
        { role: "assistant", content: "answer", thinking: "some thinking" },
      ],
    };

    const result = conversationReducer([], readyEvent);

    expect(result).toHaveLength(1);
    expect(result[0].thinkingStartedAt).toBeUndefined();
    expect(result[0].thinkingUpdatedAt).toBeUndefined();
    expect(result[0].thinking).toBe("some thinking");
  });
});
