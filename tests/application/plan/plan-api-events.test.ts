import { afterEach, describe, expect, it, vi } from "vitest";

import type { HarnessEvent } from "../../../src/application/events.js";
import type { UserInteractionPort } from "../../../src/application/harness-api.js";
import type {
  PlanCandidate,
  PlanService,
} from "../../../src/application/plan/index.js";
import {
  createRoutedHarnessFixture,
  type RoutedHarnessFixture,
} from "../../helpers/routed-harness.js";
import { assistant } from "./harness-execution-helpers.js";

const fixtures: RoutedHarnessFixture[] = [];

afterEach(async () => {
  await Promise.all(fixtures.splice(0).map((fixture) => fixture.cleanup()));
});

function candidate(optionId: string): PlanCandidate {
  return {
    optionId,
    summary: `Option ${optionId}`,
    affectedScopes: ["src/application/plan"],
    evidence: [],
    risks: [],
    cost: "low",
    reversibility: "reversible",
    constraintFit: "uncertain",
    recommended: optionId === "a",
    rationale: `Public rationale ${optionId}`,
  };
}

async function createPlan(
  service: PlanService,
  planId: string,
  sessionId: string,
  mainAgentId: string,
) {
  const created = await service.create({
    planId,
    sessionId,
    mainAgentId,
    plannerAgentId: "planner-1",
    request: {
      requestId: `request-${planId}`,
      text: "Prepare a public implementation plan",
      submittedAt: 1,
    },
    status: "drafting",
    goal: "Implement the approved change",
    constraints: [{
      constraintId: "scope",
      kind: "hard",
      description: "Stay in M4",
      source: "user",
    }],
    decisions: [],
    items: [],
    sideEffectSummary: "",
    trajectoryEvents: [],
  });
  if (!created.ok) throw new Error("Plan creation failed");
  return created.plan;
}

function collectPlanEvents(fixture: RoutedHarnessFixture): HarnessEvent[] {
  const events: HarnessEvent[] = [];
  const types = [
    "plan:updated",
    "plan:interaction",
    "plan:approval",
    "plan:execution",
    "plan:conflict",
  ] as const;
  for (const type of types) {
    fixture.harness.api.events.on(type, (event) => events.push(event));
  }
  return events;
}

describe("Plan HarnessAPI and domain events", () => {
  it("emits committed versions before one durable interaction notification", async () => {
    const timeline: string[] = [];
    const interaction: UserInteractionPort = {
      requestPermission: async () => ({ decision: "deny" }),
      requestPlanDecision: vi.fn(async (request) => {
        timeline.push(`adapter:${request.version}`);
      }),
      requestPlanApproval: vi.fn(async () => {}),
    };
    const fixture = await createRoutedHarnessFixture({
      streamFn: () => assistant([{ type: "text", text: "unused" }], "stop"),
      userInteraction: interaction,
    });
    fixtures.push(fixture);
    const events = collectPlanEvents(fixture);
    fixture.harness.api.events.on("plan:updated", (event) => {
      timeline.push(`updated:${event.version}`);
    });
    fixture.harness.api.events.on("plan:interaction", (event) => {
      timeline.push(`interaction:${event.version}`);
    });
    const service = fixture.harness["planService"];
    const main = fixture.harness.agentSupervisor.list()
      .find((process) => process.role === "main");
    if (!main) throw new Error("Main process missing");
    const created = await createPlan(service, "plan-events", "session-events", main.agentId);
    const appended = await service.appendDecision(
      created.planId,
      "planner-1",
      created.version,
      {
        decisionNodeId: "decision-1",
        question: "Choose a path",
        candidates: [candidate("a"), candidate("b")],
      },
    );
    if (!appended.ok) throw new Error("Decision append failed");
    const waiting = await service.requestDecision(
      created.planId,
      "planner-1",
      appended.plan.version,
      "interaction-1",
      "decision-1",
    );
    await service.requestDecision(
      created.planId,
      "planner-1",
      waiting.version,
      "interaction-1",
      "decision-1",
    );
    fixture.harness.bindUserInteraction(interaction);

    await vi.waitFor(() => {
      expect(interaction.requestPlanDecision).toHaveBeenCalledTimes(1);
    });
    expect(timeline.slice(-3)).toEqual([
      `updated:${waiting.version}`,
      `interaction:${waiting.version}`,
      `adapter:${waiting.version}`,
    ]);
    expect(events.filter((event) => event.type === "plan:updated")
      .map((event) => event.version)).toEqual([1, 2, 3]);
    expect(JSON.stringify(events)).not.toMatch(
      /presentation|hiddenPrompt|privateReasoning|chainOfThought|terminalColor|jsx/i,
    );
  });

  it("returns typed API results and emits no success event for rejection", async () => {
    const fixture = await createRoutedHarnessFixture({
      streamFn: () => assistant([{ type: "text", text: "unused" }], "stop"),
    });
    fixtures.push(fixture);
    const events = collectPlanEvents(fixture);
    const service = fixture.harness["planService"];
    const main = fixture.harness.agentSupervisor.list()
      .find((process) => process.role === "main");
    const sessionId = fixture.harness.api.sessions.currentId();
    if (!main || !sessionId) throw new Error("Harness identity missing");
    const created = await createPlan(service, "plan-api", sessionId, main.agentId);

    const snapshot = await fixture.harness.api.plans.getActivePlan(sessionId);
    expect(snapshot).toMatchObject({ planId: created.planId, version: 1 });
    expect(Object.isFrozen(snapshot)).toBe(true);
    events.length = 0;

    const rejected = await fixture.harness.api.plans.approve({
      planId: created.planId,
      expectedVersion: created.version,
      commandId: "invalid-approval",
      interactionId: "missing",
      interactionPayloadDigest: "0".repeat(64),
      revision: created.revision,
      digest: created.digest,
      acknowledgedEffects: [],
    });
    expect(rejected).toMatchObject({
      ok: false,
      reason: "invalid_transition",
    });
    expect(events).toEqual([]);

    const cancelled = await fixture.harness.api.plans.cancel({
      planId: created.planId,
      expectedVersion: created.version,
      commandId: "cancel-1",
    });
    expect(cancelled).toMatchObject({
      ok: true,
      plan: { status: "cancelled", version: 3 },
      receipt: { commandId: "cancel-1", resultingVersion: 2 },
    });
    expect(events.filter((event) => event.type === "plan:updated")
      .map((event) => event.version)).toEqual([2, 3]);
    expect(await fixture.harness.api.plans.getActivePlan(sessionId)).toBeUndefined();
  });

  it("returns authoritative conflicts for stale approval, verification, and replanning", async () => {
    const fixture = await createRoutedHarnessFixture({
      streamFn: () => assistant([{ type: "text", text: "unused" }], "stop"),
    });
    fixtures.push(fixture);
    const service = fixture.harness["planService"];
    const main = fixture.harness.agentSupervisor.list()
      .find((process) => process.role === "main");
    if (!main) throw new Error("Main process missing");
    const created = await createPlan(service, "plan-verify", "session-verify", main.agentId);
    const compiled = await service.execution.compile(
      created.planId,
      "planner-1",
      created.version,
      {
        items: [{
          itemId: "item-1",
          title: "Verify",
          description: "Verify observable evidence",
          dependsOn: [],
          acceptanceCriteria: [{
            kind: "observable",
            criterionId: "observable-1",
            description: "Operation succeeded",
          }],
          effectGrants: [{
            effect: "process",
            resourceScopes: [{ kind: "process_command", commandClass: "npm" }],
          }],
        }],
        sideEffectSummary: "Runs npm",
      },
    );
    if (!compiled.ok) throw new Error("Compile failed");
    const waiting = await service.requestApproval(
      created.planId,
      "planner-1",
      compiled.plan.version,
      "approval-1",
    );
    if (waiting.pendingInteraction?.kind !== "approval") {
      throw new Error("Approval interaction missing");
    }
    const events = collectPlanEvents(fixture);
    const approvalCommand = {
      planId: created.planId,
      expectedVersion: waiting.version,
      commandId: "approve-1",
      interactionId: "approval-1",
      interactionPayloadDigest: waiting.pendingInteraction.payloadDigest,
      revision: waiting.revision,
      digest: waiting.digest,
      acknowledgedEffects: ["process" as const],
    };
    const staleApproval = await fixture.harness.api.plans.approve({
      ...approvalCommand,
      commandId: "approve-stale-semantic",
      revision: waiting.revision + 1,
    });
    expect(staleApproval).toMatchObject({
      ok: false,
      reason: "conflict",
      conflict: {
        expectedVersion: waiting.version,
        currentVersion: waiting.version,
        current: { version: waiting.version, revision: waiting.revision },
      },
    });
    expect(events.filter((event) => event.type === "plan:conflict")).toHaveLength(1);
    expect(events.filter((event) => event.type === "plan:updated")).toHaveLength(0);
    events.length = 0;

    const approved = await fixture.harness.api.plans.approve(approvalCommand);
    if (!approved.ok) throw new Error("Approval failed");
    await expect(fixture.harness.api.plans.approve(approvalCommand)).resolves.toMatchObject({
      ok: true,
      duplicate: true,
      plan: { version: approved.plan.version },
    });
    expect(events.filter((event) => event.type === "plan:conflict")).toHaveLength(0);
    const bound = await service.execution.bindItem({
      planId: created.planId,
      expectedVersion: approved.plan.version,
      revision: approved.plan.revision,
      digest: approved.plan.digest,
      itemId: "item-1",
      agentId: main.agentId,
      role: "main",
    });
    if (!bound.ok) throw new Error("Binding failed");
    const binding = bound.plan.items[0].executionBindings?.[0];
    if (!binding) throw new Error("Binding missing");
    await service.execution.authorizeTool({
      binding,
      toolCallId: "evidence-1",
      toolName: "bash",
      effect: "process",
      resourceScopes: [{ kind: "process_command", commandClass: "npm" }],
    });
    await service.execution.recordToolResult(
      binding,
      "evidence-1",
      "bash",
      { command: "npm test" },
      { details: { exitCode: 0 }, output: "passed" },
      false,
    );
    const current = await service.load(created.planId);
    if (!current.ok || !current.plan) throw new Error("Plan missing");
    events.length = 0;
    const command = {
      planId: created.planId,
      expectedVersion: current.plan.version,
      commandId: "verify-1",
      revision: current.plan.revision,
      digest: current.plan.digest,
      itemId: "item-1",
      callerAgentId: "subagent-1",
      criteria: [{
        criterionId: "observable-1",
        passed: true,
        evidenceIds: ["tool-evidence-1"],
        observed: { matched: true, description: "Observed success" },
      }],
    };
    await expect(fixture.harness.api.plans.verifyItem({
      ...command,
      expectedVersion: current.plan.version - 1,
      commandId: "verify-stale",
      callerAgentId: main.agentId,
    })).resolves.toMatchObject({
      ok: false,
      reason: "conflict",
      conflict: {
        currentVersion: current.plan.version,
        current: { version: current.plan.version, status: "executing" },
      },
    });
    expect(events.filter((event) => event.type === "plan:conflict")).toHaveLength(1);
    expect(events.filter((event) => event.type === "plan:updated")).toHaveLength(0);

    await expect(fixture.harness.api.plans.requestReplan({
      planId: created.planId,
      expectedVersion: current.plan.version - 1,
      commandId: "replan-stale",
      reason: "Stale evidence",
    })).resolves.toMatchObject({
      ok: false,
      reason: "conflict",
      conflict: {
        currentVersion: current.plan.version,
        current: { version: current.plan.version, status: "executing" },
      },
    });
    expect(events.filter((event) => event.type === "plan:conflict")).toHaveLength(2);
    expect(events.filter((event) => event.type === "plan:updated")).toHaveLength(0);

    await expect(fixture.harness.api.plans.verifyItem(command)).resolves.toMatchObject({
      ok: false,
      reason: "invalid_command",
    });
    await expect(fixture.harness.api.plans.verifyItem({
      ...command,
      commandId: "verify-2",
      callerAgentId: main.agentId,
    })).resolves.toMatchObject({
      ok: true,
      plan: { status: "completed" },
    });
  });
});
