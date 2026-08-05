import { describe, expect, it } from "vitest";

import { computeStats } from "../../src/eval/stats.js";
import type { MultiAgentTrajectory } from "../../src/eval/trajectory.js";

function trajectory(): MultiAgentTrajectory {
  const actors: MultiAgentTrajectory["actors"] = [
    {
      agentId: "main-1",
      application: "main",
      role: "main",
      evidenceQuality: "full",
    },
    {
      agentId: "agent-a",
      parentAgentId: "main-1",
      application: "explorer",
      role: "subagent",
      evidenceQuality: "full",
      state: "completed",
    },
    {
      agentId: "agent-b",
      parentAgentId: "main-1",
      application: "reviewer",
      role: "subagent",
      evidenceQuality: "full",
      state: "failed",
    },
    {
      agentId: "agent-summary",
      parentAgentId: "main-1",
      application: "vision",
      role: "subagent",
      evidenceQuality: "summary",
      state: "completed",
    },
  ];
  const owners = [
    ...Array(10).fill(actors[0]),
    ...Array(4).fill(actors[1]),
    ...Array(6).fill(actors[2]),
  ];
  const steps = owners.map((actor, stepId) => ({
    stepId,
    agentId: actor.agentId,
    application: actor.application,
    role: actor.role,
    parentAgentId: actor.parentAgentId,
    kind: "tool_call" as const,
    toolName: stepId === 2 ? "take_screenshot" : "read_file",
    observation: "",
    thought: "",
    action: "read",
    result: "ok",
    timestamp: stepId,
    localOrder: stepId,
    isError: [0, 10, 14].includes(stepId),
    evidenceQuality: "full" as const,
  }));
  return {
    session: {
      version: 3,
      metadata: {
        id: "session-1",
        title: "Stats",
        createdAt: 0,
        updatedAt: 120_000,
        modelProvider: "test",
        modelId: "model",
        messageCount: 12,
        projectPath: "/project",
        preview: "",
        hasImages: false,
        imageCount: 0,
        totalActiveMs: 100,
        contentHash: "hash",
      },
      messages: [],
      agentMessages: [],
    },
    actors,
    steps,
    controlEdges: [],
    dataEdges: [],
    evidence: {
      totalActors: 4,
      subagentCount: 3,
      fullTranscripts: 2,
      summaryTranscripts: 1,
      missingTranscripts: 0,
      completeness: "partial",
      affectedAgentIds: ["agent-summary"],
    },
  };
}

describe("computeStats", () => {
  it("counts Main and full SubAgent tools exactly once", () => {
    const result = computeStats(trajectory());

    expect(result.metadata).toMatchObject({
      sessionId: "session-1",
      totalMessages: 12,
      duration: "2m",
    });
    expect(result.stats).toEqual({
      toolCalls: 20,
      toolErrors: 3,
      errorRate: "15.0%",
      screenshotsTaken: 1,
      userComplaints: 0,
    });
    expect(result.agentStats).toEqual({
      totalActors: 4,
      subagents: 3,
      applications: 4,
      completed: 2,
      failed: 1,
      terminated: 0,
      killed: 0,
      processSuccessRate: "66.7%",
      fullTranscripts: 2,
      summaryTranscripts: 1,
      missingTranscripts: 0,
    });
  });

  it("does not invent tool calls for summary-only actors", () => {
    const input = trajectory();
    input.steps = input.steps.filter((step) => step.agentId === "main-1");

    const result = computeStats(input);

    expect(result.stats.toolCalls).toBe(10);
    expect(result.agentStats.summaryTranscripts).toBe(1);
  });

  it("is deterministic and handles a Main-only trajectory", () => {
    const input = trajectory();
    input.actors = [input.actors[0]];
    input.steps = [];
    input.evidence = {
      totalActors: 1,
      subagentCount: 0,
      fullTranscripts: 0,
      summaryTranscripts: 0,
      missingTranscripts: 0,
      completeness: "complete",
      affectedAgentIds: [],
    };

    const first = computeStats(input);
    const second = computeStats(input);

    expect(first).toEqual(second);
    expect(first.stats.errorRate).toBe("0.0%");
    expect(first.agentStats).toMatchObject({
      totalActors: 1,
      subagents: 0,
      processSuccessRate: "100.0%",
    });
  });
});
