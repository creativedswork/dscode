import { describe, expect, it } from "vitest";

import type { SerializedAgentProcess } from "../../src/agents/process/types.js";
import { AgentActivityProjector } from "../../src/ui/shared/agent-activity.js";
import { harnessEventToConversationEvent } from "../../src/ui/shared/harness-conversation-adapter.js";
import { rebuildDisplayMessages } from "../../src/ui/shared/session-projector.js";

describe("conversation projectors", () => {
  it("projects live and replayed Tool results with the same stable identity", () => {
    const result = { content: [{ type: "text", text: "file contents" }] };
    const live = harnessEventToConversationEvent({
      type: "tool:end",
      toolCallId: "call-read",
      name: "read_file",
      result,
      isError: false,
    }, {
      sessionId: "session-1",
      now: () => 1000,
    });
    const replay = rebuildDisplayMessages([
      {
        role: "assistant",
        content: [{
          type: "toolCall",
          id: "call-read",
          name: "read_file",
          arguments: { path: "README.md" },
        }],
      },
      {
        role: "toolResult",
        toolCallId: "call-read",
        content: result.content,
        isError: false,
      },
    ], [], "session-1");

    expect(live).toMatchObject({
      type: "tool_end",
      toolCallId: "call-read",
      resultDetail: {
        text: "file contents",
      },
    });
    expect(replay[0].tools?.[0]).toMatchObject({
      toolCallId: "call-read",
      resultDetail: {
        text: "file contents",
      },
    });
    expect(replay[0].tools?.[0].resultDetail?.summary).toBe(
      live?.type === "tool_end" ? live.resultDetail?.summary : undefined,
    );
    expect(replay[0].tools?.[0].resultDetail?.ref).toEqual(
      live?.type === "tool_end" ? live.resultDetail?.ref : undefined,
    );
  });

  it("preserves Agent identity across live activity and Session replay", () => {
    const process = {
      agentId: "agent-stable",
      role: "subagent",
      state: "running",
      recording: "session",
      application: { name: "general" },
      description: "Researcher: inspect behavior",
      attachment: "background",
      parentAgentId: "main",
      parentSessionId: "session-1",
      createdAt: 1000,
      runtimeSnapshot: {
        messages: [{ role: "user", content: "inspect behavior" }],
      },
    } as SerializedAgentProcess;
    let live;
    const projector = new AgentActivityProjector(
      { get: () => process },
      () => "session-1",
      (activity) => {
        live = activity;
      },
    );
    projector.handle({
      type: "agent:spawned",
      agentId: process.agentId,
      parentAgentId: process.parentAgentId,
      application: "general",
      description: process.description,
      attachment: "background",
      input: "inspect behavior",
    });
    const replay = rebuildDisplayMessages([], [{
      role: "subagent",
      agentId: process.agentId,
      parentAgentId: process.parentAgentId,
      application: "general",
      description: process.description,
      attachment: "background",
      state: "completed",
      input: { prompt: "inspect behavior" },
      output: { text: "done" },
      createdAt: 1000,
      endedAt: 2000,
    }], "session-1");

    expect(live).toMatchObject({
      agentId: "agent-stable",
      executionId: "agent-stable",
      parentSessionId: "session-1",
      label: "Researcher",
    });
    expect(replay[0].agentActivity).toMatchObject({
      agentId: "agent-stable",
      executionId: "agent-stable",
      parentSessionId: "session-1",
      label: "Researcher",
    });
  });

  it("is deterministic and does not mutate persisted snapshots", () => {
    const messages = [{
      role: "assistant",
      content: [{
        type: "toolCall",
        id: "call-1",
        name: "bash",
        arguments: { command: "pwd" },
      }],
    }, {
      role: "toolResult",
      toolCallId: "call-1",
      content: [{ type: "text", text: "/workspace" }],
    }];
    const before = structuredClone(messages);

    const first = rebuildDisplayMessages(messages, [], "session-1");
    const second = rebuildDisplayMessages(messages, [], "session-1");

    expect(second).toEqual(first);
    expect(messages).toEqual(before);
  });

  it("provides one semantic live projection for TUI and Web adapters", () => {
    const event = {
      type: "tool:end" as const,
      toolCallId: "call-1",
      name: "bash",
      result: "ok",
      isError: false,
    };
    const context = { sessionId: "session-1", now: () => 1234 };

    const tuiProjection = harnessEventToConversationEvent(event, context);
    const webProjection = harnessEventToConversationEvent(event, context);

    expect(webProjection).toEqual(tuiProjection);
  });
});
