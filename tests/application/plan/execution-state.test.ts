import { rm } from "node:fs/promises";

import { afterEach, describe, expect, it, vi } from "vitest";

import { PlanExecutionLifecycle } from "../../../src/application/plan/execution-lifecycle.js";
import { bindMain, createExecutionFixture } from "./execution-helpers.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) =>
    rm(root, { recursive: true, force: true })
  ));
});

describe("Plan execution state machine", () => {
  it("allows another replan after a revised Plan resumes execution", async () => {
    const fixture = await createExecutionFixture();
    roots.push(fixture.root);
    const approved = await fixture.approve();
    const replanningPlan = { ...approved, status: "needs_replan" as const };
    const onReplanReady = vi.fn(async () => {});
    const lifecycle = new PlanExecutionLifecycle(
      fixture.store,
      async () => ({ ok: true, plan: replanningPlan }),
      { onReplanReady },
      () => 100,
    );
    const command = {
      planId: approved.planId,
      expectedVersion: approved.version,
      commandId: "conflict",
      summary: "The approved path is invalid",
    };

    await lifecycle.requestReplan(command);
    await lifecycle.requestReplan({ ...command, commandId: "duplicate" });
    await vi.waitFor(() => {
      expect(onReplanReady).toHaveBeenCalledTimes(1);
    });

    lifecycle.resume(approved.planId);
    await lifecycle.requestReplan({ ...command, commandId: "next-conflict" });
    await vi.waitFor(() => {
      expect(onReplanReady).toHaveBeenCalledTimes(2);
    });
  });

  it.each([
    "drafting",
    "awaiting_decision",
    "awaiting_approval",
    "approved",
    "needs_replan",
  ] as const)("cancels %s without entering execution", async (status) => {
    const fixture = await createExecutionFixture();
    roots.push(fixture.root);
    const current = status === "approved"
      ? await fixture.approve()
      : await (async () => {
          const updated = await fixture.store.update(
            "plan-1",
            fixture.awaiting.version,
            (draft) => {
              draft.status = status;
              if (status !== "awaiting_approval") {
                draft.pendingInteraction = undefined;
              }
            },
          );
          if (!updated.ok) throw new Error("Status fixture failed");
          return updated.plan;
        })();

    const cancelled = await fixture.execution.cancel({
      planId: "plan-1",
      expectedVersion: current.version,
      commandId: `cancel-${status}`,
    });

    expect(cancelled.ok && cancelled.plan.status).toBe("cancelled");
    expect(cancelled.ok && cancelled.plan.approval).toBeUndefined();
    expect(cancelled.ok && cancelled.plan.pendingInteraction).toBeUndefined();
  });

  it("settles in-flight output as ineligible evidence before replanning", async () => {
    const onReplanReady = vi.fn(async () => {});
    const fixture = await createExecutionFixture({
      callbacks: { onReplanReady },
    });
    roots.push(fixture.root);
    const approved = await fixture.approve();
    const { binding, plan } = await bindMain(fixture, approved.version);
    await fixture.execution.recordToolResult(
      binding,
      "dependency-check",
      "read_file",
      { path: "package.json" },
      { content: [{ type: "text", text: "dependency is unavailable" }] },
      false,
      "read",
    );
    const withEvidence = await fixture.execution.load("plan-1");
    if (!withEvidence.ok || !withEvidence.plan) throw new Error("Plan missing");
    const scope = plan.executionSteps[0].effectGrants
      .find((grant) => grant.effect === "workspace_write")
      ?.resourceScopes[0];
    if (!scope) throw new Error("Workspace scope missing");
    if (scope.kind !== "workspace_path") throw new Error("Workspace scope missing");
    const authorized = await fixture.execution.authorizeTool({
      binding,
      toolCallId: "in-flight",
      toolName: "write_file",
      effect: "workspace_write",
      resourceScopes: [{
        kind: "workspace_path",
        pattern: scope.pattern.replace(/\*\*$/, "file.ts"),
      }],
    });
    expect(authorized.ok).toBe(true);
    const conflict = await fixture.execution.materialConflict({
      planId: "plan-1",
      expectedVersion: withEvidence.plan.version,
      commandId: "conflict-1",
      revision: binding.revision,
      digest: binding.digest,
      itemId: binding.itemId,
      callerAgentId: binding.agentId,
      conflictTarget: {
        kind: "selected_decision",
        decisionNodeId: "decision-1",
        optionId: "json",
      },
      evidenceIds: ["tool-dependency-check"],
      summary: "Dependency invalidated the selected path",
    });
    if (!conflict.ok) throw new Error("Conflict update failed");
    const conflicted = conflict.plan;
    expect(conflicted.status).toBe("needs_replan");
    await expect(fixture.execution.deriveReplan(
      "plan-1",
      conflicted.version,
      "planner-2",
    )).resolves.toMatchObject({
      ok: false,
      reason: "invalid_transition",
    });

    await fixture.execution.recordToolResult(
      binding,
      "in-flight",
      "write_file",
      { path: "src/application/plan/file.ts" },
      { details: { ok: true } },
      false,
    );
    const settled = await fixture.execution.load("plan-1");
    if (!settled.ok || !settled.plan) throw new Error("Plan missing");
    expect(settled.plan.schemaVersion === 2
      && settled.plan.execution.steps[0].evidence).not.toContainEqual(
      expect.objectContaining({ evidenceId: "tool-in-flight" }),
    );
    await vi.waitFor(() => {
      expect(onReplanReady).toHaveBeenCalledOnce();
    });

    const revised = await fixture.execution.deriveReplan(
      "plan-1",
      settled.plan.version,
      "planner-2",
    );
    expect(revised.ok && revised.plan).toMatchObject({
      status: "drafting",
      baseRevision: binding.revision,
      revision: binding.revision + 1,
      approval: undefined,
      plannerAgentId: "planner-2",
    });
  });

  it("returns a typed stale conflict without freezing later dispatch", async () => {
    const fixture = await createExecutionFixture();
    roots.push(fixture.root);
    const approved = await fixture.approve();
    const { binding, plan } = await bindMain(fixture, approved.version);
    await fixture.store.update("plan-1", plan.version, (draft) => {
      draft.telemetry = { counters: { unrelatedRuntimeUpdate: 1 } };
    });

    await expect(fixture.execution.materialConflict({
      planId: "plan-1",
      expectedVersion: plan.version,
      commandId: "stale-conflict",
      revision: binding.revision,
      digest: binding.digest,
      itemId: binding.itemId,
      callerAgentId: binding.agentId,
      conflictTarget: {
        kind: "hard_constraint",
        constraintId: "constraint-1",
      },
      evidenceIds: ["tool-missing"],
      summary: "Stale discovery",
    })).resolves.toMatchObject({ ok: false, reason: "conflict" });
    const workspaceScope = plan.executionSteps[0].effectGrants
      .find((grant) => grant.effect === "workspace_write")
      ?.resourceScopes[0];
    if (workspaceScope?.kind !== "workspace_path") {
      throw new Error("Workspace scope missing");
    }
    await expect(fixture.execution.authorizeTool({
      binding,
      toolCallId: "after-stale-conflict",
      toolName: "write_file",
      effect: "workspace_write",
      resourceScopes: [{
        kind: "workspace_path",
        pattern: workspaceScope.pattern.replace(/\*\*$/, "file.ts"),
      }],
    })).resolves.toMatchObject({ ok: true });
    await fixture.execution.releaseTool(binding);
    const current = await fixture.execution.load("plan-1");
    expect(current.ok && current.plan?.status).toBe("executing");
  });

  it("rejects execution incidents as material conflicts without changing semantics", async () => {
    const onReplanReady = vi.fn(async () => {});
    const fixture = await createExecutionFixture({
      callbacks: { onReplanReady },
    });
    roots.push(fixture.root);
    const approved = await fixture.approve();
    const { binding, plan } = await bindMain(fixture, approved.version);
    await fixture.execution.recordToolResult(
      binding,
      "failed-acceptance",
      "bash",
      { command: "npm test" },
      { details: { exitCode: 1, error: true }, output: "failed" },
      false,
    );
    await fixture.execution.recordToolResult(
      binding,
      "unknown-result",
      "custom_tool",
      {},
      { content: [{ type: "text", text: "ambiguous" }] },
      false,
    );
    await fixture.execution.recordProgress(binding, "work", "Agent says path is invalid");
    const current = await fixture.execution.load("plan-1");
    if (!current.ok || !current.plan) throw new Error("Plan missing");
    const unchanged = {
      version: current.plan.version,
      revision: current.plan.revision,
      digest: current.plan.digest,
      approval: current.plan.approval,
    };

    for (const [index, evidenceId] of [
      "tool-failed-acceptance",
      "tool-unknown-result",
      "progress-main-1-100",
    ].entries()) {
      await expect(fixture.execution.materialConflict({
        planId: "plan-1",
        expectedVersion: current.plan.version,
        commandId: `incident-${index}`,
        revision: binding.revision,
        digest: binding.digest,
        itemId: binding.itemId,
        callerAgentId: binding.agentId,
        conflictTarget: {
          kind: "hard_constraint",
          constraintId: "constraint-1",
        },
        evidenceIds: [evidenceId],
        summary: "Execution incident does not invalidate the Plan",
      })).resolves.toMatchObject({ ok: false, reason: "invalid_command" });
    }

    const after = await fixture.execution.load("plan-1");
    expect(after.ok && after.plan).toMatchObject({
      status: "executing",
      ...unchanged,
      execution: {
        steps: [{
          executionBindings: current.plan.schemaVersion === 2
            ? current.plan.execution.steps[0].executionBindings
            : undefined,
        }],
      },
    });
    expect(onReplanReady).not.toHaveBeenCalled();

    const workspaceScope = plan.executionSteps[0].effectGrants
      .find((grant) => grant.effect === "workspace_write")
      ?.resourceScopes[0];
    if (workspaceScope?.kind !== "workspace_path") {
      throw new Error("Workspace scope missing");
    }
    const retry = await fixture.execution.authorizeTool({
      binding,
      toolCallId: "retry-after-incidents",
      toolName: "write_file",
      effect: "workspace_write",
      resourceScopes: [{
        kind: "workspace_path",
        pattern: workspaceScope.pattern.replace(/\*\*$/, "retry.ts"),
      }],
    });
    expect(retry.ok).toBe(true);
    await fixture.execution.releaseTool(binding);
  });

  it("accepts only the same conflict receipt while needs_replan is current", async () => {
    const fixture = await createExecutionFixture();
    roots.push(fixture.root);
    const approved = await fixture.approve();
    const { binding } = await bindMain(fixture, approved.version);
    await fixture.execution.recordToolResult(
      binding,
      "dependency-check",
      "read_file",
      { path: "package.json" },
      { content: [{ type: "text", text: "dependency is unavailable" }] },
      false,
      "read",
    );
    const current = await fixture.execution.load("plan-1");
    if (!current.ok || !current.plan) throw new Error("Plan missing");
    const command = {
      planId: "plan-1",
      expectedVersion: current.plan.version,
      commandId: "same-conflict",
      revision: binding.revision,
      digest: binding.digest,
      itemId: binding.itemId,
      callerAgentId: binding.agentId,
      conflictTarget: {
        kind: "hard_constraint" as const,
        constraintId: "constraint-1",
      },
      evidenceIds: ["tool-dependency-check"],
      summary: "Dependency is unavailable",
    };
    const first = await fixture.execution.materialConflict(command);
    expect(first.ok && first.plan.status).toBe("needs_replan");
    await expect(fixture.execution.materialConflict(command))
      .resolves.toMatchObject({ ok: true, duplicate: true });
    if (!first.ok) throw new Error("Conflict failed");
    const revised = await fixture.execution.deriveReplan(
      "plan-1",
      first.plan.version,
      "planner-2",
    );
    if (!revised.ok) throw new Error("Replan failed");
    await expect(fixture.execution.materialConflict(command))
      .resolves.toMatchObject({ ok: false, reason: "conflict" });
  });

  it("keeps explicit user-requested replanning as an independent path", async () => {
    const fixture = await createExecutionFixture();
    roots.push(fixture.root);
    const approved = await fixture.approve();
    const { plan } = await bindMain(fixture, approved.version);

    await expect(fixture.execution.requestReplan({
      planId: plan.planId,
      expectedVersion: plan.version,
      commandId: "user-replan",
      summary: "User requested a different approach",
    })).resolves.toMatchObject({
      ok: true,
      plan: {
        status: "needs_replan",
        revision: plan.revision,
        digest: plan.digest,
      },
    });
  });

  it("enforces blocked, skipped, cancellation, and terminal transitions", async () => {
    const fixture = await createExecutionFixture();
    roots.push(fixture.root);
    const approved = await fixture.approve();
    const { plan } = await bindMain(fixture, approved.version);
    const blocked = await fixture.execution.transitionItem(
      "plan-1",
      plan.version,
      "item-1",
      "blocked",
    );
    expect(blocked.ok && blocked.plan.schemaVersion === 2
      && blocked.plan.execution.steps[0].status).toBe("blocked");
    if (!blocked.ok) throw new Error("Block failed");
    const resumed = await fixture.execution.transitionItem(
      "plan-1",
      blocked.plan.version,
      "item-1",
      "in_progress",
    );
    expect(resumed.ok && resumed.plan.schemaVersion === 2
      && resumed.plan.execution.steps[0].status).toBe("in_progress");
    if (!resumed.ok) throw new Error("Resume failed");
    const cancelled = await fixture.execution.cancel({
      planId: "plan-1",
      expectedVersion: resumed.plan.version,
      commandId: "cancel-resumed",
    });
    expect(cancelled.ok && cancelled.plan.status).toBe("cancelled");
    if (!cancelled.ok) throw new Error("Cancel failed");
    await expect(fixture.execution.cancel({
      planId: "plan-1",
      expectedVersion: cancelled.plan.version,
      commandId: "cancel-terminal",
    })).resolves.toMatchObject({
      ok: false,
      reason: "invalid_transition",
    });

    const skippedFixture = await createExecutionFixture();
    roots.push(skippedFixture.root);
    const skipped = await skippedFixture.execution.transitionItem(
      "plan-1",
      skippedFixture.awaiting.version,
      "item-1",
      "skipped",
      "No longer required",
    );
    expect(skipped.ok && skipped.plan).toMatchObject({
      status: "needs_replan",
      revision: skippedFixture.awaiting.revision + 1,
      approval: undefined,
      execution: {
        steps: [{ status: "skipped", skipReason: "No longer required" }],
      },
    });
  });
});
