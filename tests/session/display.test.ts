import { describe, expect, it } from "vitest";

import { rebuildDisplayMessages } from "../../src/session/display.js";
import type { AgentSessionMessage } from "../../src/session/types.js";

function agentMessage(
  overrides: Partial<AgentSessionMessage> = {},
): AgentSessionMessage {
  return {
    role: "subagent",
    agentId: "agent-1",
    parentAgentId: "main-1",
    application: "general",
    state: "completed",
    input: { prompt: "inspect the implementation" },
    output: { text: "Found two issues" },
    createdAt: 200,
    startedAt: 210,
    endedAt: 500,
    ...overrides,
  };
}

describe("rebuildDisplayMessages — Agent Activity", () => {
  it("places a linked activity after its messageIndex and preserves the user prompt", () => {
    const result = rebuildDisplayMessages(
      [
        { role: "user", content: "generated image description", createdAt: 100 },
        { role: "assistant", content: "Answer", createdAt: 300 },
      ],
      [agentMessage({
        application: "vision",
        messageIndex: 0,
        input: {
          prompt: "inspect the implementation",
          attachments: [{
            type: "image",
            data: {
              type: "image_ref",
              hash: "missing-cache-entry",
              mimeType: "image/png",
            },
          }],
        },
      })],
      "session-1",
    );

    expect(result.map((message) => message.role)).toEqual([
      "user",
      "agent",
      "assistant",
    ]);
    expect(result[0].content).toBe("inspect the implementation");
    expect(result[1].agentActivity).toMatchObject({
      agentId: "agent-1",
      parentSessionId: "session-1",
      state: "completed",
      output: "Found two issues",
    });
  });

  it("merges unlinked activities by timestamp", () => {
    const result = rebuildDisplayMessages(
      [
        { role: "user", content: "Before", createdAt: 100 },
        { role: "assistant", content: "After", createdAt: 300 },
      ],
      [agentMessage({ createdAt: 200 })],
      "session-1",
    );

    expect(result.map((message) => message.role)).toEqual([
      "user",
      "agent",
      "assistant",
    ]);
  });

  it("recovers a delegated role from legacy spawn_agent messages", () => {
    const result = rebuildDisplayMessages(
      [
        {
          role: "assistant",
          createdAt: 100,
          content: [{
            type: "toolCall",
            id: "call-spawn",
            name: "spawn_agent",
            arguments: {
              application: "general",
              description: "Researcher: verify paper claims",
              input: { prompt: "verify claims" },
            },
          }],
        },
        {
          role: "toolResult",
          toolCallId: "call-spawn",
          toolName: "spawn_agent",
          details: { agentId: "agent-1" },
          content: [{ type: "text", text: "Started background Agent agent-1" }],
          createdAt: 110,
        },
      ],
      [agentMessage({ createdAt: 120 })],
      "session-1",
    );

    const activity = result.find((message) => message.role === "agent")
      ?.agentActivity;
    expect(activity?.label).toBe("Researcher");
    expect(activity?.application).toBe("general");
  });

  it("keeps internal Agent notifications out of restored user messages", () => {
    const result = rebuildDisplayMessages(
      [
        {
          role: "user",
          content: [{
            type: "text",
            text: "<agent_notifications>\nResearch complete\n</agent_notifications>",
          }],
          createdAt: 100,
        },
        {
          role: "assistant",
          content: [{ type: "text", text: "Proceeding to content strategy." }],
          createdAt: 200,
        },
      ],
      [],
      "session-1",
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      role: "assistant",
      content: "Proceeding to content strategy.",
    });
  });

  it("does not rewrite a linked Main message for a non-image Agent", () => {
    const result = rebuildDisplayMessages(
      [{ role: "user", content: "Main prompt", createdAt: 100 }],
      [agentMessage({
        messageIndex: 0,
        input: { prompt: "Child prompt" },
      })],
      "session-1",
    );

    expect(result[0].content).toBe("Main prompt");
    expect(result[1].agentActivity?.input).toBe("Child prompt");
  });

  it("appends activities when no comparable timestamps exist", () => {
    const result = rebuildDisplayMessages(
      [
        { role: "user", content: "Before" },
        { role: "assistant", content: "After" },
      ],
      [agentMessage()],
      "session-1",
    );

    expect(result.map((message) => message.role)).toEqual([
      "user",
      "assistant",
      "agent",
    ]);
  });

  it("restores failed activity error data", () => {
    const result = rebuildDisplayMessages(
      [{ role: "user", content: "Run" }],
      [agentMessage({
        state: "failed",
        output: { error: "Timed out" },
      })],
      "session-1",
    );

    expect(result.at(-1)?.agentActivity).toMatchObject({
      state: "failed",
      error: "Timed out",
    });
  });

  it("projects migrated legacy Vision records through the generic Agent model", () => {
    const result = rebuildDisplayMessages(
      [{ role: "user", content: "description" }],
      [agentMessage({
        application: "vision",
        input: { prompt: "describe image", attachments: [] },
        messageIndex: 0,
      })],
      "session-legacy",
    );

    expect(result[1]).toMatchObject({
      role: "agent",
      agentActivity: {
        label: "Vision",
        application: "vision",
        input: "describe image",
        parentSessionId: "session-legacy",
      },
    });
  });

  it("preserves thinking and matched tool results while adding activity", () => {
    const result = rebuildDisplayMessages(
      [
        {
          role: "assistant",
          createdAt: 100,
          content: [
            { type: "thinking", thinking: "Need inspect" },
            {
              type: "toolCall",
              id: "call-1",
              name: "read_file",
              arguments: { path: "src/a.ts" },
            },
          ],
        },
        {
          role: "toolResult",
          toolCallId: "call-1",
          content: [{ type: "text", text: "file contents" }],
        },
      ],
      [agentMessage({ createdAt: 300 })],
      "session-1",
    );

    expect(result[0].thinking).toBe("Need inspect");
    expect(result[0].tools).toHaveLength(1);
    expect(result[0].tools?.[0]).toMatchObject({
      name: "read_file",
      isError: false,
    });
    expect(result[0].tools?.[0].result).toContain("file contents");
    expect(result[1].role).toBe("agent");
  });
});
