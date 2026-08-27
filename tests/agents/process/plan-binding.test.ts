import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { compileAgentDefinition } from "../../../src/agents/definitions/compiler.js";
import { createMainAgentContext } from "../../../src/agents/process/context.js";
import { AgentProcessStore } from "../../../src/agents/process/store.js";
import { AgentSupervisor } from "../../../src/agents/process/supervisor.js";
import type {
  AgentProcessInput,
  AgentProcessOutput,
  AgentProcessRuntime,
} from "../../../src/agents/runtimes/runtime.js";
import { HarnessEventBus } from "../../../src/application/events.js";
import {
  ApprovedPlanExecutionGuard,
  bindPlanItemToAgent,
  PlannerProcessCoordinator,
} from "../../../src/application/plan/index.js";
import { createTestPlanService } from "../../application/plan/plan-service-fixture.js";
import { createExecutionFixture } from "../../application/plan/execution-helpers.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) =>
    rm(root, { recursive: true, force: true })
  ));
});

class ImmediateRuntime implements AgentProcessRuntime {
  readonly capabilities = { suspend: false, messaging: false };

  async start(): Promise<AgentProcessOutput> {
    return { text: "completed" };
  }

  async terminate(): Promise<void> {}
  kill(): void {}
}

class WaitingRuntime implements AgentProcessRuntime {
  readonly capabilities = { suspend: false, messaging: false };

  async start(
    input: AgentProcessInput,
    signal: AbortSignal,
  ): Promise<AgentProcessOutput> {
    await input.onStateChange?.("waiting");
    return new Promise((_resolve, reject) => {
      signal.addEventListener("abort", () => {
        reject(new DOMException("Aborted", "AbortError"));
      }, { once: true });
    });
  }

  async terminate(): Promise<void> {}
  kill(): void {}
}

describe("AgentSupervisor Plan bindings", () => {
  it("derives a distinct SubAgent binding from the bound Main process", async () => {
    const root = await mkdtemp(join(tmpdir(), "dscode-plan-binding-"));
    roots.push(root);
    const mainApplication = compileAgentDefinition({
      name: "main",
      description: "main",
      systemPrompt: "main",
      permissionMode: "default",
    }, { kind: "internal", path: "test:main" }, 1);
    const childApplication = compileAgentDefinition({
      name: "worker",
      description: "worker",
      systemPrompt: "worker",
      permissionMode: "default",
      tools: ["read_file", "write_file"],
    }, { kind: "internal", path: "test:worker" }, 1);
    const applications = new Map([
      ["main", mainApplication],
      ["worker", childApplication],
    ]);
    const logger = { error: vi.fn() };
    const supervisor = new AgentSupervisor(
      {
        require(name: string) {
          const application = applications.get(name);
          if (!application) throw new Error(`Unknown application: ${name}`);
          return application;
        },
        list: () => [...applications.values()],
      } as never,
      () => new ImmediateRuntime(),
      new AgentProcessStore(root, root),
      new HarnessEventBus(logger as never),
      logger as never,
      () => [
        { name: "read_file", effect: "read" },
        { name: "write_file", effect: "workspace_write" },
      ],
    );
    const main = supervisor.registerMain(
      mainApplication,
      new ImmediateRuntime(),
      createMainAgentContext(root, "session-1", ["read_file"]),
    );
    bindPlanItemToAgent(main, {
      agentId: main.agentId,
      role: "main",
      planId: "plan-1",
      revision: 2,
      digest: "a".repeat(64),
      itemId: "item-1",
      boundAt: 10,
    });

    const spawned = await supervisor.spawn({
      application: "worker",
      parentAgentId: main.agentId,
      input: { prompt: "work" },
    });
    const child = supervisor.require(spawned.agentId);

    expect(child.context.activePlan).toEqual(main.context.activePlan);
    expect(child.context.planBinding).toMatchObject({
      agentId: child.agentId,
      role: "subagent",
      planId: "plan-1",
      revision: 2,
      digest: "a".repeat(64),
      itemId: "item-1",
    });
    expect(child.context.planBinding?.agentId).not.toBe(main.agentId);
  });

  it("authorizes a child tool through its inherited production binding", async () => {
    const execution = await createExecutionFixture();
    roots.push(execution.root);
    const root = await mkdtemp(join(tmpdir(), "dscode-plan-child-tool-"));
    roots.push(root);
    const mainApplication = compileAgentDefinition({
      name: "main",
      description: "main",
      systemPrompt: "main",
      permissionMode: "default",
    }, { kind: "internal", path: "test:main" }, 1);
    const childApplication = compileAgentDefinition({
      name: "worker",
      description: "worker",
      systemPrompt: "worker",
      permissionMode: "default",
      tools: ["write_file"],
    }, { kind: "internal", path: "test:worker" }, 1);
    const applications = new Map([
      ["main", mainApplication],
      ["worker", childApplication],
    ]);
    const logger = { error: vi.fn() };
    const supervisor = new AgentSupervisor(
      {
        require: (name: string) => applications.get(name)!,
        list: () => [...applications.values()],
      } as never,
      () => new WaitingRuntime(),
      new AgentProcessStore(root, execution.root),
      new HarnessEventBus(logger as never),
      logger as never,
      () => [{ name: "write_file", effect: "workspace_write" }],
    );
    const main = supervisor.registerMain(
      mainApplication,
      new ImmediateRuntime(),
      createMainAgentContext(execution.root, "session-1", ["write_file"]),
    );
    const approved = await execution.approve();
    const coordinator = new PlannerProcessCoordinator(
      supervisor,
      createTestPlanService(execution.store),
    );
    const bound = await coordinator.execution.bindItem({
      planId: "plan-1",
      expectedVersion: approved.version,
      revision: approved.revision,
      digest: approved.digest,
      itemId: "item-1",
      agentId: main.agentId,
      role: "main",
    });
    if (!bound.ok) throw new Error("Main bind failed");
    const mainBinding = bound.plan.items[0].executionBindings?.[0];
    if (!mainBinding) throw new Error("Main binding missing");
    bindPlanItemToAgent(main, mainBinding);
    const spawned = await supervisor.spawn({
      application: "worker",
      parentAgentId: main.agentId,
      attachment: "background",
      input: { prompt: "work" },
    });
    const child = supervisor.require(spawned.agentId);
    const guard = new ApprovedPlanExecutionGuard({
      service: () => coordinator.execution,
      supervisor: () => supervisor,
    });
    const blocked = await guard.beforeToolCall(
      spawned.agentId,
      { name: "write_file", effect: "workspace_write" },
      { id: "child-write", name: "write_file" },
      { path: "src/application/plan/child.ts" },
    );
    expect(blocked).toBeUndefined();
    await guard.afterToolCall(
      spawned.agentId,
      { id: "child-write", name: "write_file" },
      { details: { ok: true } },
      false,
    );
    const loaded = await execution.store.load("plan-1");
    expect(loaded.ok && loaded.plan?.items[0].executionBindings)
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ agentId: spawned.agentId, role: "subagent" }),
      ]));
    if (!loaded.ok || !loaded.plan) throw new Error("Plan missing");
    const cancelled = await coordinator.execution.cancel({
      planId: "plan-1",
      expectedVersion: loaded.plan.version,
      commandId: "terminal-cleanup",
    });
    expect(cancelled.ok && cancelled.plan.status).toBe("cancelled");
    expect(child.state).toBe("terminated");
    expect(child.context.activePlan).toBeUndefined();
    expect(child.context.planBinding).toBeUndefined();
    expect(main.context.activePlan).toBeUndefined();
    expect(main.context.planBinding).toBeUndefined();
  });
});
