import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { compileAgentDefinition } from "../../../src/agents/definitions/compiler.js";
import type { AgentApplicationSnapshot } from "../../../src/agents/definitions/types.js";
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
  PLANNER_APPLICATION,
  PLANNER_TOOL_CAPABILITIES,
  PlanStore,
  PlannerProcessCoordinator,
  PlannerService,
} from "../../../src/application/plan/index.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) =>
    rm(root, { recursive: true, force: true })
  ));
});
class MainRuntime implements AgentProcessRuntime {
  readonly capabilities = { suspend: false, messaging: false };
  async start(): Promise<AgentProcessOutput> {
    return { text: "main" };
  }
  async terminate(): Promise<void> {}
  kill(): void {}
}

class PlannerRuntime implements AgentProcessRuntime {
  readonly capabilities = { suspend: false, messaging: false };

  constructor(private readonly mode: "waiting" | "normal" | "failure") {}

  async start(
    input: AgentProcessInput,
    signal: AbortSignal,
  ): Promise<AgentProcessOutput> {
    if (this.mode === "normal") return { text: "ended without approval" };
    if (this.mode === "failure") throw new Error("model unavailable");
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

function application(name: string): AgentApplicationSnapshot {
  return compileAgentDefinition({
    name,
    description: name,
    systemPrompt: name,
    permissionMode: "default",
  }, { kind: "internal", path: `test:${name}` }, 1);
}

async function setup(mode: "waiting" | "normal" | "failure" = "waiting") {
  const root = await mkdtemp(join(tmpdir(), "dscode-planner-races-"));
  roots.push(root);
  const mainApplication = application("main");
  const plannerApplication = compileAgentDefinition(
    PLANNER_APPLICATION,
    { kind: "internal", path: "programmatic:planner" },
    1,
  );
  const applications = new Map([
    ["main", mainApplication],
    ["planner", plannerApplication],
  ]);
  const logger = { error: vi.fn() };
  const supervisor = new AgentSupervisor(
    {
      require(name: string) {
        const found = applications.get(name);
        if (!found) throw new Error(`Unknown application: ${name}`);
        return found;
      },
      list: () => [...applications.values()],
    } as never,
    (app) => app.name === "planner"
      ? new PlannerRuntime(mode)
      : new MainRuntime(),
    new AgentProcessStore(root, "/project-a"),
    new HarnessEventBus(logger as never),
    logger as never,
    () => [
      { name: "read_file", effect: "read" as const },
      ...PLANNER_TOOL_CAPABILITIES,
    ],
  );
  const main = supervisor.registerMain(
    mainApplication,
    new MainRuntime(),
    createMainAgentContext("/project-a", "session-1", ["read_file"]),
  );
  const store = new PlanStore({ dataDir: root, projectPath: "/project-a" });
  const service = new PlannerService(store, () => 100);
  const coordinator = new PlannerProcessCoordinator(supervisor, service);
  const request = {
    requestId: "request-1",
    requestText: "Plan safely",
    decision: {
      requestId: "request-1",
      route: "plan" as const,
      source: "explicit" as const,
    },
  };
  return { coordinator, main, request, root, service, store, supervisor };
}

async function expectExit(
  mode: "normal" | "failure",
  expectedFact: string,
): Promise<void> {
  const fixture = await setup(mode);
  const handle = await fixture.coordinator.start(
    fixture.main.agentId,
    fixture.request,
  );
  await vi.waitFor(async () => {
    const loaded = await fixture.store.load(handle.planId);
    expect(loaded.ok && loaded.plan?.status).toBe("failed");
  });
  const loaded = await fixture.store.load(handle.planId);
  expect(loaded.ok && loaded.plan?.trajectoryEvents).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ kind: "fact_recorded", summary: expectedFact }),
    ]),
  );
  await fixture.coordinator.shutdown();
  expect(fixture.main.state).toBe("running");
  expect(fixture.supervisor.foreground("session-1")?.agentId)
    .toBe(fixture.main.agentId);
}

describe("Planner process races and exits", () => {
  it("atomically rejects a second raw foreground claim", async () => {
    const fixture = await setup();
    const first = fixture.supervisor.spawn({
      application: "planner",
      parentAgentId: fixture.main.agentId,
      attachment: "foreground",
      input: { prompt: "first" },
    });
    await expect(fixture.supervisor.spawn({
      application: "planner",
      parentAgentId: fixture.main.agentId,
      attachment: "foreground",
      input: { prompt: "second" },
    })).rejects.toThrow(/foreground reservation|does not own Session/);
    await vi.waitFor(() => {
      expect(fixture.supervisor.list().filter((process) =>
        process.application.name === "planner"
      )).toHaveLength(1);
    });
    const planner = fixture.supervisor.list().find((process) =>
      process.application.name === "planner"
    );
    if (!planner) throw new Error("Planner missing");
    await fixture.supervisor.terminate(planner.agentId);
    await first;
    expect(fixture.supervisor.foreground("session-1")?.agentId)
      .toBe(fixture.main.agentId);
  });

  it("deduplicates concurrent starts before foreground handoff", async () => {
    const fixture = await setup();
    const [first, second] = await Promise.all([
      fixture.coordinator.start(fixture.main.agentId, fixture.request),
      fixture.coordinator.start(fixture.main.agentId, fixture.request),
    ]);
    expect(second).toEqual(first);
    expect(fixture.supervisor.list().filter((process) =>
      process.application.name === "planner"
    )).toHaveLength(1);
    await fixture.coordinator.shutdown();
  });

  it("fails a Plan and restores Main after normal unapproved exit", async () => {
    await expectExit("normal", "Planner exited before approval");
  });

  it("persists model failure and restores Main", async () => {
    await expectExit("failure", "model unavailable");
  });

  it("cancels on abort and shutdown without resuming the request", async () => {
    for (const stop of ["abort", "shutdown"] as const) {
      const fixture = await setup();
      const handle = await fixture.coordinator.start(
        fixture.main.agentId,
        fixture.request,
      );
      if (stop === "abort") {
        await fixture.supervisor.terminate(handle.plannerAgentId);
      } else {
        await fixture.coordinator.shutdown();
      }
      await vi.waitFor(async () => {
        const loaded = await fixture.store.load(handle.planId);
        expect(loaded.ok && loaded.plan?.status).toBe("cancelled");
        expect(fixture.supervisor.foreground("session-1")?.agentId)
          .toBe(fixture.main.agentId);
      });
      await fixture.coordinator.shutdown();
    }
  });

  it("clears and rejects a pending interaction on exit", async () => {
    const fixture = await setup();
    const handle = await fixture.coordinator.start(
      fixture.main.agentId,
      fixture.request,
    );
    const loaded = await fixture.store.load(handle.planId);
    if (!loaded.ok || !loaded.plan) throw new Error("plan missing");
    const decision = await fixture.service.appendDecision(
      handle.planId,
      handle.plannerAgentId,
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
    if (!decision.ok) throw new Error("decision failed");
    const waiting = await fixture.service.requestDecision(
      handle.planId,
      handle.plannerAgentId,
      decision.plan.version,
      "interaction-1",
      "choice",
    );
    const waiter = fixture.coordinator.interactions.wait("interaction-1");
    const rejected = expect(waiter).rejects.toThrow("Aborted");
    await fixture.supervisor.terminate(handle.plannerAgentId);
    await fixture.coordinator.shutdown();
    await rejected;
    const cancelled = await fixture.store.load(handle.planId);
    expect(cancelled.ok && cancelled.plan).toMatchObject({
      status: "cancelled",
      version: waiting.version + 1,
    });
    expect(cancelled.ok && cancelled.plan?.pendingInteraction).toBeUndefined();
  });
  it("settles the old Planner before rebinding to a new project", async () => {
    const fixture = await setup();
    const old = await fixture.coordinator.start(
      fixture.main.agentId,
      fixture.request,
    );
    const nextStore = new PlanStore({
      dataDir: fixture.root,
      projectPath: "/project-b",
    });
    await fixture.coordinator.rebindProject(new PlannerService(nextStore));
    const oldPlan = await fixture.store.load(old.planId);
    expect(oldPlan.ok && oldPlan.plan?.status).toBe("cancelled");
    expect(fixture.supervisor.foreground("session-1")?.agentId)
      .toBe(fixture.main.agentId);

    const next = await fixture.coordinator.start(fixture.main.agentId, {
      ...fixture.request,
      requestId: "request-2",
    });
    expect((await nextStore.load(next.planId)).ok).toBe(true);
    const missingFromOld = await fixture.store.load(next.planId);
    expect(missingFromOld.ok && missingFromOld.plan).toBeUndefined();
    await fixture.coordinator.shutdown();
  });
});
