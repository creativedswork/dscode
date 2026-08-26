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
      { name: "bash", effect: "process" as const },
      { command: "npm test" },
      "effect_mismatch",
    ],
    [
      "scope",
      { name: "write_file", effect: "workspace_write" as const },
      { path: "outside.txt" },
      "scope_mismatch",
    ],
    [
      "unknown MCP tool",
      undefined,
      { resourceId: "outside" },
      "effect_mismatch",
    ],
  ])("blocks %s expansion and enters needs_replan", async (
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
    expect(loaded.ok && loaded.plan?.status).toBe("needs_replan");
    expect(loaded.ok && loaded.plan?.approval).toBeUndefined();
  });
});
