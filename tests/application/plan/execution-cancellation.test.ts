import { rm } from "node:fs/promises";

import { afterEach, describe, expect, it, vi } from "vitest";

import { bindMain, createExecutionFixture } from "./execution-helpers.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) =>
    rm(root, { recursive: true, force: true })
  ));
});

describe("Plan execution cancellation", () => {
  it("binds concurrent cancellation to the accepted request token", async () => {
    const fixture = await createExecutionFixture();
    roots.push(fixture.root);
    const approved = await fixture.approve();
    const { binding, plan } = await bindMain(fixture, approved.version);
    const scope = plan.items[0].effectGrants[0].resourceScopes[0];
    if (scope.kind !== "workspace_path") throw new Error("Workspace scope missing");
    await fixture.execution.authorizeTool({
      binding,
      toolCallId: "cancelled-call",
      toolName: "write_file",
      effect: "workspace_write",
      resourceScopes: [{
        kind: "workspace_path",
        pattern: scope.pattern.replace(/\*\*$/, "file.ts"),
      }],
    });
    let settled = 0;
    const command = {
      planId: "plan-1",
      expectedVersion: plan.version,
      commandId: "cancel-executing",
    };
    const cancelling = fixture.execution.cancel(command).then((result) => {
      settled++;
      return result;
    });
    const duplicate = fixture.execution.cancel(command).then((result) => {
      settled++;
      return result;
    });
    await vi.waitFor(async () => {
      const current = await fixture.execution.load("plan-1");
      expect(current.ok && current.plan?.cancellation).toMatchObject({
        commandId: command.commandId,
        expectedVersion: command.expectedVersion,
      });
    });
    await expect(fixture.execution.cancel({
      ...command,
      commandId: "different-stale-cancel",
    })).resolves.toMatchObject({ ok: false, reason: "conflict" });
    expect(settled).toBe(0);

    await fixture.execution.recordToolResult(
      binding,
      "cancelled-call",
      "write_file",
      { path: "src/application/plan/file.ts" },
      { details: { ok: true } },
      false,
    );
    await expect(cancelling).resolves.toMatchObject({
      ok: true,
      plan: {
        status: "cancelled",
        cancellation: {
          commandId: command.commandId,
          expectedVersion: command.expectedVersion,
        },
      },
    });
    await expect(duplicate).resolves.toMatchObject({
      ok: true,
      plan: { status: "cancelled" },
    });
    expect(settled).toBe(2);
  });

  it("rejects a stale in-flight cancellation without registering it", async () => {
    const fixture = await createExecutionFixture();
    roots.push(fixture.root);
    const approved = await fixture.approve();
    const { binding, plan } = await bindMain(fixture, approved.version);
    const scope = plan.items[0].effectGrants[0].resourceScopes[0];
    if (scope.kind !== "workspace_path") throw new Error("Workspace scope missing");
    await fixture.execution.authorizeTool({
      binding,
      toolCallId: "still-running",
      toolName: "write_file",
      effect: "workspace_write",
      resourceScopes: [{
        kind: "workspace_path",
        pattern: scope.pattern.replace(/\*\*$/, "file.ts"),
      }],
    });
    await fixture.execution.recordProgress(binding, "work", "version advanced");

    await expect(fixture.execution.cancel({
      planId: "plan-1",
      expectedVersion: plan.version,
      commandId: "stale-cancel",
    })).resolves.toMatchObject({ ok: false, reason: "conflict" });
    const current = await fixture.execution.load("plan-1");
    expect(current.ok && current.plan?.status).toBe("executing");
    expect(current.ok && current.plan?.cancellation).toBeUndefined();
    await fixture.execution.recordToolResult(
      binding,
      "still-running",
      "write_file",
      { path: "src/application/plan/file.ts" },
      { details: { ok: true } },
      false,
    );
    const settled = await fixture.execution.load("plan-1");
    expect(settled.ok && settled.plan?.status).toBe("executing");
  });
});
