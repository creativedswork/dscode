import {
  access,
  mkdtemp,
  readFile,
  readdir,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  cleanupEvalRuns,
  createEvalRun,
  finishEvalRun,
  updateRunStage,
  writeStageOutput,
} from "../../src/eval/chief/workspace.js";
import type { MultiAgentTrajectory } from "../../src/eval/trajectory.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) =>
    rm(path, { recursive: true, force: true }),
  ));
});

function trajectory(stepCount = 340): MultiAgentTrajectory {
  const actors: MultiAgentTrajectory["actors"] = [
    {
      agentId: "main-1",
      application: "main",
      role: "main",
      evidenceQuality: "full",
      createdAt: 1,
      endedAt: 500,
    },
    {
      agentId: "agent-1",
      parentAgentId: "main-1",
      application: "explorer",
      role: "subagent",
      evidenceQuality: "full",
      state: "completed",
      createdAt: 10,
      endedAt: 400,
    },
  ];
  const steps = Array.from({ length: stepCount }, (_, stepId) => {
    const actor = actors[stepId % 2];
    return {
      stepId,
      agentId: actor.agentId,
      application: actor.application,
      role: actor.role,
      parentAgentId: actor.parentAgentId,
      kind: "tool_call" as const,
      toolName: "read_file",
      observation: "",
      thought: "",
      action: `read_file(${stepId})`,
      result: `result-${stepId}`,
      timestamp: stepId + 1,
      localOrder: Math.floor(stepId / 2),
      isError: false,
      evidenceQuality: "full" as const,
    };
  });
  return {
    session: {
      version: 3,
      metadata: {
        id: "00MQCGO6-full-session",
        title: "Test",
        createdAt: 1,
        updatedAt: 500,
        modelProvider: "test",
        modelId: "model",
        messageCount: 10,
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
    actors,
    steps,
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

describe("CHIEF eval workspace", () => {
  it("creates isolated runs with bounded chunks and actor indexes", async () => {
    const root = await mkdtemp(join(tmpdir(), "dscode-chief-workspace-"));
    temporaryDirectories.push(root);

    const run = await createEvalRun(trajectory(), "session-invoking", {
      evalRoot: root,
      runId: "run-a",
      now: 100,
    });

    expect(run.runRoot).toContain(join("00MQCGO6", "runs", "run-a"));
    const names = await readdir(run.libraryDir);
    expect(names).toEqual(expect.arrayContaining([
      "session.json",
      "actors.json",
      "topology.json",
      "actor-index.json",
      "steps-0000-0199.json",
      "steps-0200-0339.json",
    ]));
    const chunks = await Promise.all(run.manifest.chunks.map(async (name) =>
      JSON.parse(await readFile(join(run.libraryDir, name), "utf8")),
    ));
    expect(chunks.every((chunk) => chunk.length <= 200)).toBe(true);
    expect(chunks.flat().map((step) => step.stepId))
      .toEqual(Array.from({ length: 340 }, (_, index) => index));
    expect(run.manifest.actorIndex["agent-1"].stepIds).toHaveLength(170);
    expect(run.manifest.evidence.completeness).toBe("complete");
  });

  it("does not overwrite repeated target runs and writes stage output atomically", async () => {
    const root = await mkdtemp(join(tmpdir(), "dscode-chief-workspace-"));
    temporaryDirectories.push(root);
    const first = await createEvalRun(trajectory(2), "session-b", {
      evalRoot: root,
      runId: "run-a",
      now: 100,
      retain: 20,
    });
    const second = await createEvalRun(trajectory(2), "session-b", {
      evalRoot: root,
      runId: "run-b",
      now: 200,
      retain: 20,
    });

    expect(first.runRoot).not.toBe(second.runRoot);
    await writeStageOutput(second, "graph", { ok: true });
    expect(JSON.parse(await readFile(join(second.outputDir, "graph.json"), "utf8")))
      .toEqual({ ok: true });
    expect((await readdir(second.outputDir)).some((name) => name.endsWith(".tmp")))
      .toBe(false);
  });

  it("records failed stages and final run status", async () => {
    const root = await mkdtemp(join(tmpdir(), "dscode-chief-workspace-"));
    temporaryDirectories.push(root);
    const run = await createEvalRun(trajectory(1), "session-b", {
      evalRoot: root,
      runId: "run-failed",
      now: 100,
    });

    await updateRunStage(run, "attribution", {
      status: "failed",
      application: "chief-attribution",
      workerAgentId: "agent-worker",
      retryCount: 1,
      error: "invalid actor",
    });
    await finishEvalRun(run, "failed");

    const manifest = JSON.parse(await readFile(run.manifestPath, "utf8"));
    expect(manifest).toMatchObject({
      status: "failed",
      currentStage: "attribution",
      stages: {
        attribution: {
          status: "failed",
          application: "chief-attribution",
          workerAgentId: "agent-worker",
          retryCount: 1,
          error: "invalid actor",
        },
      },
    });
  });

  it("removes oldest non-active runs while preserving active runs", async () => {
    const root = await mkdtemp(join(tmpdir(), "dscode-chief-workspace-"));
    temporaryDirectories.push(root);
    const old = await createEvalRun(trajectory(1), "session-b", {
      evalRoot: root,
      runId: "old",
      now: 100,
      retain: 100,
    });
    await finishEvalRun(old, "completed");
    const middle = await createEvalRun(trajectory(1), "session-b", {
      evalRoot: root,
      runId: "middle",
      now: 200,
      retain: 100,
    });
    await finishEvalRun(middle, "completed");
    const active = await createEvalRun(trajectory(1), "session-b", {
      evalRoot: root,
      runId: "active",
      now: 300,
      retain: 100,
    });
    const newest = await createEvalRun(trajectory(1), "session-b", {
      evalRoot: root,
      runId: "newest",
      now: 400,
      retain: 100,
    });
    await finishEvalRun(newest, "completed");

    const removed = await cleanupEvalRuns(root, 3);

    expect(removed).toContain(old.runRoot);
    await expect(access(active.runRoot)).resolves.toBeUndefined();
    await expect(access(middle.runRoot)).resolves.toBeUndefined();
    await expect(access(newest.runRoot)).resolves.toBeUndefined();
  });
});
