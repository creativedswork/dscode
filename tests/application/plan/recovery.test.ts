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
  bindPlanItemToAgent,
  PLANNER_APPLICATION,
  PLANNER_TOOL_CAPABILITIES,
  PlanService,
  PlanStore,
  PlannerProcessCoordinator,
  type PlanExecutionBinding,
  type PlanRecord,
} from "../../../src/application/plan/index.js";
import { makePlanInput } from "./helpers.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) =>
    rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 10 })
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

async function setup(requestPlanDecision = vi.fn(async () => {})) {
  const root = await mkdtemp(join(tmpdir(), "dscode-plan-recovery-"));
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
  const events = new HarnessEventBus(logger as never);
  const observed: PlanRecord[] = [];
  events.on("plan:updated", (event) => observed.push(event.plan as PlanRecord));
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
    events,
    logger as never,
    () => [
      { name: "read_file", effect: "read" as const },
      ...PLANNER_TOOL_CAPABILITIES,
    ],
  );
  const main = supervisor.registerMain(
    mainApplication,
    new IdleRuntime(),
    createMainAgentContext("/project", "session-1", ["read_file"]),
  );
  const store = new PlanStore({ dataDir: root, projectPath: "/project" });
  let interactionPort = {
    requestPlanDecision,
    requestPlanApproval: async () => {},
  };
  const service = new PlanService(store, {
    publish: (event) => events.emit(event),
    interactionPort: () => interactionPort,
    now: () => 100,
  });
  const onApprovedPlan = vi.fn(async () => {});
  const coordinator = new PlannerProcessCoordinator(supervisor, service, {
    onApprovedPlan,
  });
  return {
    coordinator,
    main,
    observed,
    onApprovedPlan,
    requestPlanDecision,
    replaceInteractionPort() {
      interactionPort = {
        requestPlanDecision,
        requestPlanApproval: async () => {},
      };
    },
    service,
    store,
    supervisor,
  };
}

async function createPlan(
  store: PlanStore,
  overrides: Partial<ReturnType<typeof makePlanInput>> = {},
) {
  const input = { ...makePlanInput("plan-recovery"), ...overrides };
  const created = await store.create(input);
  if (!created.ok) throw new Error("Plan create failed");
  return created.plan;
}

describe("Plan recovery reconciliation", () => {
  it("restarts a missing drafting Planner once and rebinds it to current Main", async () => {
    const fixture = await setup();
    await createPlan(fixture.store, {
      mainAgentId: "main-before-restart",
      plannerAgentId: "planner-before-restart",
    });

    await fixture.coordinator.reconcileSession("session-1", fixture.main.agentId);
    await fixture.coordinator.reconcileSession("session-1", fixture.main.agentId);

    const loaded = await fixture.store.load("plan-recovery");
    if (!loaded.ok || !loaded.plan) throw new Error("Recovered Plan missing");
    const planners = fixture.supervisor.list().filter((process) =>
      process.application.name === "planner" && !process.exit
    );
    expect(planners).toHaveLength(1);
    expect(loaded.plan).toMatchObject({
      status: "drafting",
      mainAgentId: fixture.main.agentId,
      plannerAgentId: planners[0]?.agentId,
    });
    await fixture.coordinator.shutdown();
  });

  it("restarts the Planner and reissues one persisted pending decision", async () => {
    const fixture = await setup();
    const created = await createPlan(fixture.store);
    const appended = await fixture.service.appendDecision(
      created.planId,
      created.plannerAgentId!,
      created.version,
      {
        decisionNodeId: "visual-direction",
        question: "Which visual direction should be used?",
        candidates: [{
          optionId: "minimal",
          summary: "Minimal",
          affectedScopes: ["web"],
          evidence: [],
          risks: [],
          cost: "low",
          reversibility: "reversible",
          constraintFit: "uncertain",
          recommended: true,
          rationale: "Keeps the interface focused",
        }],
      },
    );
    if (!appended.ok) throw new Error("Decision append failed");
    await fixture.service.requestDecision(
      created.planId,
      created.plannerAgentId!,
      appended.plan.version,
      "interaction-recovery",
      "visual-direction",
    );
    fixture.requestPlanDecision.mockClear();
    fixture.replaceInteractionPort();

    await fixture.coordinator.reconcileSession("session-1", fixture.main.agentId);
    await fixture.coordinator.reconcileSession("session-1", fixture.main.agentId);

    expect(fixture.requestPlanDecision).toHaveBeenCalledTimes(1);
    expect(fixture.requestPlanDecision).toHaveBeenCalledWith(
      expect.objectContaining({ interactionId: "interaction-recovery" }),
    );
    const loaded = await fixture.store.load(created.planId);
    expect(loaded.ok && loaded.plan).toMatchObject({
      status: "awaiting_decision",
      pendingInteraction: { interactionId: "interaction-recovery" },
    });
    await fixture.coordinator.shutdown();
  });

  it("invalidates unsafe execution before starting a recovery Planner", async () => {
    const fixture = await setup();
    const created = await createPlan(fixture.store, {
      mainAgentId: "main-before-restart",
    });
    const approved = await fixture.store.update(
      created.planId,
      created.version,
      (draft) => {
        draft.status = "approved";
        draft.approval = {
          revision: draft.revision,
          digest: draft.digest,
          approvedEffects: ["workspace_write"],
          acknowledgedSideEffects: ["workspace_write"],
          interactionId: "internal:planner-before-restart",
          approvedAt: 90,
        };
      },
    );
    if (!approved.ok) throw new Error("Approval setup failed");

    await fixture.coordinator.reconcileSession("session-1", fixture.main.agentId);

    const loaded = await fixture.store.load(created.planId);
    if (!loaded.ok || !loaded.plan) throw new Error("Recovered Plan missing");
    expect(fixture.observed.map((plan) => plan.status)).toContain("needs_replan");
    expect(loaded.plan).toMatchObject({
      status: "drafting",
      baseRevision: created.revision,
      mainAgentId: fixture.main.agentId,
    });
    expect(loaded.plan.approval).toBeUndefined();
    expect(loaded.plan.schemaVersion === 2
      && loaded.plan.execution.steps[0]?.executionBindings).toEqual([]);
    expect(fixture.main.context.activePlan).toBeUndefined();
    expect(fixture.main.context.planBinding).toBeUndefined();
    expect(fixture.onApprovedPlan).not.toHaveBeenCalled();
    await fixture.coordinator.shutdown();
  });

  it("continues only when Main has the exact persisted item binding", async () => {
    const fixture = await setup();
    const created = await createPlan(fixture.store, {
      mainAgentId: fixture.main.agentId,
    });
    let binding!: PlanExecutionBinding;
    const executing = await fixture.store.update(
      created.planId,
      created.version,
      (draft) => {
        binding = {
          agentId: fixture.main.agentId,
          role: "main",
          planId: draft.planId,
          revision: draft.revision,
          digest: draft.digest,
          itemId: draft.executionSteps[0]!.stepId,
          boundAt: 90,
        };
        draft.status = "executing";
        draft.approval = {
          revision: draft.revision,
          digest: draft.digest,
          approvedEffects: ["workspace_write"],
          acknowledgedSideEffects: ["workspace_write"],
          interactionId: "internal:planner-1",
          approvedAt: 80,
        };
        draft.execution.steps[0]!.status = "in_progress";
        draft.execution.steps[0]!.executionBindings = [binding];
      },
    );
    if (!executing.ok) throw new Error("Execution setup failed");
    bindPlanItemToAgent(fixture.main, binding);

    await fixture.coordinator.reconcileSession("session-1", fixture.main.agentId);
    await fixture.coordinator.reconcileSession("session-1", fixture.main.agentId);

    expect(fixture.onApprovedPlan).toHaveBeenCalledTimes(1);
    expect(fixture.main.context.planBinding).toEqual(binding);
    expect(fixture.supervisor.list().some((process) =>
      process.application.name === "planner" && !process.exit
    )).toBe(false);
  });
});
