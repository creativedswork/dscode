import { describe, expect, it, vi } from "vitest";
import { conversationReducer } from "../../src/ui/shared/reducer.js";
import type { UIMessage, ServerEvent } from "../../src/ui/shared/types.js";

const runningActivity = {
  agentId: "agent-1",
  parentAgentId: "main-1",
  parentSessionId: "session-1",
  application: "general",
  attachment: "background" as const,
  state: "running" as const,
  input: "inspect the implementation",
  createdAt: 1700000000000,
  startedAt: 1700000000100,
};

describe("conversationReducer — Agent Activity", () => {
  it("appends a new activity on spawn", () => {
    const previous: UIMessage[] = [{
      id: "user-1",
      role: "user",
      content: "delegate",
    }];

    const result = conversationReducer(previous, {
      type: "agent_activity",
      activity: runningActivity,
    });

    expect(result).toHaveLength(2);
    expect(result[1]).toMatchObject({
      id: "agent-agent-1",
      role: "agent",
      agentActivity: runningActivity,
    });
    expect(result[0]).toBe(previous[0]);
  });

  it("updates progress by agentId without mutating prior state", () => {
    const initial = conversationReducer([], {
      type: "agent_activity",
      activity: runningActivity,
    });
    const progress = {
      phase: "search",
      current: 2,
      total: 4,
      message: "Reading files",
    };

    const result = conversationReducer(initial, {
      type: "agent_activity",
      activity: { ...runningActivity, progress },
    });

    expect(result).not.toBe(initial);
    expect(result[0]).not.toBe(initial[0]);
    expect(initial[0].agentActivity?.progress).toBeUndefined();
    expect(result[0].agentActivity?.progress).toEqual(progress);
  });

  it("updates an existing activity to a terminal state", () => {
    const initial = conversationReducer([], {
      type: "agent_activity",
      activity: runningActivity,
    });
    const completed = {
      ...runningActivity,
      state: "completed" as const,
      output: "Found two issues",
      endedAt: 1700000012000,
    };

    const result = conversationReducer(initial, {
      type: "agent_activity",
      activity: completed,
    });

    expect(result).toHaveLength(1);
    expect(result[0].agentActivity).toEqual(completed);
  });

  it("does not duplicate repeated terminal snapshots", () => {
    const completed = {
      ...runningActivity,
      state: "completed" as const,
      output: "Done",
      endedAt: 1700000012000,
    };
    const first = conversationReducer([], {
      type: "agent_activity",
      activity: completed,
    });
    const second = conversationReducer(first, {
      type: "agent_activity",
      activity: completed,
    });

    expect(second).toHaveLength(1);
    expect(second[0].agentActivity).toEqual(completed);
  });

  it("restores agent-role messages from ready", () => {
    const result = conversationReducer([], {
      type: "ready",
      model: "test-model",
      config: {} as any,
      messages: [{
        role: "agent",
        content: "",
        agentActivity: {
          ...runningActivity,
          state: "failed",
          error: "Timed out",
          endedAt: 1700000012000,
        },
      }],
    });

    expect(result).toHaveLength(1);
    expect(result[0].role).toBe("agent");
    expect(result[0].id).toBe("agent-agent-1");
    expect(result[0].agentActivity).toMatchObject({
      state: "failed",
      error: "Timed out",
    });
  });

  it("clears activities with the rest of the conversation", () => {
    const initial = conversationReducer([], {
      type: "agent_activity",
      activity: runningActivity,
    });

    expect(conversationReducer(initial, { type: "clear_conversation" })).toEqual([]);
  });
});

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
