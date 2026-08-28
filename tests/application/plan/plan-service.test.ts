import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { HarnessEventBus } from "../../../src/application/events.js";
import type { HarnessEvent } from "../../../src/application/events.js";
import {
  PlanStore,
  makePlannerTools,
  PlannerInteractionBroker,
  type PlanCandidate,
} from "../../../src/application/plan/index.js";
import { Logger } from "../../../src/kernel/logger.js";
import { makePlanInput } from "./helpers.js";
import { createTestPlanService } from "./plan-service-fixture.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) =>
    rm(root, { recursive: true, force: true })
  ));
});

function candidate(optionId: string): PlanCandidate {
  return {
    optionId,
    summary: `Option ${optionId}`,
    affectedScopes: ["src"],
    evidence: [],
    risks: [],
    cost: "low",
    reversibility: "reversible",
    constraintFit: "satisfies",
    recommended: optionId === "a",
    rationale: `Public rationale ${optionId}`,
  };
}

async function setup() {
  const root = await mkdtemp(join(tmpdir(), "dscode-plan-service-"));
  roots.push(root);
  const logger = new Logger({
    type: "test",
    id: "plan-service",
    directory: join(root, "logs"),
  });
  const bus = new HarnessEventBus(logger);
  const observed: HarnessEvent[] = [];
  const order: string[] = [];
  for (const type of [
    "plan:updated",
    "plan:interaction",
    "plan:approval",
    "plan:execution",
    "plan:conflict",
  ] as const) {
    bus.on(type, (event) => {
      observed.push(event);
      order.push(`${event.type}:${"version" in event ? event.version : ""}`);
    });
  }
  const decisionAdapter = vi.fn(async () => {
    order.push("adapter:decision");
  });
  const approvalAdapter = vi.fn(async () => {
    order.push("adapter:approval");
  });
  const store = new PlanStore({ dataDir: root, projectPath: root });
  const service = createTestPlanService(store, {
    publish: (event) => bus.emit(event),
    requestPlanDecision: decisionAdapter,
    requestPlanApproval: approvalAdapter,
    now: () => 100,
  });
  const input = makePlanInput();
  input.constraints = [{
    constraintId: "scope",
    kind: "hard",
    description: "Stay in scope",
    source: "user",
  }];
  const created = await service.create(input);
  if (!created.ok) throw new Error("Plan create failed");
  return {
    root,
    store,
    service,
    observed,
    order,
    decisionAdapter,
    approvalAdapter,
    plan: created.plan,
  };
}

describe("PlanService API and events", () => {
  it("rebuilds the active Session index and retains the latest terminal Plan", async () => {
    const fixture = await setup();
    const restarted = createTestPlanService(fixture.store);

    await expect(restarted.getActivePlan("session-1")).resolves
      .toMatchObject({ planId: "plan-1", status: "drafting" });
    const failed = await fixture.store.update(
      "plan-1",
      fixture.plan.version,
      (draft) => {
        draft.status = "failed";
      },
    );
    if (!failed.ok) throw new Error("Plan failure transition failed");

    await expect(restarted.getActivePlan("session-1")).resolves.toBeUndefined();
    await expect(restarted.getLatestPlan("session-1")).resolves
      .toMatchObject({ planId: "plan-1", status: "failed" });
  });

  it("emits only after commits and does not double-notify replayed interactions", async () => {
    const fixture = await setup();
    const appended = await fixture.service.appendDecision(
      "plan-1",
      "planner-1",
      fixture.plan.version,
      {
        decisionNodeId: "decision-2",
        question: "Choose a path",
        candidates: [
          candidate("a"),
          { ...candidate("b"), constraintFit: "uncertain" },
        ],
      },
    );
    if (!appended.ok) throw new Error("Decision append failed");
    const waiting = await fixture.service.requestDecision(
      "plan-1",
      "planner-1",
      appended.plan.version,
      "interaction-1",
      "decision-2",
    );

    expect(fixture.order.slice(-4)).toEqual([
      `plan:updated:${waiting.version}`,
      `plan:interaction:${waiting.version}`,
      `plan:execution:${waiting.version}`,
      "adapter:decision",
    ]);
    await expect(fixture.service.requestDecision(
      "plan-1",
      "planner-1",
      appended.plan.version,
      "interaction-stale",
      "decision-2",
    )).rejects.toThrow("Plan version conflict");
    expect(fixture.decisionAdapter).toHaveBeenCalledTimes(1);
    await fixture.service.requestDecision(
      "plan-1",
      "planner-1",
      waiting.version,
      "interaction-1",
      "decision-2",
    );
    expect(fixture.decisionAdapter).toHaveBeenCalledTimes(1);

    const selected = await fixture.service.mutateDecision({
      planId: "plan-1",
      expectedVersion: waiting.version,
      commandId: "select-1",
      interactionId: "interaction-1",
      interactionPayloadDigest: waiting.pendingInteraction?.payloadDigest,
      action: {
        kind: "select",
        decisionNodeId: "decision-2",
        optionId: "a",
      },
    }, "planner-1");
    expect(selected).toMatchObject({
      ok: true,
      receipt: { commandId: "select-1" },
    });
    if (!selected.ok) throw new Error("Decision failed");
    const updatedBeforeConflict = fixture.observed.filter((event) =>
      event.type === "plan:updated"
    ).length;
    const stale = await fixture.service.mutateDecision({
      planId: "plan-1",
      expectedVersion: waiting.version,
      commandId: "stale-1",
      action: {
        kind: "investigate",
        decisionNodeId: "decision-2",
      },
    }, "planner-1");
    expect(stale).toMatchObject({
      ok: false,
      reason: "conflict",
      conflict: { currentVersion: selected.plan.version },
    });
    expect(fixture.observed.filter((event) => event.type === "plan:updated"))
      .toHaveLength(updatedBeforeConflict);
    expect(fixture.observed.at(-1)?.type).toBe("plan:conflict");
  });

  it("notifies approval only after persistence and emits public payloads", async () => {
    const fixture = await setup();
    const compiled = await fixture.service.execution.compile(
      "plan-1",
      "planner-1",
      fixture.plan.version,
      {
        items: [{
          itemId: "item-1",
          title: "Implement",
          description: "Implement the selected path",
          dependsOn: [],
          acceptanceCriteria: [{
            kind: "observable",
            criterionId: "verified",
            description: "Behavior is verified",
          }],
          effectGrants: [],
        }],
        sideEffectSummary: "No side effects.",
      },
    );
    if (!compiled.ok) throw new Error("Compile failed");
    const waiting = await fixture.service.requestApproval(
      "plan-1",
      "planner-1",
      compiled.plan.version,
      "approval-1",
    );

    expect(fixture.order.slice(-4)).toEqual([
      `plan:updated:${waiting.version}`,
      `plan:interaction:${waiting.version}`,
      `plan:execution:${waiting.version}`,
      "adapter:approval",
    ]);
    expect(fixture.approvalAdapter).toHaveBeenCalledWith(expect.objectContaining({
      interactionId: "approval-1",
      revision: waiting.revision,
      digest: waiting.digest,
      items: [expect.objectContaining({ itemId: "item-1" })],
    }));
    await fixture.service.requestApproval(
      "plan-1",
      "planner-1",
      waiting.version,
      "approval-1",
    );
    expect(fixture.approvalAdapter).toHaveBeenCalledTimes(1);
    const approved = await fixture.service.approve({
      planId: waiting.planId,
      expectedVersion: waiting.version,
      commandId: "approve-1",
      interactionId: "approval-1",
      interactionPayloadDigest: waiting.pendingInteraction!.payloadDigest,
      revision: waiting.revision,
      digest: waiting.digest,
      acknowledgedEffects: [],
    });
    expect(approved).toMatchObject({
      ok: true,
      receipt: { commandId: "approve-1" },
    });
    if (!approved.ok) throw new Error("Approval failed");
    expect(fixture.order.slice(-3)).toEqual([
      `plan:updated:${approved.plan.version}`,
      `plan:approval:${approved.plan.version}`,
      `plan:execution:${approved.plan.version}`,
    ]);
    const serialized = JSON.stringify(fixture.observed);
    expect(serialized).not.toMatch(
      /jsx|terminalColor|buttonLabel|hiddenPrompt|privateReasoning|chain.?of.?thought/i,
    );
    expect(await readFile(fixture.store.planPath("plan-1"), "utf8"))
      .toContain('"interactionId": "approval-1"');
  });

  it("publishes Planner tool, execution, and direct store conflicts once", async () => {
    const fixture = await setup();
    const advanced = await fixture.store.update("plan-1", fixture.plan.version, () => {});
    if (!advanced.ok) throw new Error("Plan setup failed");
    const tools = makePlannerTools({
      plannerAgentId: "planner-1",
      planId: () => "plan-1",
      service: fixture.service,
      execution: fixture.service.execution,
      interactions: new PlannerInteractionBroker(),
    });
    const initialize = tools.find((tool) => tool.name === "plan_initialize");
    if (!initialize) throw new Error("Planner tool missing");
    const updatedCount = fixture.observed.filter((event) =>
      event.type === "plan:updated"
    ).length;

    await expect(initialize.execute("tool-stale", {
      expectedVersion: fixture.plan.version,
      goal: "Stale",
      constraints: [],
    }, new AbortController().signal)).rejects.toThrow("Plan initialization failed");
    await expect(fixture.service.execution.compile(
      "plan-1", "planner-1", fixture.plan.version,
      { items: [], sideEffectSummary: "Stale" },
    )).resolves.toMatchObject({ ok: false, reason: "conflict" });
    await fixture.store.update("plan-1", fixture.plan.version, () => {});

    const conflicts = fixture.observed.filter((event) => event.type === "plan:conflict");
    expect(conflicts).toHaveLength(3);
    expect(conflicts.every((event) => event.currentVersion === advanced.plan.version)).toBe(true);
    expect(fixture.observed.filter((event) => event.type === "plan:updated"))
      .toHaveLength(updatedCount);
  });
});
