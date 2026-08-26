import { rm } from "node:fs/promises";

import { afterEach, describe, expect, it } from "vitest";

import { bindMain, createExecutionFixture } from "./execution-helpers.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) =>
    rm(root, { recursive: true, force: true })
  ));
});

describe("Plan evidence and acceptance", () => {
  it("keeps Agent exit as evidence without completing the item", async () => {
    const fixture = await createExecutionFixture();
    roots.push(fixture.root);
    const approved = await fixture.approve();
    const { binding, plan } = await bindMain(fixture, approved.version);

    await fixture.execution.recordExit(binding, {
      agentId: "main-1",
      state: "completed",
      output: "Implementation finished",
      startedAt: 90,
      endedAt: 100,
    });
    const loaded = await fixture.store.load("plan-1");

    expect(loaded.ok && loaded.plan?.items[0]).toMatchObject({
      status: "in_progress",
      evidence: [{
        kind: "agent_exit",
        outcome: "completed",
        acceptanceEligible: true,
      }],
    });
    expect(loaded.ok && loaded.plan?.version).toBe(plan.version + 1);
  });

  it("allows only Main to complete an item after command evidence passes", async () => {
    const fixture = await createExecutionFixture({
      effectGrants: [{
        effect: "process",
        resourceScopes: [{ kind: "process_command", commandClass: "npm" }],
      }],
    });
    roots.push(fixture.root);
    const approved = await fixture.approve();
    const { binding } = await bindMain(fixture, approved.version);
    const authorized = await fixture.execution.authorizeTool({
      binding,
      toolCallId: "test-command",
      toolName: "bash",
      effect: "process",
      resourceScopes: [{ kind: "process_command", commandClass: "npm" }],
    });
    expect(authorized.ok).toBe(true);
    await fixture.execution.recordToolResult(
      binding,
      "test-command",
      "bash",
      { command: "npm test" },
      { details: { exitCode: 0 }, output: "passed" },
      false,
    );
    const withEvidence = await fixture.execution.load("plan-1");
    if (!withEvidence.ok || !withEvidence.plan) throw new Error("Plan missing");
    const command = {
      planId: "plan-1",
      expectedVersion: withEvidence.plan.version,
      commandId: "verify-1",
      revision: binding.revision,
      digest: binding.digest,
      itemId: "item-1",
      callerAgentId: "subagent-1",
      criteria: [{
        criterionId: "tests",
        passed: true,
        evidenceIds: ["tool-test-command"],
        observedExitCode: 0,
      }],
    };

    await expect(fixture.execution.verifyItem(command)).resolves.toMatchObject({
      ok: false,
      reason: "invalid_command",
    });
    const verified = await fixture.execution.verifyItem({
      ...command,
      expectedVersion: withEvidence.plan.version,
      commandId: "verify-2",
      callerAgentId: "main-1",
    });
    expect(verified.ok && verified.plan).toMatchObject({
      status: "completed",
      items: [{ status: "completed" }],
    });
  });

  it("requires a consumed human receipt for human acceptance", async () => {
    const fixture = await createExecutionFixture({
      acceptanceCriteria: [{
        kind: "human",
        criterionId: "human-check",
        prompt: "Confirm behavior",
      }],
    });
    roots.push(fixture.root);
    const approved = await fixture.approve();
    const { binding, plan } = await bindMain(fixture, approved.version);
    const pending = await fixture.execution.requestHumanAcceptance(
      binding,
      plan.version,
      "human-check",
      "human-interaction-1",
    );
    if (!pending.ok || !pending.plan.pendingInteraction) {
      throw new Error("Human acceptance interaction failed");
    }
    await expect(fixture.execution.recordHumanAcceptance({
      planId: binding.planId,
      expectedVersion: pending.plan.version,
      commandId: "human-1",
      interactionId: "human-interaction-1",
      interactionPayloadDigest: pending.plan.pendingInteraction.payloadDigest,
      revision: binding.revision,
      digest: binding.digest,
      itemId: binding.itemId,
      criterionId: "human-check",
      callerAgentId: "main-1",
      summary: "User accepted the observed behavior",
    })).resolves.toMatchObject({ ok: true });
    const current = await fixture.execution.load("plan-1");
    if (!current.ok || !current.plan) throw new Error("Plan missing");

    const verified = await fixture.execution.verifyItem({
      planId: "plan-1",
      expectedVersion: current.plan.version,
      commandId: "verify-human",
      revision: binding.revision,
      digest: binding.digest,
      itemId: "item-1",
      callerAgentId: "main-1",
      criteria: [{
        criterionId: "human-check",
        passed: true,
        evidenceIds: ["human-human-1"],
        humanReceiptCommandId: "human-1",
      }],
    });

    expect(plan.status).toBe("executing");
    expect(verified.ok && verified.plan.status).toBe("completed");
  });

  it("does not accept the approval receipt as human acceptance", async () => {
    const fixture = await createExecutionFixture({
      acceptanceCriteria: [{
        kind: "human",
        criterionId: "human-check",
        prompt: "Confirm behavior",
      }],
    });
    roots.push(fixture.root);
    const approved = await fixture.approve();
    const { binding, plan } = await bindMain(fixture, approved.version);
    const pending = await fixture.execution.requestHumanAcceptance(
      binding,
      plan.version,
      "human-check",
      "human-interaction-reuse",
    );
    if (!pending.ok || !pending.plan.pendingInteraction) {
      throw new Error("Human acceptance interaction failed");
    }

    await expect(fixture.execution.recordHumanAcceptance({
      planId: binding.planId,
      expectedVersion: pending.plan.version,
      commandId: "approve-1",
      interactionId: "human-interaction-reuse",
      interactionPayloadDigest: pending.plan.pendingInteraction.payloadDigest,
      revision: binding.revision,
      digest: binding.digest,
      itemId: binding.itemId,
      criterionId: "human-check",
      callerAgentId: "main-1",
      summary: "Reused approval",
    })).resolves.toMatchObject({ ok: false, reason: "invalid_command" });
  });

  it("rejects observable business errors and command output mismatches", async () => {
    const fixture = await createExecutionFixture({
      acceptanceCriteria: [{
        kind: "observable",
        criterionId: "observable",
        description: "Operation succeeded",
      }],
    });
    roots.push(fixture.root);
    const approved = await fixture.approve();
    const { binding, plan } = await bindMain(fixture, approved.version);
    await fixture.execution.authorizeTool({
      binding,
      toolCallId: "business-error",
      toolName: "write_file",
      effect: "workspace_write",
      resourceScopes: [{
        kind: "workspace_path",
        pattern: plan.items[0].effectGrants[0].resourceScopes[0].kind === "workspace_path"
          ? plan.items[0].effectGrants[0].resourceScopes[0].pattern.replace(/\*\*$/, "file.ts")
          : "",
      }],
    });
    await fixture.execution.recordToolResult(
      binding,
      "business-error",
      "write_file",
      { path: "src/application/plan/file.ts" },
      { details: { error: "write_rejected" } },
      false,
    );
    const current = await fixture.execution.load("plan-1");
    if (!current.ok || !current.plan) throw new Error("Plan missing");
    await expect(fixture.execution.verifyItem({
      planId: binding.planId,
      expectedVersion: current.plan.version,
      commandId: "verify-business-error",
      revision: binding.revision,
      digest: binding.digest,
      itemId: binding.itemId,
      callerAgentId: "main-1",
      criteria: [{
        criterionId: "observable",
        passed: true,
        evidenceIds: ["tool-business-error"],
        observed: { matched: true, description: "Tool returned" },
      }],
    })).resolves.toMatchObject({ ok: false, reason: "invalid_command" });
  });

});
