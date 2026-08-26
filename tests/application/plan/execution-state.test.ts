import { rm } from "node:fs/promises";

import { afterEach, describe, expect, it } from "vitest";

import { bindMain, createExecutionFixture } from "./execution-helpers.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) =>
    rm(root, { recursive: true, force: true })
  ));
});

describe("Plan execution state machine", () => {
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
    const fixture = await createExecutionFixture();
    roots.push(fixture.root);
    const approved = await fixture.approve();
    const { binding, plan } = await bindMain(fixture, approved.version);
    const scope = plan.items[0].effectGrants[0].resourceScopes[0];
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
      expectedVersion: plan.version,
      commandId: "conflict-1",
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
    expect(settled.plan.items[0].evidence).toContainEqual(expect.objectContaining({
      evidenceId: "tool-in-flight",
      acceptanceEligible: false,
    }));

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

  it("returns a typed stale conflict and freezes later dispatch", async () => {
    const fixture = await createExecutionFixture();
    roots.push(fixture.root);
    const approved = await fixture.approve();
    const { binding, plan } = await bindMain(fixture, approved.version);
    await fixture.execution.recordProgress(binding, "work", "progress advanced");

    await expect(fixture.execution.materialConflict({
      planId: "plan-1",
      expectedVersion: plan.version,
      commandId: "stale-conflict",
      summary: "Stale discovery",
    })).resolves.toMatchObject({ ok: false, reason: "conflict" });
    await expect(fixture.execution.authorizeTool({
      binding,
      toolCallId: "after-stale-conflict",
      toolName: "write_file",
      effect: "workspace_write",
      resourceScopes: [{
        kind: "workspace_path",
        pattern: plan.items[0].effectGrants[0].resourceScopes[0].kind === "workspace_path"
          ? plan.items[0].effectGrants[0].resourceScopes[0].pattern.replace(/\*\*$/, "file.ts")
          : "",
      }],
    })).resolves.toMatchObject({ ok: false, reason: "invalid_transition" });
    const current = await fixture.execution.load("plan-1");
    expect(current.ok && current.plan?.status).toBe("executing");
  });

  it("accepts only the same conflict receipt while needs_replan is current", async () => {
    const fixture = await createExecutionFixture();
    roots.push(fixture.root);
    const approved = await fixture.approve();
    const { plan } = await bindMain(fixture, approved.version);
    const command = {
      planId: "plan-1",
      expectedVersion: plan.version,
      commandId: "same-conflict",
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
    expect(blocked.ok && blocked.plan.items[0].status).toBe("blocked");
    if (!blocked.ok) throw new Error("Block failed");
    const resumed = await fixture.execution.transitionItem(
      "plan-1",
      blocked.plan.version,
      "item-1",
      "in_progress",
    );
    expect(resumed.ok && resumed.plan.items[0].status).toBe("in_progress");
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
      items: [{ status: "skipped", skipReason: "No longer required" }],
    });
  });
});
