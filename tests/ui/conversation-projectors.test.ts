import { describe, expect, it } from "vitest";

import type { SerializedAgentProcess } from "../../src/agents/process/types.js";
import { INTERNAL_PLAN_EXECUTION_VISIBILITY } from "../../src/kernel/message-visibility.js";
import { AgentActivityProjector } from "../../src/ui/shared/agent-activity.js";
import { harnessEventToConversationEvent } from "../../src/ui/shared/harness-conversation-adapter.js";
import { rebuildDisplayMessages } from "../../src/ui/shared/session-projector.js";

describe("conversation projectors", () => {
  it("keeps internal routing and Agent tools out of live and replayed Chat", () => {
    expect(harnessEventToConversationEvent({
      type: "tool:start",
      toolCallId: "call-route",
      name: "submit_plan_route_assessment",
      args: {},
    })).toBeUndefined();
    expect(harnessEventToConversationEvent({
      type: "tool:end",
      toolCallId: "call-agents",
      name: "list_agents",
      result: { content: [{ type: "text", text: "[]" }] },
      isError: false,
    })).toBeUndefined();
    expect(harnessEventToConversationEvent({
      type: "tool:start",
      toolCallId: "call-plan-item",
      name: "plan_start_item",
      args: { itemId: "item-1" },
    })).toBeUndefined();
    expect(harnessEventToConversationEvent({
      type: "tool:end",
      toolCallId: "call-verify-item",
      name: "verify_item",
      result: { content: [{ type: "text", text: "Verification command was rejected" }] },
      isError: true,
    })).toBeUndefined();

    const replay = rebuildDisplayMessages([
      {
        role: "assistant",
        content: [
          {
            type: "toolCall",
            id: "call-agents",
            name: "list_agents",
            arguments: {},
          },
          {
            type: "toolCall",
            id: "call-plan-item",
            name: "plan_start_item",
            arguments: { itemId: "item-1" },
          },
          {
            type: "toolCall",
            id: "call-verify-item",
            name: "verify_item",
            arguments: { itemId: "item-1" },
          },
          {
            type: "toolCall",
            id: "call-read",
            name: "read_file",
            arguments: { path: "README.md" },
          },
        ],
      },
      {
        role: "toolResult",
        toolCallId: "call-agents",
        content: [{ type: "text", text: "[]" }],
      },
      {
        role: "toolResult",
        toolCallId: "call-plan-item",
        content: [{ type: "text", text: "{\"status\":\"executing\"}" }],
      },
      {
        role: "toolResult",
        toolCallId: "call-verify-item",
        content: [{ type: "text", text: "Verification command was rejected" }],
        isError: true,
      },
      {
        role: "toolResult",
        toolCallId: "call-read",
        content: [{ type: "text", text: "contents" }],
      },
    ], [], "session-1");

    expect(replay).toHaveLength(1);
    expect(replay[0].tools).toEqual([
      expect.objectContaining({ name: "read_file" }),
    ]);
  });

  it("hides internal Plan narration while preserving tools and final output", () => {
    const replay = rebuildDisplayMessages([
      {
        role: "user",
        content: "<plan_execution>\nExecute the approved Plan.\n</plan_execution>",
      },
      {
        role: "assistant",
        dscodeVisibility: INTERNAL_PLAN_EXECUTION_VISIBILITY,
        content: [
          { type: "thinking", thinking: "Private execution reasoning" },
          { type: "text", text: "Verbose self-correction narration" },
          {
            type: "toolCall",
            id: "call-read",
            name: "read_file",
            arguments: { path: "README.md" },
          },
        ],
      },
      {
        role: "toolResult",
        toolCallId: "call-read",
        content: [{ type: "text", text: "contents" }],
      },
      {
        role: "assistant",
        content: [{ type: "text", text: "Implementation complete." }],
      },
    ], [], "session-1");

    expect(replay).toHaveLength(2);
    expect(replay[0]).toMatchObject({
      role: "assistant",
      content: "",
      thinking: undefined,
      tools: [expect.objectContaining({ name: "read_file" })],
    });
    expect(replay[1]).toMatchObject({
      role: "assistant",
      content: "Implementation complete.",
    });
  });

  it("hides legacy untagged Plan narration around execution tools", () => {
    const replay = rebuildDisplayMessages([
      {
        role: "user",
        content: "<plan_execution>\nExecute the approved Plan.\n</plan_execution>",
      },
      {
        role: "assistant",
        content: [{ type: "text", text: "Premature completion." }],
      },
      {
        role: "user",
        content: "<plan_execution>\nThe Plan is incomplete. Continue.\n</plan_execution>",
      },
      {
        role: "assistant",
        content: [
          { type: "text", text: "I need to inspect my edit." },
          {
            type: "toolCall",
            id: "call-read",
            name: "read_file",
            arguments: { path: "README.md" },
          },
        ],
      },
      {
        role: "toolResult",
        toolCallId: "call-read",
        content: [{ type: "text", text: "contents" }],
      },
      {
        role: "assistant",
        content: [{ type: "text", text: "Implementation complete." }],
      },
    ], [], "session-1");

    expect(replay).toHaveLength(2);
    expect(replay[0]).toMatchObject({
      content: "",
      tools: [expect.objectContaining({ name: "read_file" })],
    });
    expect(replay[1].content).toBe("Implementation complete.");
  });

  it("hides retryable Plan command corrections during replay", () => {
    const invalidCommand =
      "Plan side effect blocked: invalid_command: Run each command separately and exactly as stored: npm test, npm run typecheck";
    const replay = rebuildDisplayMessages([
      {
        role: "assistant",
        dscodeVisibility: INTERNAL_PLAN_EXECUTION_VISIBILITY,
        content: [{
          type: "toolCall",
          id: "call-retry",
          name: "bash",
          arguments: { command: "npm test && npm run typecheck" },
        }, {
          type: "toolCall",
          id: "call-scope",
          name: "bash",
          arguments: { command: "curl example.com" },
        }, {
          type: "toolCall",
          id: "call-exact",
          name: "bash",
          arguments: { command: "npm test" },
        }],
      },
      {
        role: "toolResult",
        toolCallId: "call-retry",
        content: [{ type: "text", text: invalidCommand }],
        isError: true,
      },
      {
        role: "toolResult",
        toolCallId: "call-scope",
        content: [{
          type: "text",
          text: "Plan side effect blocked: scope_mismatch: Resource is outside Plan approval",
        }],
        isError: true,
      },
      {
        role: "toolResult",
        toolCallId: "call-exact",
        content: [{ type: "text", text: "passed" }],
        isError: false,
      },
    ], [], "session-1");

    expect(replay).toHaveLength(1);
    expect(replay[0].tools).toEqual([
      expect.objectContaining({
        toolCallId: "call-scope",
        isError: true,
      }),
      expect.objectContaining({
        toolCallId: "call-exact",
        resultDetail: expect.objectContaining({ text: "passed" }),
        isError: false,
      }),
    ]);
  });

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
