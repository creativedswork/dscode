import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  makePlannerTools,
  PLANNER_TOOL_NAMES,
  PlanStore,
  PlannerInteractionBroker,
  PlannerService,
} from "../../../src/application/plan/index.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) =>
    rm(root, { recursive: true, force: true })
  ));
});

async function setup() {
  const root = await mkdtemp(join(tmpdir(), "dscode-planner-tools-"));
  roots.push(root);
  const store = new PlanStore({ dataDir: root, projectPath: "/project" });
  const service = new PlannerService(store);
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
  const appended = await service.appendDecision(
    "plan-1",
    "planner-1",
    created.plan.version,
    {
      decisionNodeId: "decision-1",
      question: "Choose",
      candidates: [
        {
          optionId: "a",
          summary: "A",
          affectedScopes: ["src"],
          evidence: [],
          risks: [],
          cost: "low",
          reversibility: "reversible",
          constraintFit: "satisfies",
          recommended: true,
          rationale: "A",
        },
        {
          optionId: "b",
          summary: "B",
          affectedScopes: ["src"],
          evidence: [],
          risks: [],
          cost: "low",
          reversibility: "reversible",
          constraintFit: "uncertain",
          recommended: false,
          rationale: "B",
        },
      ],
    },
  );
  if (!appended.ok) throw new Error("append failed");
  const interactions = new PlannerInteractionBroker();
  const tools = makePlannerTools({
    plannerAgentId: "planner-1",
    planId: () => "plan-1",
    service,
    interactions,
  });
  return { appended: appended.plan, interactions, service, tools };
}

describe("Planner tools", () => {
  it("exposes only side-effect-free Planner operations", async () => {
    const { tools } = await setup();

    expect(tools.map((tool) => tool.name)).toEqual(PLANNER_TOOL_NAMES);
    expect(tools.every((tool) =>
      tool.planOperation?.domain === "plan"
      && tool.planOperation.sideEffectFree
      && tool.audience === "planner"
    )).toBe(true);
  });

  it("persists only decision fields when called through the tool", async () => {
    const fixture = await setup();
    const tool = fixture.tools.find((item) =>
      item.name === "plan_append_decision"
    );
    if (!tool) throw new Error("append decision tool missing");

    const result = await tool.execute("tool-append", {
      expectedVersion: fixture.appended.version,
      decisionNodeId: "decision-2",
      question: "Choose another direction",
      candidates: [{
        optionId: "c",
        summary: "C",
        affectedScopes: ["src"],
        evidence: [],
        risks: [],
        cost: "low",
        reversibility: "reversible",
        constraintFit: "uncertain",
        recommended: true,
        rationale: "C",
      }],
    }, new AbortController().signal);

    expect(result.details).toMatchObject({
      decisions: [
        { decisionNodeId: "decision-1" },
        { decisionNodeId: "decision-2", status: "open" },
      ],
    });
    expect((result.details as { decisions: Record<string, unknown>[] })
      .decisions[1]).not.toHaveProperty("expectedVersion");
  });

  it("lets Planner select a technical decision without user interaction", async () => {
    const fixture = await setup();
    const tool = fixture.tools.find((item) =>
      item.name === "plan_select_decision"
    );
    if (!tool) throw new Error("select decision tool missing");

    const result = await tool.execute("tool-select", {
      expectedVersion: fixture.appended.version,
      decisionNodeId: "decision-1",
      optionId: "a",
    }, new AbortController().signal);

    expect(result.details).toMatchObject({
      decisions: [{
        decisionNodeId: "decision-1",
        status: "selected",
        selectedOptionId: "a",
      }],
      pendingInteraction: undefined,
    });
  });

  it("persists a decision before waiting and resumes from its receipt", async () => {
    const fixture = await setup();
    const tool = fixture.tools.find((item) => item.name === "plan_request_decision");
    if (!tool) throw new Error("decision tool missing");
    const waiting = tool.execute("tool-1", {
      expectedVersion: fixture.appended.version,
      interactionId: "interaction-1",
      decisionNodeId: "decision-1",
    }, new AbortController().signal);
    await vi.waitFor(async () => {
      const loaded = await fixture.service.load("plan-1");
      expect(loaded.ok && loaded.plan).toMatchObject({
        status: "awaiting_decision",
        pendingInteraction: { interactionId: "interaction-1" },
      });
    });
    const loaded = await fixture.service.load("plan-1");
    if (!loaded.ok || !loaded.plan?.pendingInteraction) {
      throw new Error("interaction missing");
    }
    const selected = await fixture.service.applyDecision({
      planId: "plan-1",
      plannerAgentId: "planner-1",
      expectedVersion: loaded.plan.version,
      commandId: "command-1",
      interactionId: "interaction-1",
      interactionPayloadDigest: loaded.plan.pendingInteraction.payloadDigest,
      action: {
        kind: "select",
        decisionNodeId: "decision-1",
        optionId: "a",
      },
    });
    if (!selected.ok) throw new Error("selection failed");
    fixture.interactions.resolve("interaction-1", selected.plan);

    await expect(waiting).resolves.toMatchObject({
      details: {
        pendingInteraction: undefined,
        commandReceipts: [expect.objectContaining({ commandId: "command-1" })],
      },
    });
  });

  it("internally authorizes the compiled revision without an interaction", async () => {
    const fixture = await setup();
    const decision = await fixture.service.requestDecision(
      "plan-1",
      "planner-1",
      fixture.appended.version,
      "decision-before-approval",
      "decision-1",
    );
    if (!decision.pendingInteraction) throw new Error("decision interaction missing");
    const selected = await fixture.service.applyDecision({
      planId: "plan-1",
      plannerAgentId: "planner-1",
      expectedVersion: decision.version,
      commandId: "select-before-approval",
      interactionId: decision.pendingInteraction.interactionId,
      interactionPayloadDigest: decision.pendingInteraction.payloadDigest,
      action: {
        kind: "select",
        decisionNodeId: "decision-1",
        optionId: "a",
      },
    });
    if (!selected.ok) throw new Error("selection failed");
    const compile = fixture.tools.find((item) => item.name === "plan_compile");
    const authorize = fixture.tools.find((item) =>
      item.name === "plan_authorize"
    );
    if (!compile || !authorize) throw new Error("authorization tools missing");
    await compile.execute("tool-compile", {
      expectedVersion: selected.plan.version,
      items: [{
        itemId: "item-1",
        title: "Implement A",
        description: "Implement the selected option",
        dependsOn: [],
        acceptanceCriteria: [{
          kind: "observable",
          criterionId: "done",
          description: "Implementation is complete",
        }],
        effectGrants: [],
      }],
      sideEffectSummary: "No side effects.",
    }, new AbortController().signal);
    const compiled = await fixture.service.load("plan-1");
    if (!compiled.ok || !compiled.plan) throw new Error("compiled plan missing");
    const authorized = await authorize.execute("tool-2", {
      expectedVersion: compiled.plan.version,
    }, new AbortController().signal);
    expect(authorized).toMatchObject({
      details: {
        status: "approved",
        approval: {
          revision: compiled.plan.revision,
          digest: compiled.plan.digest,
          interactionId: "internal:planner-1",
        },
      },
    });
  });

  it.each(["resolve", "reject"] as const)(
    "does not lose an interaction %s before the persistence call returns",
    async (outcome) => {
      const fixture = await setup();
      const tool = fixture.tools.find((item) =>
        item.name === "plan_request_decision"
      );
      if (!tool) throw new Error("decision tool missing");
      const original = fixture.service.requestDecision.bind(fixture.service);
      let persisted!: (plan: Awaited<ReturnType<typeof original>>) => void;
      let release!: () => void;
      const reachedBarrier = new Promise<Awaited<ReturnType<typeof original>>>(
        (resolve) => { persisted = resolve; },
      );
      const barrier = new Promise<void>((resolve) => { release = resolve; });
      vi.spyOn(fixture.service, "requestDecision").mockImplementation(
        async (...args) => {
          const plan = await original(...args);
          persisted(plan);
          await barrier;
          return plan;
        },
      );

      const result = tool.execute("tool-race", {
        expectedVersion: fixture.appended.version,
        interactionId: "interaction-race",
        decisionNodeId: "decision-1",
      }, new AbortController().signal);
      const plan = await reachedBarrier;
      if (outcome === "resolve") {
        fixture.interactions.resolve("interaction-race", plan);
      } else {
        fixture.interactions.reject("interaction-race", new Error("rejected early"));
      }
      release();

      if (outcome === "resolve") {
        await expect(result).resolves.toMatchObject({
          details: { pendingInteraction: { interactionId: "interaction-race" } },
        });
      } else {
        await expect(result).rejects.toThrow("rejected early");
      }
      expect(fixture.interactions.has("interaction-race")).toBe(false);
    },
  );
});
