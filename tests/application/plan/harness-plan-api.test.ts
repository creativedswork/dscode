import { afterEach, describe, expect, it, vi } from "vitest";

import type { HarnessEvent } from "../../../src/application/events.js";
import { makePlanInput } from "./helpers.js";
import {
  createRoutedHarnessFixture,
  type RoutedHarnessFixture,
} from "../../helpers/routed-harness.js";
import { assistant } from "./harness-execution-helpers.js";

const fixtures: RoutedHarnessFixture[] = [];

afterEach(async () => {
  await Promise.all(fixtures.splice(0).map((fixture) => fixture.cleanup()));
});

describe("Harness Plan API", () => {
  it("publishes the typed explicit route decision", async () => {
    const fixture = await createRoutedHarnessFixture({
      streamFn: () => assistant([{ type: "text", text: "stop" }], "stop"),
    });
    fixtures.push(fixture);
    const routes: HarnessEvent[] = [];
    fixture.harness.api.events.on("plan:route", (event) => routes.push(event));

    await fixture.harness.api.conversation.prompt("Plan this", undefined, "plan");

    expect(routes).toEqual([
      expect.objectContaining({
        type: "plan:route",
        decision: expect.objectContaining({
          route: "plan",
          source: "explicit",
        }),
      }),
    ]);
  });

  it("returns immutable snapshots and typed mutation results", async () => {
    const fixture = await createRoutedHarnessFixture({
      streamFn: () => assistant([{ type: "text", text: "unused" }], "stop"),
    });
    fixtures.push(fixture);
    const events: HarnessEvent[] = [];
    fixture.harness.api.events.on("plan:updated", (event) => events.push(event));
    fixture.harness.api.events.on("plan:conflict", (event) => events.push(event));
    const created = await fixture.harness["planService"].create(makePlanInput());
    if (!created.ok) throw new Error("Plan create failed");

    const snapshot = await fixture.harness.api.plans.getActivePlan("session-1");
    expect(snapshot).toMatchObject({ planId: "plan-1", version: 1 });
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot?.items)).toBe(true);

    await expect(fixture.harness.api.plans.submitDecision({
      planId: "plan-1",
      expectedVersion: 1,
      commandId: "decision-without-planner",
      action: { kind: "investigate", decisionNodeId: "decision-1" },
    })).resolves.toMatchObject({
      ok: false,
      reason: "invalid_command",
    });

    const cancelled = await fixture.harness.api.plans.cancel({
      planId: "plan-1",
      expectedVersion: 1,
      commandId: "cancel-1",
    });
    expect(cancelled).toMatchObject({
      ok: true,
      plan: { status: "cancelled" },
      receipt: { commandId: "cancel-1" },
    });
    expect(events.filter((event) => event.type === "plan:updated").map((event) =>
      event.type === "plan:updated" ? event.version : 0
    )).toEqual([1, 2, 3]);

    const verify = vi.spyOn(
      fixture.harness["planService"],
      "verifyItem",
    );
    const rejected = await fixture.harness.api.plans.verifyItem({
      planId: "plan-1",
      expectedVersion: 3,
      commandId: "verify-wrong-caller",
      revision: cancelled.ok ? cancelled.plan.revision : 1,
      digest: cancelled.ok ? cancelled.plan.digest : "0".repeat(64),
      itemId: "item-1",
      callerAgentId: "subagent-not-main",
      criteria: [],
    });
    expect(rejected).toMatchObject({
      ok: false,
      reason: "invalid_transition",
    });
    expect(verify).toHaveBeenCalledWith(expect.objectContaining({
      callerAgentId: "subagent-not-main",
    }));
  });

  it("converts every mutation exception to an invalid-command result", async () => {
    const fixture = await createRoutedHarnessFixture({
      streamFn: () => assistant([{ type: "text", text: "unused" }], "stop"),
    });
    fixtures.push(fixture);
    const base = {
      planId: "missing-plan",
      expectedVersion: 1,
      commandId: "missing-command",
    };
    const results = await Promise.all([
      fixture.harness.api.plans.submitDecision({
        ...base,
        action: { kind: "investigate", decisionNodeId: "decision-1" },
      }),
      fixture.harness.api.plans.approve({
        ...base,
        interactionId: "interaction-1",
        interactionPayloadDigest: "0".repeat(64),
        revision: 1,
        digest: "0".repeat(64),
        acknowledgedEffects: [],
      }),
      fixture.harness.api.plans.verifyItem({
        ...base,
        revision: 1,
        digest: "0".repeat(64),
        itemId: "item-1",
        callerAgentId: "main-1",
        criteria: [],
      }),
      fixture.harness.api.plans.requestReplan({
        ...base,
        reason: "New evidence",
      }),
      fixture.harness.api.plans.cancel(base),
    ]);

    expect(results).toEqual(results.map(() =>
      expect.objectContaining({ ok: false, reason: "invalid_command" })
    ));
  });

  it("keeps approval success fixed when post-commit completion fails", async () => {
    const fixture = await createRoutedHarnessFixture({
      streamFn: () => assistant([{ type: "text", text: "unused" }], "stop"),
    });
    fixtures.push(fixture);
    const service = fixture.harness["planService"];
    const main = fixture.harness.agentSupervisor.list()
      .find((process) => process.role === "main");
    if (!main) throw new Error("Main process missing");
    const input = makePlanInput();
    input.mainAgentId = main.agentId;
    input.items = [];
    input.sideEffectSummary = "";
    const created = await service.create(input);
    if (!created.ok) throw new Error("Plan create failed");
    const compiled = await service.execution.compile(
      input.planId,
      "planner-1",
      created.plan.version,
      {
        items: [{
          itemId: "item-1",
          title: "Implement",
          description: "Implement the plan",
          dependsOn: [],
          acceptanceCriteria: [{
            kind: "observable",
            criterionId: "done",
            description: "Done",
          }],
          effectGrants: [],
        }],
        sideEffectSummary: "No side effects.",
      },
    );
    if (!compiled.ok) throw new Error("Compile failed");
    const waiting = await service.requestApproval(
      input.planId, "planner-1", compiled.plan.version, "approval-fault",
    );
    if (waiting.pendingInteraction?.kind !== "approval") {
      throw new Error("Approval interaction missing");
    }
    vi.spyOn(fixture.harness["plannerCoordinator"], "completeApproved")
      .mockRejectedValue(new Error("cleanup failed"));
    const versions: number[] = [];
    const conflicts: HarnessEvent[] = [];
    fixture.harness.api.events.on("plan:updated", (event) => versions.push(event.version));
    fixture.harness.api.events.on("plan:conflict", (event) => conflicts.push(event));
    const command = {
      planId: input.planId,
      expectedVersion: waiting.version,
      commandId: "approve-fault",
      interactionId: "approval-fault",
      interactionPayloadDigest: waiting.pendingInteraction.payloadDigest,
      revision: waiting.revision,
      digest: waiting.digest,
      acknowledgedEffects: [],
    };

    const first = await fixture.harness.api.plans.approve(command);
    const retry = await fixture.harness.api.plans.approve(command);
    const stale = await fixture.harness.api.plans.approve({
      ...command,
      commandId: "approve-after-v4",
    });

    expect(first).toMatchObject({ ok: true, duplicate: false, plan: { status: "approved" } });
    expect(retry).toMatchObject({ ok: true, duplicate: true, plan: { status: "approved" } });
    expect(stale).toMatchObject({
      ok: false,
      reason: "conflict",
      conflict: { expectedVersion: waiting.version, currentVersion: 4 },
    });
    expect(conflicts).toHaveLength(1);
    expect(versions).toEqual(first.ok ? [first.plan.version] : []);
    expect(main.context.activePlan).toMatchObject({ planId: input.planId });
  });

  it("keeps cancellation success fixed when terminal cleanup fails", async () => {
    const fixture = await createRoutedHarnessFixture({
      streamFn: () => assistant([{ type: "text", text: "unused" }], "stop"),
    });
    fixtures.push(fixture);
    const service = fixture.harness["planService"];
    const created = await service.create(makePlanInput());
    if (!created.ok) throw new Error("Plan create failed");
    service.bindExecutionCallbacks({
      onTerminal: async () => { throw new Error("cleanup failed"); },
    });
    const versions: number[] = [];
    fixture.harness.api.events.on("plan:updated", (event) => versions.push(event.version));
    const command = {
      planId: created.plan.planId,
      expectedVersion: created.plan.version,
      commandId: "cancel-fault",
    };

    const first = await fixture.harness.api.plans.cancel(command);
    const retry = await fixture.harness.api.plans.cancel(command);

    expect(first).toMatchObject({ ok: true, plan: { status: "cancelled" } });
    expect(retry).toMatchObject({ ok: true, duplicate: true, plan: { status: "cancelled" } });
    expect(versions).toEqual(first.ok ? [2, first.plan.version] : []);
  });
});
