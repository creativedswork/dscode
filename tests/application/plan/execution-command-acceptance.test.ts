import { rm } from "node:fs/promises";

import { afterEach, describe, expect, it } from "vitest";

import { bindMain, createExecutionFixture } from "./execution-helpers.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) =>
    rm(root, { recursive: true, force: true })
  ));
});

describe("Plan command acceptance", () => {
  it("accepts an expected nonzero exit code", async () => {
    const command = "grep -q -- external index.html";
    const fixture = await createExecutionFixture({
      verifications: [{
        kind: "command",
        verificationId: "no-external-refs",
        description: "No external references",
        command,
        expect: { exitCode: 1 },
      }],
    });
    roots.push(fixture.root);
    const approved = await fixture.approve();
    const { binding } = await bindMain(fixture, approved.version);
    await fixture.execution.authorizeTool({
      binding,
      toolCallId: "expected-no-match",
      toolName: "bash",
      effect: "process",
      resourceScopes: [{ kind: "process_command", commandClass: "grep" }],
    });
    await fixture.execution.recordToolResult(
      binding,
      "expected-no-match",
      "bash",
      { command },
      { details: { exitCode: 1, error: true }, output: "" },
      false,
    );
    const current = await fixture.execution.load("plan-1");
    if (!current.ok || !current.plan) throw new Error("Plan missing");
    expect(current.plan).toMatchObject({
      status: "completed",
      execution: { steps: [{ status: "completed" }] },
    });
  });

  it("keeps schema v2 verification Host-owned after evidence mismatch", async () => {
    const fixture = await createExecutionFixture();
    roots.push(fixture.root);
    const approved = await fixture.approve();
    const { binding } = await bindMain(fixture, approved.version);
    await fixture.execution.authorizeTool({
      binding,
      toolCallId: "wrong-output",
      toolName: "bash",
      effect: "process",
      resourceScopes: [{ kind: "process_command", commandClass: "npm" }],
    });
    await fixture.execution.recordToolResult(
      binding,
      "wrong-output",
      "bash",
      { command: "npm test" },
      { details: { exitCode: 0 }, output: "no tests ran" },
      false,
    );
    const current = await fixture.execution.load("plan-1");
    if (!current.ok || !current.plan) throw new Error("Plan missing");

    await expect(fixture.execution.verifyItem({
      planId: "plan-1",
      expectedVersion: current.plan.version,
      commandId: "verify-wrong-output",
      revision: binding.revision,
      digest: binding.digest,
      itemId: "item-1",
      callerAgentId: "main-1",
      criteria: [{
        criterionId: "tests",
        passed: true,
        evidenceIds: ["tool-wrong-output"],
        observedExitCode: 0,
      }],
    })).resolves.toMatchObject({
      ok: false,
      reason: "invalid_command",
      message: expect.stringContaining("Host-owned"),
    });
  });

  it("rejects an unknown compatibility evidence ID instead of falling back", async () => {
    const fixture = await createExecutionFixture();
    roots.push(fixture.root);
    const approved = await fixture.approve();
    const { binding, plan } = await bindMain(fixture, approved.version);
    const persisted = await fixture.store.update(
      "plan-1",
      plan.version,
      (draft) => {
        draft.execution.steps[0].evidence.push({
          kind: "tool_result",
          evidenceId: "tool-passed",
          planId: "plan-1",
          revision: binding.revision,
          itemId: "item-1",
          toolCallId: "passed",
          toolName: "bash",
          isError: false,
          exitCode: 0,
          command: "npm test",
          acceptanceEligible: true,
          output: "passed",
          structuredOutcome: "success",
          summary: "passed",
          recordedAt: 100,
        });
      },
    );
    if (!persisted.ok) throw new Error("Evidence persistence failed");

    await expect(fixture.execution.verifyItem({
      planId: "plan-1",
      expectedVersion: persisted.plan.version,
      commandId: "verify-missing-evidence",
      revision: binding.revision,
      digest: binding.digest,
      itemId: "item-1",
      callerAgentId: "main-1",
      criteria: [{
        criterionId: "tests",
        passed: true,
        evidenceIds: ["tool-missing"],
      }],
    })).resolves.toMatchObject({
      ok: false,
      reason: "invalid_command",
    });
  });
});
