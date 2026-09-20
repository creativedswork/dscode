import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { compileAgentDefinition } from "../../../src/agents/definitions/compiler.js";
import type { AgentApplicationSnapshot } from "../../../src/agents/definitions/types.js";
import { checkAgentCapability } from "../../../src/agents/process/capability.js";
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
  type PlanRecord,
} from "../../../src/application/plan/index.js";
import { makePlanInput } from "./helpers.js";
import { createTestPlanService } from "./plan-service-fixture.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) =>
    rm(root, { recursive: true, force: true })
  ));
});

class ImmediateRuntime implements AgentProcessRuntime {
  readonly capabilities = { suspend: false, messaging: false };

  async start(): Promise<AgentProcessOutput> {
    return { text: "done" };
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

async function setup(
  onApprovedPlan?: (plan: Readonly<PlanRecord>) => Promise<void> | void,
) {
  const root = await mkdtemp(join(tmpdir(), "dscode-planner-lifecycle-"));
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
  const registry = {
    require(name: string) {
      const found = applications.get(name);
      if (!found) throw new Error(`Unknown application: ${name}`);
      return found;
    },
    list: () => [...applications.values()],
  };
  const logger = { error: vi.fn() };
  const processStore = new AgentProcessStore(root, "/project");
  const capabilities = [
    { name: "read_file", effect: "read" as const },
    { name: "write_file", effect: "workspace_write" as const },
    { name: "network_lookup", effect: "network" as const },
    { name: "spawn_agent", effect: "process" as const },
    ...PLANNER_TOOL_CAPABILITIES,
  ];
  const supervisor = new AgentSupervisor(
    registry as never,
    (app) => app.name === "planner"
      ? new WaitingRuntime()
      : new ImmediateRuntime(),
    processStore,
    new HarnessEventBus(logger as never),
    logger as never,
    () => capabilities,
  );
  const main = supervisor.registerMain(
    mainApplication,
    new ImmediateRuntime(),
    createMainAgentContext(
      "/project",
      "session-1",
      capabilities.map((tool) => tool.name),
    ),
  );
  const planStore = new PlanStore({ dataDir: root, projectPath: "/project" });
  const coordinator = new PlannerProcessCoordinator(
    supervisor,
    createTestPlanService(planStore),
    { onApprovedPlan },
  );
  return { coordinator, main, planStore, processStore, supervisor };
}

describe("Planner process lifecycle", () => {
  it("keeps one foreground owner and persists Main/Planner waiting states", async () => {
    const onApprovedPlan = vi.fn();
    const fixture = await setup(onApprovedPlan);
    const handle = await fixture.coordinator.start(fixture.main.agentId, {
      requestId: "request-1",
      requestText: "Plan a risky change",
      decision: {
        requestId: "request-1",
        route: "plan",
        source: "explicit",
      },
    });
    await vi.waitFor(() => {
      expect(fixture.supervisor.require(handle.plannerAgentId).state).toBe("waiting");
    });

    const planner = fixture.supervisor.require(handle.plannerAgentId);
    expect(fixture.main.state).toBe("waiting");
    expect(planner.parentAgentId).toBe(fixture.main.agentId);
    expect(planner.parentSessionId).toBe("session-1");
    expect(planner.attachment).toBe("foreground");
    expect(fixture.supervisor.foreground("session-1")?.agentId)
      .toBe(handle.plannerAgentId);
    expect(planner.application).toMatchObject({
      permissionMode: "plan",
      source: { kind: "internal", path: "programmatic:planner" },
    });
    expect(planner.application.memory).toBeUndefined();

    await vi.waitFor(async () => {
      expect((await fixture.processStore.load(handle.plannerAgentId))?.state)
        .toBe("waiting");
    });
    const persistedMain = await fixture.processStore.load(fixture.main.agentId);
    const persistedPlanner = await fixture.processStore.load(handle.plannerAgentId);
    expect(persistedMain?.state).toBe("waiting");
    expect(persistedPlanner?.state).toBe("waiting");
    expect(persistedPlanner?.parentAgentId).toBe(fixture.main.agentId);

    for (const tool of ["write_file", "network_lookup", "spawn_agent"]) {
      expect(checkAgentCapability(planner.context, tool, {})).toMatchObject({
        block: true,
      });
    }
    expect(checkAgentCapability(planner.context, "read_file", {})).toBeUndefined();
    expect(checkAgentCapability(planner.context, "plan_initialize", {}))
      .toBeUndefined();

    const loaded = await fixture.planStore.load(handle.planId);
    if (!loaded.ok || !loaded.plan) throw new Error("Plan missing");
    const approved = await fixture.planStore.update(
      handle.planId,
      loaded.plan.version,
      (draft) => {
        draft.status = "approved";
        draft.approval = {
          revision: draft.revision,
          digest: draft.digest,
          approvedEffects: [],
          acknowledgedSideEffects: [],
          interactionId: "approval-1",
          approvedAt: 100,
        };
      },
    );
    if (!approved.ok) throw new Error("Approval fixture failed");

    await fixture.coordinator.completeApproved(handle.planId);

    expect(fixture.supervisor.require(handle.plannerAgentId).state)
      .toBe("terminated");
    expect(fixture.main.state).toBe("running");
    expect(fixture.supervisor.foreground("session-1")?.agentId)
      .toBe(fixture.main.agentId);
    expect(onApprovedPlan).toHaveBeenCalledWith(expect.objectContaining({
      planId: handle.planId,
      status: "approved",
    }));
  });

  it("spawns a replacement Planner for a settled needs_replan Plan", async () => {
    const fixture = await setup();
    const input = makePlanInput("plan-replan");
    input.mainAgentId = fixture.main.agentId;
    input.status = "needs_replan";
    const created = await fixture.planStore.create(input);
    if (!created.ok) throw new Error("Plan fixture failed");

    const handle = await fixture.coordinator.replan(
      created.plan.planId,
      created.plan.version,
    );
    await vi.waitFor(() => {
      expect(fixture.supervisor.require(handle.plannerAgentId).state).toBe("waiting");
    });
    const loaded = await fixture.planStore.load(created.plan.planId);

    expect(loaded.ok && loaded.plan).toMatchObject({
      status: "drafting",
      baseRevision: created.plan.revision,
      revision: created.plan.revision + 1,
      plannerAgentId: handle.plannerAgentId,
    });
    expect(loaded.ok && loaded.plan?.approval).toBeUndefined();
    expect(fixture.supervisor.foreground("session-1")?.agentId)
      .toBe(handle.plannerAgentId);
    await fixture.coordinator.shutdown();
  });
});
