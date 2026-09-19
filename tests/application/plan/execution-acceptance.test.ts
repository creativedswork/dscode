import { rm } from "node:fs/promises";

import { afterEach, describe, expect, it } from "vitest";

import { bindMain, createExecutionFixture } from "./execution-helpers.js";
import { planExecutionUnits } from "../../../src/application/plan/index.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) =>
    rm(root, { recursive: true, force: true })
  ));
});

describe("Plan evidence and acceptance", () => {
  it("keeps Agent exit out of Plan evidence without completing the item", async () => {
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

    expect(loaded.ok && loaded.plan && planExecutionUnits(loaded.plan)[0]).toMatchObject({
      status: "in_progress",
      evidence: [],
    });
    expect(loaded.ok && loaded.plan?.version).toBe(plan.version);
  });

  it("auto-completes an item after Main command evidence passes", async () => {
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
    expect(withEvidence.plan).toMatchObject({
      status: "completed",
      execution: { steps: [{ status: "completed" }] },
    });
  });

  it("rejects observable business errors and command output mismatches", async () => {
    const fixture = await createExecutionFixture({
      verifications: [{
        kind: "observable",
        verificationId: "observable",
        description: "Operation succeeded",
        toolName: "write_file",
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
        pattern: plan.executionSteps[0].effectGrants[0].resourceScopes[0].kind === "workspace_path"
          ? plan.executionSteps[0].effectGrants[0].resourceScopes[0].pattern.replace(/\*\*$/, "file.ts")
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

  it("requires observable evidence from the declared tool", async () => {
    const fixture = await createExecutionFixture({
      verifications: [{
        kind: "observable",
        verificationId: "rendered",
        description: "The rendered output is visible",
        toolName: "write_file",
      }],
    });
    roots.push(fixture.root);
    const approved = await fixture.approve();
    const { binding } = await bindMain(fixture, approved.version);
    await fixture.execution.recordToolResult(
      binding,
      "read-result",
      "read_file",
      { path: "result.html" },
      { content: [{ type: "text", text: "read" }] },
      false,
      "read",
    );
    let current = await fixture.execution.load("plan-1");
    if (!current.ok || !current.plan) throw new Error("Plan missing");
    expect(current.plan).toMatchObject({
      status: "executing",
      execution: { steps: [{ status: "in_progress" }] },
    });

    await fixture.execution.recordToolResult(
      binding,
      "write-result",
      "write_file",
      { path: "result.html" },
      { details: { ok: true } },
      false,
      "workspace_write",
    );
    current = await fixture.execution.load("plan-1");
    if (!current.ok || !current.plan) throw new Error("Plan missing");
    expect(current.plan).toMatchObject({
      status: "completed",
      execution: { steps: [{ status: "completed" }] },
    });
  });

});
