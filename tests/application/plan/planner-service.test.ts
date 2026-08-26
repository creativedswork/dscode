import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  PlanBudgetError,
  PlannerService,
  PlanStore,
  type PlanCandidate,
  type PlanDecisionNode,
} from "../../../src/application/plan/index.js";
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) =>
    rm(root, { recursive: true, force: true })
  ));
});

function candidate(
  optionId: string,
  overrides: Partial<PlanCandidate> = {},
): PlanCandidate {
  return {
    optionId,
    summary: optionId,
    affectedScopes: ["src"],
    evidence: [],
    risks: [],
    cost: "low",
    reversibility: "reversible",
    constraintFit: "satisfies",
    recommended: optionId === "a",
    rationale: `Choose ${optionId}`,
    ...overrides,
  };
}

async function setup(options: {
  constraints?: boolean;
  decisions?: PlanDecisionNode[];
} = {}) {
  const root = await mkdtemp(join(tmpdir(), "dscode-planner-service-"));
  roots.push(root);
  const store = new PlanStore({ dataDir: root, projectPath: "/project" });
  const service = new PlannerService(store, () => 100);
  const created = await service.create({
    planId: "plan-1",
    sessionId: "session-1",
    mainAgentId: "main-1",
    plannerAgentId: "planner-1",
    request: {
      requestId: "request-1",
      text: "Plan this",
      submittedAt: 1,
    },
    status: "drafting",
    goal: "Plan this",
    constraints: options.constraints === false ? [] : [{
      constraintId: "scope",
      kind: "hard",
      description: "Stay in scope",
      source: "user",
    }],
    decisions: options.decisions ?? [],
    items: [],
    sideEffectSummary: "",
    trajectoryEvents: [],
  });
  if (!created.ok) throw new Error("setup failed");
  return { service, store, plan: created.plan };
}

describe("PlannerService", () => {
  it("persists a human selection once and rejects stale Planner identity", async () => {
    const fixture = await setup();
    const appended = await fixture.service.appendDecision(
      "plan-1",
      "planner-1",
      fixture.plan.version,
      {
        decisionNodeId: "decision-1",
        question: "Choose an implementation",
        candidates: [candidate("a"), candidate("b")],
      },
    );
    if (!appended.ok) throw new Error("append failed");
    const waiting = await fixture.service.requestDecision(
      "plan-1",
      "planner-1",
      appended.plan.version,
      "interaction-1",
      "decision-1",
    );
    const command = {
      planId: "plan-1",
      plannerAgentId: "planner-1",
      expectedVersion: waiting.version,
      commandId: "command-1",
      interactionId: "interaction-1",
      interactionPayloadDigest: waiting.pendingInteraction?.payloadDigest,
      action: {
        kind: "select" as const,
        decisionNodeId: "decision-1",
        optionId: "a",
      },
    };

    const selected = await fixture.service.applyDecision(command);
    const replayed = await fixture.service.applyDecision(command);

    expect(selected.ok && selected.plan.decisions[0]).toMatchObject({
      status: "selected",
      selectedOptionId: "a",
    });
    expect(replayed).toMatchObject({ ok: true, duplicate: true });
    if (!selected.ok) throw new Error("selection failed");
    expect(selected.plan.commandReceipts).toHaveLength(1);
    const replaced = await fixture.store.update(
      "plan-1",
      selected.plan.version,
      (draft) => {
        draft.plannerAgentId = "planner-2";
      },
    );
    if (!replaced.ok) throw new Error("planner replacement failed");
    await expect(fixture.service.recordFact(
      "plan-1",
      "planner-1",
      replaced.plan.version,
      { summary: "stale write", references: [] },
    )).rejects.toThrow("does not own");
  });

  it("requires pending interactions for constraint updates and backtracking", async () => {
    const fixture = await setup();
    const first = await fixture.service.appendDecision(
      "plan-1",
      "planner-1",
      fixture.plan.version,
      {
        decisionNodeId: "decision-1",
        question: "Choose",
        candidates: [candidate("a"), candidate("b")],
      },
    );
    if (!first.ok) throw new Error("append failed");
    const investigated = await fixture.service.applyDecision({
      planId: "plan-1",
      plannerAgentId: "planner-1",
      expectedVersion: first.plan.version,
      commandId: "investigate",
      action: {
        kind: "investigate",
        decisionNodeId: "decision-1",
        question: "Check compatibility",
      },
    });
    if (!investigated.ok) throw new Error("investigate failed");
    await expect(fixture.service.applyDecision({
      planId: "plan-1",
      plannerAgentId: "planner-1",
      expectedVersion: investigated.plan.version,
      commandId: "constraints-without-human",
      action: {
        kind: "update_constraints",
        constraints: [{
          kind: "set",
          constraint: {
            constraintId: "compat",
            kind: "preference",
            description: "Preserve compatibility",
            source: "user",
          },
        }],
      },
    })).rejects.toThrow("requires a matching pending decision");
    const waiting = await fixture.service.requestDecision(
      "plan-1",
      "planner-1",
      investigated.plan.version,
      "interaction-constraints",
      "decision-1",
    );
    const result = await fixture.service.applyDecision({
      planId: "plan-1",
      plannerAgentId: "planner-1",
      expectedVersion: waiting.version,
      commandId: "constraints",
      interactionId: "interaction-constraints",
      interactionPayloadDigest: waiting.pendingInteraction?.payloadDigest,
      action: {
        kind: "update_constraints",
        constraints: [{
          kind: "set",
          constraint: {
            constraintId: "compat",
            kind: "preference",
            description: "Preserve compatibility",
            source: "user",
          },
        }],
      },
    });
    expect(result.ok && result.plan.constraints).toEqual(expect.arrayContaining([
      expect.objectContaining({ constraintId: "compat" }),
    ]));
    expect(result.ok && result.plan.decisions).toEqual([]);
  });

  it("enforces candidate and revision budgets without truncation", async () => {
    const fixture = await setup();
    expect(() => fixture.service.appendDecision(
      "plan-1",
      "planner-1",
      fixture.plan.version,
      {
        decisionNodeId: "too-wide",
        question: "Too many",
        candidates: ["a", "b", "c", "d"].map((id) => candidate(id)),
      },
    )).toThrow(expect.objectContaining({
      limit: "candidates",
      behavior: "clarify",
    } satisfies Partial<PlanBudgetError>));

    let version = fixture.plan.version;
    for (let index = 0; index < 6; index++) {
      const result = await fixture.service.appendDecision(
        "plan-1",
        "planner-1",
        version,
        {
          decisionNodeId: `decision-${index}`,
          question: `Question ${index}`,
          candidates: [candidate(`option-${index}`)],
        },
      );
      if (!result.ok) throw new Error("append failed");
      version = result.plan.version;
    }
    await expect(fixture.service.appendDecision(
      "plan-1",
      "planner-1",
      version,
      {
        decisionNodeId: "decision-6",
        question: "Over budget",
        candidates: [candidate("option-6")],
      },
    )).rejects.toMatchObject({
      limit: "decision_nodes",
      behavior: "clarify",
    } satisfies Partial<PlanBudgetError>);
    const loaded = await fixture.service.load("plan-1");
    expect(loaded.ok && loaded.plan?.decisions).toHaveLength(6);
    if (!loaded.ok || !loaded.plan) throw new Error("load failed");
    const selected = await fixture.store.update(
      "plan-1",
      loaded.plan.version,
      (draft) => draft.decisions.forEach((decision) => {
        decision.status = "selected";
        decision.selectedOptionId = decision.candidates[0].optionId;
      }),
    );
    if (!selected.ok) throw new Error("selection fixture failed");
    await expect(fixture.service.appendDecision(
      "plan-1",
      "planner-1",
      selected.plan.version,
      {
        decisionNodeId: "commit",
        question: "Commit",
        candidates: [candidate("commit")],
      },
    )).rejects.toMatchObject({ behavior: "commit" });
  });

});
