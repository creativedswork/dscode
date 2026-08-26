import { rm } from "node:fs/promises";

import { afterEach, describe, expect, it } from "vitest";

import { bindMain, createExecutionFixture } from "./execution-helpers.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) =>
    rm(root, { recursive: true, force: true })
  ));
});

describe("Plan evidence binding", () => {
  it("rejects evidence replayed across items", async () => {
    const criterion = {
      kind: "command" as const,
      criterionId: "tests",
      command: "npm test",
      expectedExitCode: 0,
      expectedOutput: "passed",
    };
    const grant = {
      effect: "process" as const,
      resourceScopes: [{ kind: "process_command" as const, commandClass: "npm" }],
    };
    const fixture = await createExecutionFixture({
      items: ["item-1", "item-2"].map((itemId) => ({
        itemId,
        title: itemId,
        description: itemId,
        dependsOn: [],
        acceptanceCriteria: [criterion],
        effectGrants: [grant],
      })),
    });
    roots.push(fixture.root);
    const approved = await fixture.approve();
    const first = await bindMain(fixture, approved.version);
    await fixture.execution.authorizeTool({
      binding: first.binding,
      toolCallId: "item-1-test",
      toolName: "bash",
      effect: "process",
      resourceScopes: [{ kind: "process_command", commandClass: "npm" }],
    });
    await fixture.execution.recordToolResult(
      first.binding,
      "item-1-test",
      "bash",
      { command: "npm test" },
      { details: { exitCode: 0 }, output: "passed" },
      false,
    );
    const current = await fixture.execution.load("plan-1");
    if (!current.ok || !current.plan) throw new Error("Plan missing");
    const second = await fixture.execution.bindItem({
      planId: "plan-1",
      expectedVersion: current.plan.version,
      revision: first.binding.revision,
      digest: first.binding.digest,
      itemId: "item-2",
      agentId: "main-1",
      role: "main",
    });
    if (!second.ok) throw new Error("Second bind failed");
    await expect(fixture.execution.verifyItem({
      planId: "plan-1",
      expectedVersion: second.plan.version,
      commandId: "cross-item",
      revision: first.binding.revision,
      digest: first.binding.digest,
      itemId: "item-2",
      callerAgentId: "main-1",
      criteria: [{
        criterionId: "tests",
        passed: true,
        evidenceIds: ["tool-item-1-test"],
      }],
    })).resolves.toMatchObject({ ok: false, reason: "invalid_command" });
  });
});
