import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  makePlannerTools,
  PlanBudgetError,
  PlanStore,
  PlannerInteractionBroker,
  PlannerService,
  type PlanCandidate,
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

async function setup(planId = "plan-1") {
  const root = await mkdtemp(join(tmpdir(), "dscode-planner-invariants-"));
  roots.push(root);
  const store = new PlanStore({ dataDir: root, projectPath: "/project" });
  const service = new PlannerService(store, () => 100);
  const created = await service.create({
    planId,
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
    constraints: [{
      constraintId: "scope",
      kind: "hard",
      description: "Stay in scope",
      source: "user",
    }],
    decisions: [],
    items: [],
    sideEffectSummary: "",
    trajectoryEvents: [],
  });
  if (!created.ok) throw new Error("setup failed");
  return { created: created.plan, service, store };
}

async function append(
  fixture: Awaited<ReturnType<typeof setup>>,
  version: number,
  decisionNodeId: string,
  candidates: PlanCandidate[],
) {
  const result = await fixture.service.appendDecision(
    fixture.created.planId,
    "planner-1",
    version,
    { decisionNodeId, question: decisionNodeId, candidates },
  );
  if (!result.ok) throw new Error("append failed");
  return result.plan;
}

describe("Planner domain invariants", () => {
  it("enforces HITL at the mutation boundary and permits only safe auto-select", async () => {
    const fixture = await setup();
    const alternatives = await append(
      fixture,
      fixture.created.version,
      "choice",
      [candidate("a"), candidate("b")],
    );
    await expect(fixture.service.applyDecision({
      planId: "plan-1",
      plannerAgentId: "planner-1",
      expectedVersion: alternatives.version,
      commandId: "bypass",
      action: { kind: "select", decisionNodeId: "choice", optionId: "a" },
    })).rejects.toThrow("requires a matching pending decision");
    const unchanged = await fixture.service.load("plan-1");
    expect(unchanged.ok && unchanged.plan?.version).toBe(alternatives.version);

    const automatic = await setup("plan-auto");
    const single = await append(
      automatic,
      automatic.created.version,
      "single",
      [candidate("only")],
    );
    const selected = await automatic.service.applyDecision({
      planId: "plan-auto",
      plannerAgentId: "planner-1",
      expectedVersion: single.version,
      commandId: "automatic",
      action: { kind: "select", decisionNodeId: "single", optionId: "only" },
    });
    expect(selected.ok && selected.plan.decisions[0]).toMatchObject({
      status: "selected",
      selectedOptionId: "only",
    });

    const highImpact = await setup("plan-high-impact");
    const high = await append(
      highImpact,
      highImpact.created.version,
      "irreversible",
      [candidate("only", { reversibility: "irreversible" })],
    );
    await expect(highImpact.service.applyDecision({
      planId: "plan-high-impact",
      plannerAgentId: "planner-1",
      expectedVersion: high.version,
      commandId: "unsafe-automatic",
      action: { kind: "select", decisionNodeId: "irreversible", optionId: "only" },
    })).rejects.toThrow("requires a matching pending decision");
  });

  it("commits interaction state atomically and leaves no waiter after CAS failure", async () => {
    const fixture = await setup();
    const plan = await append(
      fixture,
      fixture.created.version,
      "choice",
      [candidate("a"), candidate("b")],
    );
    const requests = await Promise.allSettled([
      fixture.service.requestDecision(
        "plan-1",
        "planner-1",
        plan.version,
        "interaction-a",
        "choice",
      ),
      fixture.service.requestDecision(
        "plan-1",
        "planner-1",
        plan.version,
        "interaction-b",
        "choice",
      ),
    ]);
    expect(requests.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const loaded = await fixture.service.load("plan-1");
    if (!loaded.ok || !loaded.plan) throw new Error("plan missing");
    expect(loaded.plan).toMatchObject({
      version: plan.version + 1,
      status: "awaiting_decision",
      pendingInteraction: { kind: "decision" },
    });
    expect(loaded.plan.trajectoryEvents.at(-1)).toMatchObject({
      kind: "status_changed",
      to: "awaiting_decision",
    });

    const broker = new PlannerInteractionBroker();
    const tool = makePlannerTools({
      plannerAgentId: "planner-1",
      planId: () => "plan-1",
      service: fixture.service,
      interactions: broker,
    }).find((item) => item.name === "plan_request_decision");
    if (!tool) throw new Error("decision tool missing");
    await expect(tool.execute("tool-stale", {
      expectedVersion: plan.version,
      interactionId: "stale",
      decisionNodeId: "choice",
    }, new AbortController().signal)).rejects.toThrow("Plan version conflict");
    expect(broker.has("stale")).toBe(false);
  });

  it("keeps the selected prefix and resets the revision budget on backtrack", async () => {
    const fixture = await setup();
    let plan = fixture.created;
    for (let index = 0; index < 6; index++) {
      plan = await append(
        fixture,
        plan.version,
        `decision-${index}`,
        index <= 1
          ? [candidate("a"), candidate("b")]
          : [candidate(`option-${index}`)],
      );
    }
    const selectedPrefix = await fixture.store.update(
      "plan-1",
      plan.version,
      (draft) => {
        for (const decision of draft.decisions) {
          if (decision.decisionNodeId === "decision-1") continue;
          decision.status = "selected";
          decision.selectedOptionId = decision.candidates[0].optionId;
        }
      },
    );
    if (!selectedPrefix.ok) throw new Error("prefix selection failed");
    plan = selectedPrefix.plan;
    const waiting = await fixture.service.requestDecision(
      "plan-1",
      "planner-1",
      plan.version,
      "backtrack-interaction",
      "decision-1",
    );
    const backtracked = await fixture.service.applyDecision({
      planId: "plan-1",
      plannerAgentId: "planner-1",
      expectedVersion: waiting.version,
      commandId: "backtrack-command",
      interactionId: "backtrack-interaction",
      interactionPayloadDigest: waiting.pendingInteraction?.payloadDigest,
      action: { kind: "backtrack", targetDecisionNodeId: "decision-1" },
    });
    if (!backtracked.ok) throw new Error("backtrack failed");
    expect(backtracked.plan.decisions).toMatchObject([
      {
        decisionNodeId: "decision-0",
        status: "selected",
        selectedOptionId: "a",
      },
      {
        decisionNodeId: "decision-1",
        status: "open",
        selectedOptionId: undefined,
      },
    ]);
    plan = backtracked.plan;
    for (let index = 0; index < 4; index++) {
      plan = await append(
        fixture,
        plan.version,
        `revised-${index}`,
        [candidate(`revised-option-${index}`)],
      );
    }
    expect(plan.decisions).toHaveLength(6);
    expect(plan.trajectoryEvents).toContainEqual(expect.objectContaining({
      kind: "backtracked",
      targetDecisionNodeId: "decision-1",
      invalidatedDecisionNodeIds: [
        "decision-2",
        "decision-3",
        "decision-4",
        "decision-5",
      ],
    }));
    await expect(append(
      fixture,
      plan.version,
      "over-budget",
      [candidate("over-budget")],
    )).rejects.toBeInstanceOf(PlanBudgetError);
  });
});
