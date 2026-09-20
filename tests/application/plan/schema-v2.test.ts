import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  computePlanDigest,
  digestCanonicalPayload,
  matchesPlanStdout,
  PlanStore,
  validatePlanRecord,
} from "../../../src/application/plan/index.js";
import type {
  PlanRecordV1,
  PlanRecordV2,
} from "../../../src/application/plan/index.js";
import { expectCreated, makePlanInput } from "./helpers.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) =>
    rm(root, { recursive: true, force: true })
  ));
});

describe("Plan schema v2", () => {
  it("loads a pre-requirements v2 record without changing its digest", async () => {
    const root = await mkdtemp(join(tmpdir(), "dscode-plan-v2-legacy-"));
    roots.push(root);
    const store = new PlanStore({ dataDir: root, projectPath: "/workspace/project" });
    const input = makePlanInput("legacy-v2");
    const selectedDecisions = input.decisions.map((decision) => ({
      decisionNodeId: decision.decisionNodeId,
      question: decision.question,
      selectedOptionId: decision.selectedOptionId!,
      candidate: decision.candidates[0],
    }));
    const legacyDigest = digestCanonicalPayload({
      goal: input.goal,
      constraints: input.constraints,
      selectedDecisions,
      sideEffectSummary: input.sideEffectSummary,
      executionSteps: input.executionSteps,
    });
    const legacy: PlanRecordV2 = {
      ...input,
      schemaVersion: 2,
      projectKey: store.projectKey,
      version: 1,
      revision: 1,
      digest: legacyDigest,
      commandReceipts: [],
      createdAt: 20,
      updatedAt: 20,
    };
    expect(legacy).not.toHaveProperty("alignmentRequirements");
    expect(computePlanDigest(legacy)).toBe(legacyDigest);
    await mkdir(store.directoryPath, { recursive: true });
    await writeFile(store.planPath(legacy.planId), `${JSON.stringify(legacy)}\n`);

    await expect(store.load(legacy.planId)).resolves.toMatchObject({
      ok: true,
      plan: { schemaVersion: 2, digest: legacyDigest },
    });
  });

  it("persists immutable step definitions separately from execution state", async () => {
    const root = await mkdtemp(join(tmpdir(), "dscode-plan-v2-"));
    roots.push(root);
    const store = new PlanStore({ dataDir: root, projectPath: "/workspace/project" });
    const created = expectCreated(await store.create(makePlanInput()));

    expect(created.schemaVersion).toBe(2);
    if (created.schemaVersion !== 2) throw new Error("Expected schema v2");
    expect(created.executionSteps[0]).not.toHaveProperty("status");
    expect(created.executionSteps[0]).not.toHaveProperty("evidence");
    expect(created.execution.steps[0]).toEqual({
      stepId: "item-1",
      status: "pending",
      evidence: [],
    });

    const digest = created.digest;
    const updated = await store.update(created.planId, created.version, (draft) => {
      draft.execution.steps[0].status = "in_progress";
    });
    if (!updated.ok) throw new Error("Expected execution state update");
    expect(updated.plan.digest).toBe(digest);
    expect(updated.plan.revision).toBe(created.revision);
  });

  it("loads schema v1 records without rewriting and rejects mutation", async () => {
    const root = await mkdtemp(join(tmpdir(), "dscode-plan-v1-"));
    roots.push(root);
    const store = new PlanStore({ dataDir: root, projectPath: "/workspace/project" });
    const input = makePlanInput("legacy-plan");
    const legacy: PlanRecordV1 = {
      ...input,
      schemaVersion: 1,
      projectKey: store.projectKey,
      version: 1,
      revision: 1,
      digest: "",
      items: input.executionSteps.map((step) => ({
        itemId: step.stepId,
        order: step.order,
        title: step.title,
        description: step.description,
        dependsOn: step.dependsOn,
        status: "pending",
        acceptanceCriteria: [{
          kind: "command",
          criterionId: "criterion-1",
          command: "npm test",
          expectedExitCode: 0,
          expectedOutput: "passed",
        }],
        effectGrants: step.effectGrants,
        evidence: [],
      })),
      commandReceipts: [],
      createdAt: 20,
      updatedAt: 20,
    };
    delete (legacy as Partial<PlanRecordV2>).executionSteps;
    delete (legacy as Partial<PlanRecordV2>).execution;
    legacy.digest = computePlanDigest(legacy);
    await mkdir(store.directoryPath, { recursive: true });
    await writeFile(store.planPath(legacy.planId), `${JSON.stringify(legacy)}\n`);

    const loaded = await store.load(legacy.planId);
    expect(loaded).toMatchObject({
      ok: true,
      plan: { schemaVersion: 1, version: 1 },
    });
    await expect(store.update(legacy.planId, 1, () => {}))
      .rejects.toThrow("read-only");
    expect(JSON.parse(await readFile(store.planPath(legacy.planId), "utf8")))
      .toEqual(legacy);
  });

  it("rejects mismatched execution definitions and invalid regex flags", () => {
    const record = {
      ...makePlanInput(),
      schemaVersion: 2 as const,
      projectKey: "project",
      version: 1,
      revision: 1,
      digest: "0".repeat(64),
      commandReceipts: [],
      createdAt: 1,
      updatedAt: 1,
    };
    record.execution.steps[0].stepId = "missing";
    expect(() => validatePlanRecord(record)).toThrow(
      "execution state does not match",
    );

    record.execution.steps[0].stepId = record.executionSteps[0].stepId;
    const verification = record.executionSteps[0].verifications[0];
    if (verification.kind !== "command") throw new Error("Expected command");
    verification.expect.stdout = {
      matcher: "regex",
      value: "ok",
      flags: "invalid",
    };
    expect(() => validatePlanRecord(record)).toThrow("invalid stdout regex");
  });
});

describe("matchesPlanStdout", () => {
  it("uses only an explicitly declared matcher", () => {
    expect(matchesPlanStdout("", undefined)).toBe(true);
    expect(matchesPlanStdout("all tests passed", {
      matcher: "contains",
      value: "tests passed",
    })).toBe(true);
    expect(matchesPlanStdout("exact\n", {
      matcher: "equals",
      value: "exact",
    })).toBe(false);
    expect(matchesPlanStdout("READY 42", {
      matcher: "regex",
      value: "^ready \\d+$",
      flags: "i",
    })).toBe(true);
    expect(matchesPlanStdout("anything", {
      matcher: "regex",
      value: "[",
    })).toBe(false);
  });
});
