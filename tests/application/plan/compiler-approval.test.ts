import { rm } from "node:fs/promises";

import { afterEach, describe, expect, it } from "vitest";

import { PlannerService } from "../../../src/application/plan/index.js";
import { createExecutionFixture } from "./execution-helpers.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) =>
    rm(root, { recursive: true, force: true })
  ));
});

describe("Plan compilation and approval", () => {
  it("compiles ordered public items with canonical resource scopes", async () => {
    const fixture = await createExecutionFixture();
    roots.push(fixture.root);
    const item = fixture.awaiting.items[0];

    expect(item).toMatchObject({
      order: 0,
      status: "pending",
      acceptanceCriteria: [{ criterionId: "tests", kind: "command" }],
      effectGrants: [{
        effect: "workspace_write",
        resourceScopes: [{
          kind: "workspace_path",
          pattern: expect.stringMatching(/^\/.*\/src\/application\/plan\/\*\*$/),
        }],
      }],
      evidence: [],
      executionBindings: [],
    });
    expect(JSON.stringify(fixture.awaiting)).not.toMatch(
      /chain.of.thought|privateReasoning|hiddenPrompt/i,
    );
  });

  it("records acknowledgement and invalidates approval on semantic change", async () => {
    const fixture = await createExecutionFixture();
    roots.push(fixture.root);
    const approved = await fixture.approve();

    expect(approved).toMatchObject({
      status: "approved",
      approval: {
        revision: fixture.awaiting.revision,
        digest: fixture.awaiting.digest,
        approvedEffects: ["workspace_write"],
        acknowledgedSideEffects: ["workspace_write"],
        acknowledgementReceiptCommandId: "approve-1",
      },
    });
    expect(approved.commandReceipts).toContainEqual(expect.objectContaining({
      commandId: "approve-1",
      interactionId: "approval-1",
      result: { kind: "interaction_consumed", interactionId: "approval-1" },
    }));

    const changed = await fixture.store.update(
      approved.planId,
      approved.version,
      (draft) => { draft.goal = "Changed semantic goal"; },
    );
    expect(changed.ok && changed.plan).toMatchObject({
      revision: approved.revision + 1,
      approval: undefined,
    });
  });

  it("returns a typed stale rejection without consuming approval", async () => {
    const fixture = await createExecutionFixture();
    roots.push(fixture.root);
    const changed = await fixture.store.update(
      fixture.awaiting.planId,
      fixture.awaiting.version,
      (draft) => { draft.sideEffectSummary = "Expanded effects"; },
    );
    if (!changed.ok) throw new Error("Semantic update failed");

    const stale = await fixture.execution.approve({
      planId: fixture.awaiting.planId,
      expectedVersion: changed.plan.version,
      commandId: "stale-approval",
      interactionId: "approval-1",
      interactionPayloadDigest: fixture.awaiting.pendingInteraction!.payloadDigest,
      revision: fixture.awaiting.revision,
      digest: fixture.awaiting.digest,
      acknowledgedEffects: ["workspace_write"],
    });

    expect(stale).toMatchObject({ ok: false, reason: "stale_approval" });
    const loaded = await fixture.store.load(fixture.awaiting.planId);
    expect(loaded.ok && loaded.plan?.approval).toBeUndefined();
    expect(loaded.ok && loaded.plan?.commandReceipts).toEqual([]);
  });


  it("checks a new approval command's expected version before current status", async () => {
    const fixture = await createExecutionFixture();
    roots.push(fixture.root);
    const approved = await fixture.approve();

    const stale = await fixture.execution.approve({
      planId: approved.planId,
      expectedVersion: fixture.awaiting.version,
      commandId: "approve-after-v4",
      interactionId: "approval-1",
      interactionPayloadDigest: fixture.awaiting.pendingInteraction!.payloadDigest,
      revision: fixture.awaiting.revision,
      digest: fixture.awaiting.digest,
      acknowledgedEffects: ["workspace_write"],
    });

    expect(approved.version).toBe(4);
    expect(stale).toMatchObject({
      ok: false,
      reason: "conflict",
      plan: { version: 4, status: "approved" },
    });
  });

  it("rejects empty compiled plans at request and approval boundaries", async () => {
    const fixture = await createExecutionFixture();
    roots.push(fixture.root);
    const malformed = await fixture.store.update(
      fixture.awaiting.planId,
      fixture.awaiting.version,
      (draft) => {
        draft.status = "drafting";
        draft.pendingInteraction = undefined;
        draft.items = [];
        draft.sideEffectSummary = "";
      },
    );
    if (!malformed.ok) throw new Error("Malformed fixture failed");
    const planner = new PlannerService(fixture.store);
    await expect(planner.requestApproval(
      malformed.plan.planId,
      "planner-1",
      malformed.plan.version,
      "empty-approval",
    )).rejects.toThrow("at least one item");

    const waiting = await fixture.store.persistInteraction(
      malformed.plan.planId,
      malformed.plan.version,
      {
        interactionId: "empty-approval",
        kind: "approval",
        createdAt: 60,
        payload: { itemIds: [], effectCategories: [], sideEffectSummary: "" },
      },
      (draft) => { draft.status = "awaiting_approval"; },
    );
    if (!waiting.ok || !waiting.plan.pendingInteraction) {
      throw new Error("Approval fixture failed");
    }
    await expect(fixture.execution.approve({
      planId: waiting.plan.planId,
      expectedVersion: waiting.plan.version,
      commandId: "approve-empty",
      interactionId: "empty-approval",
      interactionPayloadDigest: waiting.plan.pendingInteraction.payloadDigest,
      revision: waiting.plan.revision,
      digest: waiting.plan.digest,
      acknowledgedEffects: [],
    })).resolves.toMatchObject({ ok: false, reason: "invalid_command" });
  });
});
