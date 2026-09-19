import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  ExecutionEpisodeService,
  ExecutiveMonitor,
  fingerprintExecutionAction,
  PlanStore,
  retainVerificationEvidence,
  type PersistedExecutionEpisode,
  type PlanEvidence,
  type PlanExecutionStep,
  type PlanExecutionStepState,
} from "../../../src/application/plan/index.js";
import { expectCreated, makePlanInput } from "./helpers.js";

const roots: string[] = [];

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "dscode-episode-"));
  roots.push(root);
  const store = new PlanStore({ dataDir: root, projectPath: "/project" });
  const created = expectCreated(await store.create(makePlanInput()));
  if (created.schemaVersion !== 2) throw new Error("Expected schema v2");
  const executing = await store.update(created.planId, created.version, (draft) => {
    draft.status = "executing";
    draft.execution.steps[0].status = "in_progress";
  });
  if (!executing.ok || executing.plan.schemaVersion !== 2) {
    throw new Error("Failed to prepare executing Plan");
  }
  let id = 0;
  return {
    store,
    plan: executing.plan,
    service: new ExecutionEpisodeService(store, () => 100, () => `episode-${++id}`),
  };
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) =>
    rm(root, { recursive: true, force: true })
  ));
});

describe("execution episode persistence", () => {
  it("persists runtime state without changing semantic revision or digest", async () => {
    const { store, plan, service } = await fixture();
    const started = await service.start(plan);
    expect(started).toMatchObject({
      revision: plan.revision,
      digest: plan.digest,
      execution: {
        episode: {
          episodeId: "episode-1",
          phase: "running",
          recentFingerprints: [],
          recoveryReceipts: [],
        },
      },
    });
    const loaded = await store.load(plan.planId);
    expect(loaded).toMatchObject({
      ok: true,
      plan: {
        revision: plan.revision,
        digest: plan.digest,
        execution: { episode: { episodeId: "episode-1" } },
      },
    });
  });

  it("restores a paused snapshot and resumes idempotently with fresh budgets", async () => {
    const { store, plan, service } = await fixture();
    const taskState = {
      taskId: "task-1",
      requestId: "request-1",
      sessionId: "session-1",
      version: 7,
      status: "active" as const,
      sourcePlan: {
        planId: plan.planId,
        revision: plan.revision,
        digest: plan.digest,
      },
      todoList: [{
        todoId: "todo-1",
        title: "Deliver result",
        status: "in_progress" as const,
      }],
      history: [],
      updatedAt: 99,
    };
    const started = await service.start(plan, taskState);
    if (started.schemaVersion !== 2 || !started.execution.episode) {
      throw new Error("Episode missing");
    }
    const monitor = new ExecutiveMonitor(started.execution.episode, () => 101);
    const action = fingerprintExecutionAction(
      "edit_file",
      { path: "result.ts", old_string: "a", new_string: "b" },
      "succeeded",
    );
    for (let index = 0; index < 3; index++) {
      monitor.recordAction(action, started.execution.episode.progress);
    }
    for (let index = 0; index < 3; index++) {
      monitor.recordAction(action, started.execution.episode.progress);
    }
    const paused = monitor.snapshot();
    expect(paused.phase).toBe("paused_inconclusive");
    expect(paused.progress.task).toMatchObject({
      status: "active",
      todos: [{ todoId: "todo-1", status: "in_progress" }],
    });
    const persisted = await service.persist(
      plan.planId,
      paused,
    );
    const command = {
      commandId: "continue-1",
      planId: plan.planId,
      expectedVersion: persisted.version,
      revision: plan.revision,
      digest: plan.digest,
      operation: "continue_execution" as const,
    };
    const resumed = await service.recover(command, taskState);
    expect(resumed).toMatchObject({
      ok: true,
      duplicate: false,
      episode: {
        episodeId: "episode-2",
        phase: "running",
        turnCount: 0,
        toolCallCount: 0,
        noProgressActionCount: 0,
      },
    });
    const duplicate = await service.recover(command);
    expect(duplicate).toMatchObject({
      ok: true,
      duplicate: true,
      episode: { episodeId: "episode-2" },
      receipt: { commandId: "continue-1" },
    });
    await expect(service.get(plan.planId)).resolves.toMatchObject({
      episodeId: "episode-2",
      phase: "running",
    });
    const loaded = await store.load(plan.planId);
    expect(loaded.ok && loaded.plan?.revision).toBe(plan.revision);
    expect(loaded.ok && loaded.plan?.digest).toBe(plan.digest);
    expect(taskState).toMatchObject({
      version: 7,
      status: "active",
      todoList: [{ status: "in_progress" }],
    });
  });

  it("returns the authoritative snapshot for a stale recovery command", async () => {
    const { plan, service } = await fixture();
    const started = await service.start(plan);
    const result = await service.recover({
      commandId: "stale",
      planId: plan.planId,
      expectedVersion: started.version - 1,
      revision: plan.revision,
      digest: plan.digest,
      operation: "continue_execution",
    });
    expect(result).toMatchObject({
      ok: false,
      reason: "conflict",
      episode: { phase: "running" },
    });
  });

  it("returns foreground control to replanning without changing outcomes", async () => {
    const { store, plan, service } = await fixture();
    const started = await service.start(plan);
    if (started.schemaVersion !== 2 || !started.execution.episode) {
      throw new Error("Episode missing");
    }
    const paused: PersistedExecutionEpisode = {
      ...started.execution.episode,
      phase: "paused_inconclusive",
      reflectionUsed: true,
    };
    await service.persist(plan.planId, paused);
    const adjusted = await service.recover({
      commandId: "adjust-1",
      planId: plan.planId,
      expectedVersion: started.version,
      revision: plan.revision,
      digest: plan.digest,
      operation: "adjust_plan",
    });

    expect(adjusted).toMatchObject({
      ok: true,
      episode: { phase: "paused_inconclusive" },
      receipt: { operation: "adjust_plan" },
    });
    await expect(store.load(plan.planId)).resolves.toMatchObject({
      ok: true,
      plan: {
        status: "needs_replan",
        execution: { steps: [{ status: "in_progress" }] },
      },
    });
  });
});

describe("verification evidence retention", () => {
  const step: PlanExecutionStep = {
    stepId: "step-1",
    order: 0,
    title: "Verify",
    description: "Verify output",
    dependsOn: [],
    effectGrants: [],
    verifications: [{
      kind: "command",
      verificationId: "test",
      description: "Tests pass",
      command: "npm test",
      expect: { exitCode: 0, stdout: { matcher: "contains", value: "passed" } },
    }],
  };
  const state: PlanExecutionStepState = {
    stepId: "step-1",
    status: "in_progress",
    evidence: [],
  };

  function evidence(
    evidenceId: string,
    output: string,
    exitCode = 0,
  ): PlanEvidence {
    return {
      planId: "plan-1",
      revision: 1,
      itemId: "step-1",
      kind: "tool_result",
      evidenceId,
      toolCallId: evidenceId,
      toolName: "bash",
      command: "npm test",
      exitCode,
      output,
      structuredOutcome: exitCode === 0 ? "success" : "business_error",
      acceptanceEligible: true,
      summary: output,
      recordedAt: Number(evidenceId.slice(-1)),
    };
  }

  it("drops unrelated activity and keeps only the latest reproducible match", () => {
    const noisy: PlanExecutionStepState = {
      ...state,
      evidence: [{
        planId: "plan-1",
        revision: 1,
        itemId: "step-1",
        kind: "agent_progress",
        evidenceId: "progress-1",
        agentId: "main-1",
        phase: "editing",
        summary: "busy",
        recordedAt: 1,
      }, evidence("failed-2", "failed", 1), evidence("passed-3", "passed")],
    };
    expect(retainVerificationEvidence(
      step,
      noisy,
      evidence("passed-4", "passed again"),
    )).toEqual([evidence("passed-4", "passed again")]);
  });
});
