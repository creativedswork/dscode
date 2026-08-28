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
  it("requires the recorded command exit code and expected output", async () => {
    const fixture = await createExecutionFixture({
      effectGrants: [{
        effect: "process",
        resourceScopes: [{ kind: "process_command", commandClass: "npm" }],
      }],
    });
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
      message: expect.stringContaining("exact persisted evidence IDs"),
    });
  });
});
