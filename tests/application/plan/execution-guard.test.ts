import { rm } from "node:fs/promises";

import { afterEach, describe, expect, it, vi } from "vitest";

import type { AgentProcess } from "../../../src/agents/process/types.js";
import {
  ApprovedPlanExecutionGuard,
} from "../../../src/application/plan/index.js";
import { PermissionManager } from "../../../src/permissions/manager.js";
import { bindMain, createExecutionFixture } from "./execution-helpers.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) =>
    rm(root, { recursive: true, force: true })
  ));
});

async function setupGuard() {
  const fixture = await createExecutionFixture();
  roots.push(fixture.root);
  const approved = await fixture.approve();
  const bound = await bindMain(fixture, approved.version);
  const process = {
    agentId: "main-1",
    role: "main",
    context: {
      cwd: fixture.root,
      activePlan: {
        planId: bound.binding.planId,
        revision: bound.binding.revision,
        digest: bound.binding.digest,
      },
      planBinding: bound.binding,
    },
  } as unknown as AgentProcess;
  const guard = new ApprovedPlanExecutionGuard({
    service: () => fixture.execution,
    supervisor: () => ({ get: () => process }) as never,
  });
  return { ...fixture, bound, guard };
}

describe("Approved Plan execution guard", () => {
  it("records read-only results as evidence for the bound item", async () => {
    const fixture = await setupGuard();
    const call = { id: "read-1", name: "read_file" };

    await expect(fixture.guard.beforeToolCall(
      "main-1",
      { name: "read_file", effect: "read" },
      call,
      { path: "result.txt" },
    )).resolves.toBeUndefined();
    await fixture.guard.afterToolCall(
      "main-1",
      call,
      { content: [{ type: "text", text: "first line" }] },
      false,
    );

    const current = await fixture.execution.load("plan-1");
    expect(current.ok && current.plan?.schemaVersion === 2
      && current.plan.execution.steps[0].evidence).toMatchObject([{
      evidenceId: "tool-read-1",
      toolName: "read_file",
      acceptanceEligible: true,
      structuredOutcome: "success",
    }]);
  });

  it("does not let read evidence settle a concurrent side-effect tool", async () => {
    const fixture = await setupGuard();
    const write = { id: "write-running", name: "write_file" };
    const read = { id: "read-finished", name: "read_file" };
    await fixture.guard.beforeToolCall(
      "main-1",
      { name: "write_file", effect: "workspace_write" },
      write,
      { path: "src/application/plan/new.ts" },
    );
    await fixture.guard.beforeToolCall(
      "main-1",
      { name: "read_file", effect: "read" },
      read,
      { path: "src/application/plan/new.ts" },
    );
    await fixture.guard.afterToolCall(
      "main-1",
      read,
      { content: [{ type: "text", text: "current" }] },
      false,
    );
    expect(fixture.execution.hasInFlight("plan-1")).toBe(true);

    const current = await fixture.execution.load("plan-1");
    if (!current.ok || !current.plan) throw new Error("Plan missing");
    const cancelling = fixture.execution.cancel({
      planId: "plan-1",
      expectedVersion: current.plan.version,
      commandId: "cancel-with-write-running",
    });
    await vi.waitFor(async () => {
      const pending = await fixture.execution.load("plan-1");
      expect(pending.ok && pending.plan).toMatchObject({
        status: "executing",
        cancellation: { commandId: "cancel-with-write-running" },
      });
    });

    await fixture.guard.afterToolCall(
      "main-1",
      write,
      { details: { ok: true } },
      false,
    );
    await expect(cancelling).resolves.toMatchObject({
      ok: true,
      plan: { status: "cancelled" },
    });
  });

  it("checks Plan scope before preserving independent permission denial", async () => {
    const fixture = await setupGuard();
    const call = { id: "write-1", name: "write_file" };
    const planBlock = await fixture.guard.beforeToolCall(
      "main-1",
      { name: "write_file", effect: "workspace_write" },
      call,
      { path: "src/application/plan/new.ts" },
    );
    expect(planBlock).toBeUndefined();

    const prompt = vi.fn(async () => ({
      decision: "deny" as const,
      denyReason: "Denied independently",
    }));
    const permissions = new PermissionManager({
      defaultDecision: "deny",
      rules: [],
      denyPatterns: [],
    }, prompt);
    await expect(permissions.check({
      toolCall: call,
      args: { path: "src/application/plan/new.ts" },
    })).resolves.toMatchObject({ block: true });
    expect(prompt).toHaveBeenCalledOnce();
    await fixture.guard.releaseToolCall("main-1", call);
    const current = await fixture.execution.load("plan-1");
    if (!current.ok || !current.plan) throw new Error("Plan missing");
    await expect(fixture.execution.cancel({
      planId: "plan-1",
      expectedVersion: current.plan.version,
      commandId: "cancel-after-denial",
    }))
      .resolves.toMatchObject({ ok: true, plan: { status: "cancelled" } });
  });

  it.each([
    [
      "effect",
      { name: "web_fetch", effect: "network" as const },
      { url: "https://example.com" },
      "effect_mismatch",
    ],
    [
      "scope",
      { name: "write_file", effect: "workspace_write" as const },
      { path: "outside.txt" },
      "scope_mismatch",
    ],
    [
      "diagnostic process command",
      { name: "bash", effect: "process" as const },
      { command: "pwd" },
      "scope_mismatch",
    ],
    [
      "unknown MCP tool",
      undefined,
      { resourceId: "outside" },
      "effect_mismatch",
    ],
  ])("blocks %s expansion without inferring a material conflict", async (
    _label,
    tool,
    args,
    reason,
  ) => {
    const fixture = await setupGuard();
    const blocked = await fixture.guard.beforeToolCall(
      "main-1",
      tool,
      { id: `blocked-${_label}`, name: tool?.name ?? "mcp__server__unknown" },
      args,
    );

    expect(blocked?.reason).toContain(reason);
    const loaded = await fixture.store.load("plan-1");
    expect(loaded.ok && loaded.plan).toMatchObject({
      status: "executing",
      approval: {
        revision: fixture.bound.binding.revision,
        digest: fixture.bound.binding.digest,
      },
    });
  });

  it("completes the current item after blocking an unrelated diagnostic command", async () => {
    const fixture = await setupGuard();
    const diagnostic = await fixture.guard.beforeToolCall(
      "main-1",
      { name: "bash", effect: "process" },
      { id: "diagnostic-command", name: "bash" },
      { command: "pwd" },
    );
    expect(diagnostic?.reason).toContain("scope_mismatch");

    const acceptance = { id: "acceptance-command", name: "bash" };
    await expect(fixture.guard.beforeToolCall(
      "main-1",
      { name: "bash", effect: "process" },
      acceptance,
      { command: "npm test" },
    )).resolves.toBeUndefined();
    await fixture.guard.afterToolCall(
      "main-1",
      acceptance,
      { details: { exitCode: 0 }, output: "passed" },
      false,
    );

    const loaded = await fixture.store.load("plan-1");
    expect(loaded.ok && loaded.plan).toMatchObject({
      status: "completed",
      execution: { steps: [{
          status: "completed",
          evidence: [expect.objectContaining({
            toolCallId: "acceptance-command",
            acceptanceEligible: true,
          })],
        }] },
    });
  });

  it("rejects compound Bash without replanning the approved Plan", async () => {
    const fixture = await setupGuard();
    const blocked = await fixture.guard.beforeToolCall(
      "main-1",
      { name: "bash", effect: "process" },
      { id: "compound-command", name: "bash" },
      { command: "npm test && npm run typecheck" },
    );

    expect(blocked?.reason).toContain("invalid_command");
    expect(blocked?.reason).toContain("npm test");
    const loaded = await fixture.store.load("plan-1");
    expect(loaded.ok && loaded.plan).toMatchObject({
      status: "executing",
      approval: {
        revision: fixture.bound.binding.revision,
        digest: fixture.bound.binding.digest,
      },
    });

    const retry = { id: "exact-command", name: "bash" };
    await expect(fixture.guard.beforeToolCall(
      "main-1",
      { name: "bash", effect: "process" },
      retry,
      { command: "npm test" },
    )).resolves.toBeUndefined();
    await fixture.guard.afterToolCall(
      "main-1",
      retry,
      { details: { exitCode: 0 }, output: "passed" },
      false,
    );
    const retried = await fixture.store.load("plan-1");
    expect(retried.ok && retried.plan?.schemaVersion === 2
      && retried.plan.execution.steps[0].evidence).toMatchObject([{
      toolCallId: "exact-command",
      command: "npm test",
      acceptanceEligible: true,
    }]);
  });
});
