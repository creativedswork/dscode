import { describe, expect, it, vi } from "vitest";

import type { PlanDecisionAction } from "../../src/application/plan/index.js";
import type { ClientCommand } from "../../src/ui/shared/types.js";
import { projectPlanReady } from "../../src/ui/web/web-backend.js";
import {
  makePlan,
  pendingPlan,
  setupPlanBackend as setup,
} from "./plan-protocol-fixture.js";

describe("Plan WebSocket protocol", () => {
  it("projects the authorized Plan result without internal protocol data", () => {
    const plan = makePlan({
      status: "approved",
      approval: {
        revision: 2,
        digest: "a".repeat(64),
        approvedEffects: ["workspace_write"],
        acknowledgedSideEffects: [],
        interactionId: "internal:planner-1",
        approvedAt: 10,
      },
    });

    expect(projectPlanReady(plan)).toEqual({
      type: "plan_ready",
      id: plan.planId,
      text: `计划已生成 · ${plan.items.length} 项任务`,
      createdAt: 10,
    });
    expect(projectPlanReady({ ...plan, baseRevision: 1 })).toMatchObject({
      type: "plan_ready",
      text: `执行计划已更新 · ${plan.items.length} 项任务`,
    });
    expect(projectPlanReady({
      ...plan,
      status: "drafting",
      baseRevision: 1,
      approval: undefined,
    })).toMatchObject({
      type: "plan_ready",
      text: "正在调整执行计划",
    });
    expect(JSON.stringify(projectPlanReady(plan))).not.toMatch(
      /digest|revision|plan_start_item/,
    );
  });

  it("keeps legacy chat compatible and forwards explicit Plan mode", async () => {
    const fixture = setup();

    await fixture.backend["handleMessage"](fixture.client as never, {
      type: "chat",
      text: "legacy",
    });
    await fixture.backend["handleMessage"](fixture.client as never, {
      type: "chat",
      text: "planned",
      planMode: "plan",
    });

    expect(fixture.prompt).toHaveBeenNthCalledWith(
      1,
      "legacy",
      undefined,
      "auto",
    );
    expect(fixture.prompt).toHaveBeenNthCalledWith(
      2,
      "planned",
      undefined,
      "plan",
    );
  });

  it.each<PlanDecisionAction>([
    { kind: "select", decisionNodeId: "decision-1", optionId: "json" },
    { kind: "investigate", decisionNodeId: "decision-1", question: "Why?" },
    {
      kind: "update_constraints",
      constraints: [{
        kind: "remove",
        constraintId: "constraint-1",
      }],
    },
    { kind: "backtrack", targetDecisionNodeId: "decision-1" },
  ])("maps decision action $kind without prompting the model", async (action) => {
    const fixture = setup();
    const command: ClientCommand = {
      type: "plan_decision",
      sessionId: "session-1",
      planId: "plan-1",
      expectedVersion: 3,
      commandId: `command-${action.kind}`,
      interactionId: "interaction-1",
      interactionPayloadDigest: "b".repeat(64),
      action,
    };

    await fixture.backend["handleMessage"](fixture.client as never, command);

    expect(fixture.submitDecision).toHaveBeenCalledWith({
      planId: "plan-1",
      expectedVersion: 3,
      commandId: `command-${action.kind}`,
      interactionId: "interaction-1",
      interactionPayloadDigest: "b".repeat(64),
      action,
    });
    expect(fixture.prompt).not.toHaveBeenCalled();
  });

  it("projects a successful alignment response into Chat", async () => {
    const fixture = setup();
    const plan = pendingPlan();
    plan.status = "drafting";
    plan.pendingInteraction = undefined;
    plan.updatedAt = 10;
    plan.constraints.push({
      constraintId: "alignment:interaction-1",
      kind: "preference",
      description: "视觉风格：复古像素",
      source: "user",
    });
    fixture.submitDecision.mockResolvedValue({
      ok: true,
      plan,
      receipt: {
        commandId: "select-1",
        operation: "select",
        interactionId: "interaction-1",
        payloadDigest: "c".repeat(64),
        result: {
          kind: "interaction_consumed",
          interactionId: "interaction-1",
        },
        resultingVersion: plan.version,
        completedAt: 10,
      },
      duplicate: false,
    });

    await fixture.backend["handleMessage"](fixture.client as never, {
      type: "plan_decision",
      sessionId: "session-1",
      planId: "plan-1",
      expectedVersion: 3,
      commandId: "select-1",
      interactionId: "interaction-1",
      interactionPayloadDigest: "b".repeat(64),
      action: {
        kind: "select",
        decisionNodeId: "decision-1",
        optionId: "json",
      },
    });

    expect(fixture.broadcast).toHaveBeenCalledWith({
      type: "plan_response",
      id: "interaction-1",
      text: "已确认：视觉风格：复古像素",
      createdAt: 10,
    });
  });

  it("maps approval, replanning, and cancellation commands", async () => {
    const fixture = setup();

    await fixture.backend["handleMessage"](fixture.client as never, {
      type: "plan_approve",
      sessionId: "session-1",
      planId: "plan-1",
      expectedVersion: 3,
      commandId: "approve-1",
      interactionId: "interaction-1",
      interactionPayloadDigest: "b".repeat(64),
      revision: 2,
      digest: "a".repeat(64),
      acknowledgedEffects: ["workspace_write"],
    });
    await fixture.backend["handleMessage"](fixture.client as never, {
      type: "plan_replan",
      sessionId: "session-1",
      planId: "plan-1",
      expectedVersion: 3,
      commandId: "replan-1",
      reason: "New evidence",
    });
    await fixture.backend["handleMessage"](fixture.client as never, {
      type: "plan_cancel",
      sessionId: "session-1",
      planId: "plan-1",
      expectedVersion: 3,
      commandId: "cancel-1",
    });

    expect(fixture.approve).toHaveBeenCalledWith(expect.objectContaining({
      commandId: "approve-1",
      revision: 2,
      interactionPayloadDigest: "b".repeat(64),
    }));
    expect(fixture.requestReplan).toHaveBeenCalledWith({
      planId: "plan-1",
      expectedVersion: 3,
      commandId: "replan-1",
      reason: "New evidence",
    });
    expect(fixture.cancel).toHaveBeenCalledWith({
      planId: "plan-1",
      expectedVersion: 3,
      commandId: "cancel-1",
    });
  });

  it("rejects a late command from a previously selected Session", async () => {
    const fixture = setup();
    const currentPlan = pendingPlan();
    currentPlan.sessionId = "session-2";
    currentPlan.planId = "plan-2";
    fixture.setCurrentSessionId("session-2");
    fixture.setActivePlan(currentPlan);

    await fixture.backend["handleMessage"](fixture.client as never, {
      type: "plan_cancel",
      sessionId: "session-1",
      planId: "plan-1",
      expectedVersion: 3,
      commandId: "late-cancel",
    });

    expect(fixture.cancel).not.toHaveBeenCalled();
    expect(fixture.client.send).toHaveBeenCalledWith({
      type: "plan_state",
      plan: currentPlan,
    });
  });

  it("sends a conflict fallback when HarnessAPI emits no domain event", async () => {
    const fixture = setup();
    const plan = pendingPlan();
    fixture.cancel.mockResolvedValueOnce({
      ok: false,
      reason: "conflict",
      conflict: {
        kind: "version",
        expectedVersion: 2,
        currentVersion: plan.version,
        current: plan,
      },
    });

    await fixture.backend["handleMessage"](fixture.client as never, {
      type: "plan_cancel",
      sessionId: "session-1",
      planId: plan.planId,
      expectedVersion: 2,
      commandId: "cancel-conflict",
    });

    expect(fixture.client.send).toHaveBeenCalledWith({
      type: "plan_conflict",
      planId: plan.planId,
      expectedVersion: 2,
      currentVersion: plan.version,
      revision: plan.revision,
      plan,
    });
  });

  it("does not duplicate a conflict already projected from a domain event", async () => {
    const fixture = setup();
    const plan = pendingPlan();
    fixture.cancel.mockImplementationOnce(async () => {
      fixture.events.emit({
        type: "plan:conflict",
        planId: plan.planId,
        expectedVersion: 2,
        currentVersion: plan.version,
        revision: plan.revision,
        conflict: {
          kind: "version",
          expectedVersion: 2,
          currentVersion: plan.version,
          current: plan,
        },
        plan,
      });
      return {
        ok: false,
        reason: "conflict",
        conflict: {
          kind: "version",
          expectedVersion: 2,
          currentVersion: plan.version,
          current: plan,
        },
      };
    });

    await fixture.backend["handleMessage"](fixture.client as never, {
      type: "plan_cancel",
      sessionId: "session-1",
      planId: plan.planId,
      expectedVersion: 2,
      commandId: "cancel-domain-conflict",
    });

    expect(fixture.broadcast).toHaveBeenCalledTimes(1);
    expect(fixture.broadcast).toHaveBeenCalledWith(expect.objectContaining({
      type: "plan_conflict",
      planId: plan.planId,
    }));
    expect(fixture.client.send).not.toHaveBeenCalledWith(expect.objectContaining({
      type: "plan_conflict",
    }));
  });

  it("projects domain state, interaction, and conflicts for the current Session", async () => {
    const fixture = setup();
    const plan = pendingPlan();
    const interaction = plan.pendingInteraction!;

    fixture.events.emit({
      type: "plan:updated",
      planId: plan.planId,
      version: plan.version,
      revision: plan.revision,
      plan,
    });
    fixture.events.emit({
      type: "plan:interaction",
      planId: plan.planId,
      version: plan.version,
      revision: plan.revision,
      interaction,
    });
    fixture.events.emit({
      type: "plan:conflict",
      planId: plan.planId,
      expectedVersion: 2,
      currentVersion: plan.version,
      revision: plan.revision,
      conflict: {
        kind: "version",
        expectedVersion: 2,
        currentVersion: plan.version,
        current: plan,
      },
      plan,
    });

    await vi.waitFor(() => {
      expect(fixture.broadcast).toHaveBeenCalledWith(expect.objectContaining({
        type: "plan_interaction",
        interaction,
      }));
    });
    expect(fixture.broadcast).toHaveBeenCalledWith({
      type: "plan_state",
      plan,
    });
    expect(fixture.broadcast).toHaveBeenCalledWith(expect.objectContaining({
      type: "plan_conflict",
      expectedVersion: 2,
      currentVersion: 3,
      revision: 2,
      plan,
    }));
  });

  it("restores pending state on connection and emits an explicit empty state", async () => {
    const plan = pendingPlan();
    plan.constraints.push({
      constraintId: "alignment:interaction-prior",
      kind: "preference",
      description: "视觉风格：复古像素",
      source: "user",
    });
    const fixture = setup(plan);

    fixture.backend["handleConnect"](fixture.client as never);

    await vi.waitFor(() => {
      expect(fixture.client.send).toHaveBeenCalledWith({
        type: "plan_state",
        plan: expect.objectContaining({ planId: "plan-1" }),
      });
      expect(fixture.client.send).toHaveBeenCalledWith(expect.objectContaining({
        type: "plan_interaction",
        planId: "plan-1",
      }));
      expect(fixture.client.send).toHaveBeenCalledWith({
        type: "loader",
        state: "show",
        text: "等待你选择方向...",
      });
      expect(fixture.client.send).toHaveBeenCalledWith({
        type: "plan_response",
        id: "interaction-prior",
        text: "已确认：视觉风格：复古像素",
        createdAt: plan.updatedAt,
      });
    });

    fixture.setActivePlan(undefined);
    await fixture.backend["handleMessage"](fixture.client as never, {
      type: "session",
      action: "load",
      id: "session-2",
    });

    await vi.waitFor(() => {
      expect(fixture.broadcast).toHaveBeenCalledWith({
        type: "plan_state",
        plan: null,
      });
    });
  });

  it("restores one Planning Mode marker and the TODO during replanning", async () => {
    const plan = makePlan({
      status: "drafting",
      baseRevision: 2,
      pendingInteraction: undefined,
    });
    const fixture = setup(plan);

    await fixture.backend["syncPlanState"](fixture.client as never);

    expect(fixture.client.send).toHaveBeenCalledWith({
      type: "plan_state",
      plan,
    });
    expect(fixture.client.send).toHaveBeenCalledWith({
      type: "planning_mode",
      id: plan.planId,
    });
    expect(fixture.client.send).toHaveBeenCalledWith({
      type: "plan_ready",
      id: plan.planId,
      text: "正在调整执行计划",
      createdAt: plan.updatedAt,
    });
  });
});
