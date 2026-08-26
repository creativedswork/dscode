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
import { ConversationCoordinator } from "../../../src/application/conversation-coordinator.js";
import { HarnessEventBus } from "../../../src/application/events.js";
import {
  PLANNER_APPLICATION,
  PLANNER_TOOL_CAPABILITIES,
  PlanStore,
  PlannerProcessCoordinator,
  PlannerService,
} from "../../../src/application/plan/index.js";
import { SessionCoordinator } from "../../../src/application/session-coordinator.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) =>
    rm(root, { recursive: true, force: true })
  ));
});

class IdleRuntime implements AgentProcessRuntime {
  readonly capabilities = { suspend: false, messaging: false };

  async start(
    input: AgentProcessInput,
    signal: AbortSignal,
  ): Promise<AgentProcessOutput> {
    await input.onStateChange?.("waiting");
    return new Promise((_resolve, reject) => {
      const abort = () => reject(new DOMException("Aborted", "AbortError"));
      signal.addEventListener("abort", abort, { once: true });
      if (signal.aborted) abort();
    });
  }

  async terminate(): Promise<void> {}
  kill(): void {}
}

async function setup() {
  const root = await mkdtemp(join(tmpdir(), "dscode-planner-review-"));
  roots.push(root);
  const mainApplication = compileAgentDefinition({
    name: "main",
    description: "main",
    systemPrompt: "main",
    permissionMode: "default",
  }, { kind: "internal", path: "test:main" }, 1);
  const plannerApplication = compileAgentDefinition(
    PLANNER_APPLICATION,
    { kind: "internal", path: "programmatic:planner" },
    1,
  );
  const applications = new Map([
    ["main", mainApplication],
    ["planner", plannerApplication],
  ]);
  const logger = { error: vi.fn(), info: vi.fn() };
  const supervisor = new AgentSupervisor(
    {
      require(name: string) {
        const application = applications.get(name);
        if (!application) throw new Error(`Unknown application: ${name}`);
        return application;
      },
      list: () => [...applications.values()],
    } as never,
    () => new IdleRuntime(),
    new AgentProcessStore(root, "/project"),
    new HarnessEventBus(logger as never),
    logger as never,
    () => [
      { name: "read_file", effect: "read" as const },
      ...PLANNER_TOOL_CAPABILITIES,
    ],
  );
  const main = supervisor.registerMain(
    mainApplication,
    new IdleRuntime(),
    createMainAgentContext("/project", "SOURCE", ["read_file"]),
  );
  const store = new PlanStore({ dataDir: root, projectPath: "/project" });
  const service = new PlannerService(store, () => 100);
  const coordinator = new PlannerProcessCoordinator(supervisor, service);
  const handle = await coordinator.start(main.agentId, {
    requestId: "request-1",
    requestText: "Plan safely",
    decision: {
      requestId: "request-1",
      route: "plan",
      source: "explicit",
    },
  });
  return { coordinator, handle, logger, main, service, store, supervisor };
}

describe("Planner final reviewer regressions", () => {
  it("settles an active Planner before a real Session rebind", async () => {
    const fixture = await setup();
    const loaded = await fixture.store.load(fixture.handle.planId);
    if (!loaded.ok || !loaded.plan) throw new Error("plan missing");
    const appended = await fixture.service.appendDecision(
      fixture.handle.planId,
      fixture.handle.plannerAgentId,
      loaded.plan.version,
      {
        decisionNodeId: "choice",
        question: "Choose",
        candidates: [{
          optionId: "a",
          summary: "A",
          affectedScopes: ["src"],
          evidence: [],
          risks: [],
          cost: "low",
          reversibility: "reversible",
          constraintFit: "uncertain",
          recommended: true,
          rationale: "A",
        }],
      },
    );
    if (!appended.ok) throw new Error("append failed");
    await fixture.service.requestDecision(
      fixture.handle.planId,
      fixture.handle.plannerAgentId,
      appended.plan.version,
      "interaction-1",
      "choice",
    );
    const waiter = fixture.coordinator.interactions.wait("interaction-1");
    const rejected = expect(waiter).rejects.toThrow("Aborted");
    let currentSessionId = "SOURCE";
    const target = {
      id: "TARGET",
      title: "target",
      createdAt: 1,
      updatedAt: 1,
      modelProvider: "test",
      modelId: "test",
      messageCount: 0,
      projectPath: "/project",
      preview: "",
      hasImages: false,
      imageCount: 0,
      totalActiveMs: 0,
      contentHash: "",
    };
    const sessions = new SessionCoordinator({
      sessionManager: {
        listSessions: () => [target],
        listAllSessions: () => [target],
        getCurrentSessionId: () => currentSessionId,
        getCurrentMetadata: () => target,
        prepareLoad: async () => ({
          id: target.id,
          metadata: target,
          messages: [],
          agentMessages: [],
        }),
        saveSession: vi.fn(),
        commitPreparedLoad: () => { currentSessionId = target.id; },
        trySaveSession: vi.fn(),
      } as never,
      agentSupervisor: () => fixture.supervisor,
      mainAgentId: () => fixture.main.agentId,
      agent: () => ({ state: { messages: [] } }) as never,
      projectPath: () => "/project",
      abort: vi.fn(),
      settleForeground: () => fixture.coordinator.shutdown(),
      conversation: new ConversationCoordinator(),
      logger: fixture.logger as never,
    });

    await expect(sessions.switch({ sessionIdOrPrefix: "TARGET" })).resolves
      .toMatchObject({ session: target });
    await rejected;
    expect(fixture.main.state).toBe("running");
    expect(fixture.supervisor.foreground("SOURCE")).toBeUndefined();
    expect(fixture.supervisor.foreground("TARGET")?.agentId)
      .toBe(fixture.main.agentId);
    expect(fixture.supervisor.require(fixture.handle.plannerAgentId).exit)
      .toMatchObject({ state: "terminated" });
    await expect(fixture.coordinator.shutdown()).resolves.toBeUndefined();
  });

  it("rejects decisions without an active Planner binding", async () => {
    const fixture = await setup();
    await fixture.coordinator.shutdown();
    const loaded = await fixture.store.load(fixture.handle.planId);
    if (!loaded.ok || !loaded.plan) throw new Error("plan missing");
    await expect(fixture.coordinator.submitDecision({
      planId: fixture.handle.planId,
      expectedVersion: loaded.plan.version,
      commandId: "stale-command",
      action: {
        kind: "investigate",
        decisionNodeId: "missing",
      },
    })).rejects.toThrow("Active Planner not found");
  });

  it("does not let a Planner revive a terminal Plan", async () => {
    const fixture = await setup();
    const loaded = await fixture.store.load(fixture.handle.planId);
    if (!loaded.ok || !loaded.plan) throw new Error("plan missing");
    const failed = await fixture.store.update(
      fixture.handle.planId,
      loaded.plan.version,
      (draft) => { draft.status = "failed"; },
    );
    if (!failed.ok) throw new Error("terminal fixture failed");

    await expect(fixture.service.applyDecision({
      planId: fixture.handle.planId,
      plannerAgentId: fixture.handle.plannerAgentId,
      expectedVersion: failed.plan.version,
      commandId: "revive",
      action: {
        kind: "investigate",
        decisionNodeId: "missing",
      },
    })).rejects.toThrow("in status failed");
    const after = await fixture.store.load(fixture.handle.planId);
    expect(after.ok && after.plan).toMatchObject({
      status: "failed",
      version: failed.plan.version,
    });
    await fixture.coordinator.shutdown();
  });

  it("cleans coordinator maps even when foreground restore fails", async () => {
    const fixture = await setup();
    fixture.main.parentSessionId = "OTHER";

    await expect(fixture.coordinator.shutdown()).rejects.toThrow(
      "Foreground processes must share a parent Session",
    );
    expect(() =>
      fixture.coordinator.planIdForPlanner(fixture.handle.plannerAgentId)
    ).toThrow("not bound");
    await expect(fixture.coordinator.shutdown()).resolves.toBeUndefined();

    fixture.main.parentSessionId = "SOURCE";
    await fixture.supervisor.restoreForeground(
      fixture.handle.plannerAgentId,
      fixture.main.agentId,
    );
    const restarted = await fixture.coordinator.start(fixture.main.agentId, {
      requestId: "request-2",
      requestText: "Plan again",
      decision: {
        requestId: "request-2",
        route: "plan",
        source: "explicit",
      },
    });
    expect(restarted.plannerAgentId).not.toBe(fixture.handle.plannerAgentId);
    await fixture.coordinator.shutdown();
  });
});
