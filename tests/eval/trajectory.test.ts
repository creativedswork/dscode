import { describe, expect, it } from "vitest";

import type { SerializedAgentProcess } from "../../src/agents/process/types.js";
import {
  buildMultiAgentTrajectory,
  loadMultiAgentTrajectory,
  type MultiAgentTrajectory,
} from "../../src/eval/trajectory.js";
import type {
  AgentSessionMessage,
  SerializedSession,
} from "../../src/session/types.js";

function session(
  messages: unknown[],
  agentMessages: AgentSessionMessage[] = [],
): SerializedSession {
  return {
    version: agentMessages.length > 0 ? 3 : 1,
    metadata: {
      id: "session-1",
      title: "Evaluate agents",
      createdAt: 100,
      updatedAt: 500,
      modelProvider: "test",
      modelId: "model",
      messageCount: messages.length,
      projectPath: "/project",
      preview: "",
      hasImages: false,
      imageCount: 0,
      totalActiveMs: 0,
      contentHash: "hash",
    },
    messages,
    agentMessages,
  };
}

function summary(
  agentId: string,
  overrides: Partial<AgentSessionMessage> = {},
): AgentSessionMessage {
  return {
    role: "subagent",
    agentId,
    parentAgentId: "main-1",
    application: "explorer",
    state: "completed",
    input: { prompt: `Task for ${agentId}` },
    output: { text: `Output from ${agentId}` },
    createdAt: 105,
    startedAt: 108,
    endedAt: 130,
    ...overrides,
  };
}

function processRecord(
  agentId: string,
  messages: unknown[],
  overrides: Partial<SerializedAgentProcess> = {},
): SerializedAgentProcess {
  return {
    version: 1,
    agentId,
    parentAgentId: "main-1",
    parentSessionId: "session-1",
    application: {
      name: "explorer",
      description: "Explore",
      systemPrompt: "Inspect",
      source: { kind: "project-dscode", path: ".dscode/agents/explorer.md" },
      digest: agentId.padEnd(64, "0"),
      registryGeneration: 1,
    },
    role: "subagent",
    state: "completed",
    attachment: "foreground",
    recording: "session",
    contextMode: "minimal",
    context: {
      agentId,
      cwd: "/project",
      parentSessionId: "session-1",
      depth: 1,
      attachment: "foreground",
      allowedTools: [],
      deniedTools: ["spawn_agent"],
    },
    createdAt: 105,
    startedAt: 108,
    endedAt: 130,
    exit: {
      agentId,
      state: "completed",
      output: "done",
      startedAt: 108,
      endedAt: 130,
    },
    runtimeSnapshot: { messages },
    ...overrides,
  };
}

function mainMessages() {
  return [
    { role: "user", content: "Inspect the repository", timestamp: 100 },
    {
      role: "assistant",
      timestamp: 101,
      content: [{
        type: "toolCall",
        id: "spawn-1",
        name: "spawn_agent",
        arguments: { application: "explorer" },
      }],
    },
    {
      role: "toolResult",
      toolCallId: "spawn-1",
      content: "Agent agent-x completed",
      timestamp: 131,
    },
    {
      role: "assistant",
      content: [{ type: "text", text: "Use the explorer result" }],
      timestamp: 150,
    },
  ];
}

function childMessages(tool = "read_file") {
  return [
    { role: "user", content: "Inspect", timestamp: 108 },
    {
      role: "assistant",
      timestamp: 110,
      content: [
        { type: "thinking", thinking: "Need evidence" },
        {
          type: "toolCall",
          id: "tool-1",
          name: tool,
          arguments: { path: "src/index.ts" },
        },
      ],
    },
    {
      role: "toolResult",
      toolCallId: "tool-1",
      content: "export const value = 1",
      timestamp: 115,
    },
    {
      role: "assistant",
      content: [{ type: "text", text: "Found the implementation" }],
      timestamp: 120,
    },
  ];
}

function actorSteps(trajectory: MultiAgentTrajectory, agentId: string) {
  return trajectory.steps.filter((step) => step.agentId === agentId);
}

describe("MultiAgentTrajectory", () => {
  it("keeps Main as the actor and tools as actions", () => {
    const data = session([
      { role: "user", content: "Update the file", timestamp: 100 },
      {
        role: "assistant",
        timestamp: 110,
        content: [{
          type: "toolCall",
          id: "write-1",
          name: "write_file",
          arguments: { path: "src/a.ts", content: "x" },
        }],
      },
      {
        role: "toolResult",
        toolCallId: "write-1",
        content: "ok",
        timestamp: 115,
      },
    ]);

    const trajectory = buildMultiAgentTrajectory(data);

    expect(trajectory.actors).toHaveLength(1);
    expect(trajectory.actors[0]).toMatchObject({
      role: "main",
      application: "main",
      evidenceQuality: "full",
    });
    expect(trajectory.steps[0]).toMatchObject({
      agentId: trajectory.actors[0].agentId,
      application: "main",
      toolName: "write_file",
      kind: "tool_call",
    });
    expect(trajectory.actors.some((actor) => actor.application === "write_file")).toBe(false);
    expect(trajectory.evidence).toMatchObject({
      subagentCount: 0,
      completeness: "complete",
    });
  });

  it("loads full SubAgent transcripts with real process identity and edges", () => {
    const data = session(mainMessages(), [summary("agent-x")]);
    const persisted = new Map([
      ["agent-x", processRecord("agent-x", childMessages())],
      ["diagnostic-z", processRecord("diagnostic-z", childMessages("grep"))],
    ]);

    const trajectory = buildMultiAgentTrajectory(data, persisted);

    expect(trajectory.actors.map((actor) => actor.agentId)).toEqual(["main-1", "agent-x"]);
    expect(trajectory.evidence).toMatchObject({
      totalActors: 2,
      fullTranscripts: 1,
      summaryTranscripts: 0,
      missingTranscripts: 0,
      completeness: "complete",
    });
    expect(actorSteps(trajectory, "agent-x")).toEqual(expect.arrayContaining([
      expect.objectContaining({
        application: "explorer",
        toolName: "read_file",
        kind: "tool_call",
        evidenceQuality: "full",
      }),
      expect.objectContaining({ kind: "exit" }),
    ]));
    expect(trajectory.controlEdges).toEqual(expect.arrayContaining([
      expect.objectContaining({
        fromAgentId: "main-1",
        toAgentId: "agent-x",
        label: "spawn",
      }),
      expect.objectContaining({
        fromAgentId: "agent-x",
        toAgentId: "main-1",
        label: "result returned",
      }),
    ]));
  });

  it("distinguishes concurrent instances of one Application deterministically", () => {
    const summaries = [
      summary("agent-a", { createdAt: 105, startedAt: 108, endedAt: 140 }),
      summary("agent-b", { createdAt: 105, startedAt: 108, endedAt: 135 }),
    ];
    const records = new Map([
      ["agent-a", processRecord("agent-a", childMessages("read_file"), { endedAt: 140 })],
      ["agent-b", processRecord("agent-b", childMessages("grep"), { endedAt: 135 })],
    ]);
    const data = session(mainMessages(), summaries);

    const first = buildMultiAgentTrajectory(data, records);
    const second = buildMultiAgentTrajectory(data, records);

    expect(first.steps).toEqual(second.steps);
    expect(first.actors.filter((actor) => actor.application === "explorer"))
      .toHaveLength(2);
    expect(actorSteps(first, "agent-a").map((step) => step.localOrder))
      .toEqual([...actorSteps(first, "agent-a").map((step) => step.localOrder)].sort((a, b) => a - b));
    expect(actorSteps(first, "agent-b").map((step) => step.localOrder))
      .toEqual([...actorSteps(first, "agent-b").map((step) => step.localOrder)].sort((a, b) => a - b));
  });

  it("uses summary evidence without inventing internal tool steps", () => {
    const data = session([], [summary("agent-summary", {
      input: { prompt: "Review the result" },
      output: { text: "Looks correct" },
    })]);

    const trajectory = buildMultiAgentTrajectory(data);

    expect(trajectory.actors.at(-1)).toMatchObject({
      agentId: "agent-summary",
      evidenceQuality: "summary",
    });
    const steps = actorSteps(trajectory, "agent-summary");
    expect(steps).toEqual([
      expect.objectContaining({
        kind: "summary",
        thought: "",
        evidenceQuality: "summary",
      }),
    ]);
    expect(steps[0]).not.toHaveProperty("toolName");
    expect(trajectory.evidence).toMatchObject({
      summaryTranscripts: 1,
      completeness: "partial",
      affectedAgentIds: ["agent-summary"],
    });
  });

  it("retains a missing Actor without fabricating a Step", () => {
    const data = session([], [summary("agent-missing", {
      input: { prompt: "" },
      output: undefined,
    })]);

    const trajectory = buildMultiAgentTrajectory(data);

    expect(trajectory.actors.at(-1)).toMatchObject({
      agentId: "agent-missing",
      evidenceQuality: "missing",
    });
    expect(actorSteps(trajectory, "agent-missing")).toEqual([]);
    expect(trajectory.evidence).toMatchObject({
      missingTranscripts: 1,
      completeness: "partial",
    });
  });

  it("uses only frozen Session membership and does not mutate inputs", () => {
    const member = summary("agent-member");
    const data = session(mainMessages(), [member]);
    const before = JSON.stringify(data);
    const persisted = new Map([
      ["agent-member", processRecord("agent-member", childMessages())],
      ["agent-unrelated", processRecord("agent-unrelated", childMessages())],
    ]);

    const trajectory = buildMultiAgentTrajectory(data, persisted);

    expect(trajectory.actors.some((actor) => actor.agentId === "agent-member")).toBe(true);
    expect(trajectory.actors.some((actor) => actor.agentId === "agent-unrelated")).toBe(false);
    expect(JSON.stringify(data)).toBe(before);
  });

  it("loads a historical target by explicit member IDs without rebinding Main", async () => {
    const data = session(mainMessages(), [summary("agent-member")]);
    let currentSessionId = "session-b";
    const persisted = processRecord("agent-member", childMessages());
    const supervisor = {
      async loadPersisted(agentIds: readonly string[]) {
        expect(agentIds).toEqual(["agent-member"]);
        return {
          found: new Map([["agent-member", persisted]]),
          missing: [],
        };
      },
    };

    const trajectory = await loadMultiAgentTrajectory(data, supervisor as any);

    expect(trajectory.session.metadata.id).toBe("session-1");
    expect(currentSessionId).toBe("session-b");
    expect(trajectory.actors.map((actor) => actor.agentId))
      .toEqual(["main-1", "agent-member"]);
    currentSessionId = "session-b";
  });
});
