import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { EvalApplicationPort } from "../../src/application/harness-api.js";
import type { SpawnAgentRequest } from "../../src/agents/process/types.js";
import {
  runChiefPipeline,
  type ChiefProgressEvent,
} from "../../src/eval/chief/pipeline.js";
import { createEvalRun } from "../../src/eval/chief/workspace.js";
import type { MultiAgentTrajectory } from "../../src/eval/trajectory.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) =>
    rm(path, { recursive: true, force: true }),
  ));
});

function trajectory(): MultiAgentTrajectory {
  return {
    session: {
      version: 3,
      metadata: {
        id: "target-session",
        title: "Pipeline",
        createdAt: 1,
        updatedAt: 10,
        modelProvider: "test",
        modelId: "model",
        messageCount: 3,
        projectPath: "/project",
        preview: "",
        hasImages: false,
        imageCount: 0,
        totalActiveMs: 0,
        contentHash: "hash",
      },
      messages: [],
      agentMessages: [],
    },
    actors: [
      {
        agentId: "main-1",
        application: "main",
        role: "main",
        evidenceQuality: "full",
      },
      {
        agentId: "executor-1",
        parentAgentId: "main-1",
        application: "executor",
        role: "subagent",
        evidenceQuality: "full",
        applicationSource: "/project/.dscode/agents/executor.md",
        applicationDigest: "executor-digest",
        state: "completed",
      },
    ],
    steps: [
      {
        stepId: 0,
        agentId: "main-1",
        application: "main",
        role: "main",
        kind: "spawn",
        toolName: "spawn_agent",
        observation: "",
        thought: "delegate",
        action: "spawn executor",
        result: "executor-1",
        timestamp: 1,
        localOrder: 0,
        isError: false,
        evidenceQuality: "full",
      },
      {
        stepId: 1,
        agentId: "executor-1",
        application: "executor",
        role: "subagent",
        parentAgentId: "main-1",
        kind: "tool_call",
        toolName: "write_file",
        observation: "",
        thought: "write",
        action: "write_file",
        result: "bad data",
        timestamp: 2,
        localOrder: 0,
        isError: false,
        evidenceQuality: "full",
      },
      {
        stepId: 2,
        agentId: "main-1",
        application: "main",
        role: "main",
        kind: "response",
        observation: "bad data",
        thought: "accept",
        action: "respond",
        result: "bad answer",
        timestamp: 3,
        localOrder: 1,
        isError: false,
        evidenceQuality: "full",
      },
    ],
    controlEdges: [],
    dataEdges: [],
    evidence: {
      totalActors: 2,
      subagentCount: 1,
      fullTranscripts: 1,
      summaryTranscripts: 0,
      missingTranscripts: 0,
      completeness: "complete",
      affectedAgentIds: [],
    },
  };
}

function outputs(): string[] {
  return [
    JSON.stringify({
      subtasks: [{
        id: "implement",
        name: "Implement",
        stepIds: [0, 1, 2],
        status: "danger",
        summary: "Bad executor output was accepted",
      }],
      agents: [
        {
          subtaskId: "implement",
          agentId: "main-1",
          application: "main",
          role: "main",
          stepIds: [0, 2],
          observation: "result",
          thought: "delegate and accept",
          action: "spawn_agent and respond",
          result: "bad answer",
        },
        {
          subtaskId: "implement",
          agentId: "executor-1",
          application: "executor",
          role: "subagent",
          stepIds: [1],
          observation: "",
          thought: "write",
          action: "write_file",
          result: "bad data",
        },
      ],
      edges: [{
        source: "executor-1",
        target: "main-1",
        type: "data",
        strength: 1,
        evidenceStepIds: [1, 2],
        summary: "Executor output was consumed",
      }],
      dataFlows: [{
        sourceStepId: 1,
        targetStepId: 2,
        sourceAgentId: "executor-1",
        targetAgentId: "main-1",
        dataItem: "bad data",
        correctness: "misused",
      }],
    }),
    JSON.stringify([{
      subtaskId: "implement",
      goal: "Produce a correct result",
      preconditions: ["Validate executor output"],
      keyEvidence: ["Verified output"],
      acceptanceCriteria: ["Correct answer"],
    }]),
    JSON.stringify({
      subtaskCandidates: [{ id: "implement", score: 1, reason: "failed goal" }],
      agentCandidates: [{ id: "executor-1", score: 0.9, reason: "introduced bad data" }],
      stepCandidates: [{ id: "1", score: 0.9, reason: "bad write" }],
      screenedSubtasks: ["implement"],
      screenedAgentIds: ["main-1", "executor-1"],
      screenedStepIds: [0, 1, 2],
    }),
    JSON.stringify({
      mistakeAgentId: "executor-1",
      mistakeApplication: "executor",
      mistakeSubtaskId: "implement",
      mistakeStep: 1,
      granularity: "step",
      confidence: 0.9,
      evidenceQuality: "full",
      reason: "Executor introduced data consumed by Main",
      rootCauseTitle: "Bad executor output",
      rootCauseSeverity: "primary",
      rulesApplied: ["local", "data_flow"],
      recoveryArcs: [],
    }),
    JSON.stringify([{
      id: "validate-executor-output",
      category: "agents_md",
      targetLayer: "Agent Application",
      targetScope: "application",
      targetApplication: "executor",
      abstract: "Validate delegated output before returning it",
      rawDescription: "The executor produced data that Main consumed without validation",
      severity: 0.8,
      suggestion: {
        layer: "executor Application",
        action: "modify",
        proposed: "Require output validation against the delegated goal",
        rationale: "Prevents invalid delegated results from propagating",
      },
    }]),
  ];
}

describe("runChiefPipeline", () => {
  it("runs one Supervisor-backed pipeline for a multi-agent trajectory", async () => {
    const root = await mkdtemp(join(tmpdir(), "dscode-chief-pipeline-"));
    temporaryDirectories.push(root);
    const input = trajectory();
    const run = await createEvalRun(input, "invoking-session", {
      evalRoot: root,
      runId: "pipeline-run",
    });
    const responses = outputs();
    let responseIndex = 0;
    const spawn = vi.fn(async (request: SpawnAgentRequest) => {
      const agentId = `agent-${String(responseIndex + 1).repeat(6)}-worker`;
      request.onSpawn?.(agentId);
      return {
        agentId,
        result: {
          agentId,
          state: "completed" as const,
          output: responses[responseIndex++],
          startedAt: 1,
          endedAt: 2,
        },
      };
    });
    const harness = {
      agents: {
        list: () => [{ role: "main", agentId: "main-current" }],
        spawn,
      },
    } as unknown as EvalApplicationPort;

    const progress: ChiefProgressEvent[] = [];
    const result = await runChiefPipeline({
      trajectory: input,
      harness,
      run,
      onProgress: (event) => progress.push(event),
    });

    expect(spawn.mock.calls.map(([request]) => request.application)).toEqual([
      "chief-graph",
      "chief-oracle",
      "chief-backtrack",
      "chief-attribution",
      "eval-rule-attribution",
    ]);
    expect(spawn.mock.calls.every(([request]) =>
      request.recording === "process-only" && request.parentAgentId === "main-current"
    )).toBe(true);
    expect(result.attribution).toMatchObject({
      mistakeAgentId: "executor-1",
      mistakeApplication: "executor",
      mistakeStep: 1,
      granularity: "step",
    });
    expect(result.causalGraph?.dataFlows[0].path).toContain("executor");
    expect(result.agentStats).toMatchObject({
      totalActors: 2,
      subagents: 1,
      fullTranscripts: 1,
    });
    expect(result.actors?.map((actor) => actor.agentId)).toEqual(["main-1", "executor-1"]);
    expect(result.rules[0]).toMatchObject({
      targetScope: "application",
      targetApplication: "executor",
      targetApplicationSource: "/project/.dscode/agents/executor.md",
      targetApplicationDigest: "executor-digest",
    });
    expect(progress[0]).toMatchObject({
      runId: "pipeline-run",
      targetSessionId: "target-session",
      stage: "prepare",
      status: "done",
      index: 1,
      total: 7,
    });
    expect(progress).toContainEqual(expect.objectContaining({
      stage: "oracle",
      application: "chief-oracle",
      workerAgentId: "agent-222222-worker",
      status: "running",
      message: "chief-oracle (222222) is running",
    }));
    expect(progress.some((event) => event.message.includes("(agent-)"))).toBe(false);
    expect(progress).toContainEqual(expect.objectContaining({
      stage: "attribution",
      application: "chief-attribution",
      status: "done",
      durationMs: expect.any(Number),
    }));
    const manifest = JSON.parse(await readFile(run.manifestPath, "utf8"));
    expect(manifest.stages).toMatchObject({
      graph: { status: "done", application: "chief-graph" },
      oracle: { status: "done", application: "chief-oracle" },
      backtrack: { status: "done", application: "chief-backtrack" },
      attribution: { status: "done", application: "chief-attribution" },
      rules: { status: "done", application: "eval-rule-attribution" },
    });
  });

  it("continues when the optional rule stage fails", async () => {
    const root = await mkdtemp(join(tmpdir(), "dscode-chief-pipeline-"));
    temporaryDirectories.push(root);
    const input = trajectory();
    const run = await createEvalRun(input, "invoking-session", {
      evalRoot: root,
      runId: "optional-failure",
    });
    const responses = [...outputs().slice(0, 4), "invalid", "still invalid"];
    let responseIndex = 0;
    const spawn = vi.fn(async (request: SpawnAgentRequest) => {
      const agentId = `worker-${responseIndex + 1}`;
      request.onSpawn?.(agentId);
      return {
        agentId,
        result: {
          agentId,
          state: "completed" as const,
          output: responses[responseIndex++],
          startedAt: 1,
          endedAt: 2,
        },
      };
    });
    const harness = {
      agents: {
        list: () => [{ role: "main", agentId: "main-current" }],
        spawn,
      },
    } as unknown as EvalApplicationPort;

    const result = await runChiefPipeline({ trajectory: input, harness, run });

    expect(result.rules).toEqual([]);
    const manifest = JSON.parse(await readFile(run.manifestPath, "utf8"));
    expect(manifest.stages.rules).toMatchObject({
      status: "failed",
      application: "eval-rule-attribution",
      retryCount: 1,
    });
  });
});
