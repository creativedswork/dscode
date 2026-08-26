import { randomUUID } from "node:crypto";

import type { AgentSupervisor } from "../../agents/process/supervisor.js";
import type { AgentExitResult } from "../../agents/process/types.js";
import type { PlannerRouteRequest } from "./route.js";
import { PlannerInteractionBroker } from "./planner-interactions.js";
import { PLANNER_APPLICATION_NAME } from "./planner-application.js";
import { PlannerService } from "./planner-service.js";
import type {
  PlanDecisionAction,
  PlannerMutationResult,
} from "./planner-types.js";
import type { PlanRecord } from "./types.js";

export interface PlannerProcessHandle {
  planId: string;
  plannerAgentId: string;
  mainAgentId: string;
}

export interface SubmitPlannerDecision {
  planId: string;
  expectedVersion: number;
  commandId: string;
  interactionId?: string;
  interactionPayloadDigest?: string;
  action: PlanDecisionAction;
}

export class PlannerProcessCoordinator {
  private readonly planByPlanner = new Map<string, {
    planId: string;
    service: PlannerService;
  }>();
  private readonly startByMain = new Map<string, Promise<PlannerProcessHandle>>();
  private readonly exits = new Map<string, Promise<void>>();

  constructor(
    private readonly supervisor: AgentSupervisor,
    private currentService: PlannerService,
    readonly interactions = new PlannerInteractionBroker(),
  ) {}

  get service(): PlannerService {
    return this.currentService;
  }

  planIdForPlanner(plannerAgentId: string): string {
    const binding = this.planByPlanner.get(plannerAgentId);
    if (!binding) throw new Error(`Planner process is not bound to a Plan: ${plannerAgentId}`);
    return binding.planId;
  }

  start(
    mainAgentId: string,
    request: Readonly<PlannerRouteRequest>,
  ): Promise<PlannerProcessHandle> {
    const active = this.startByMain.get(mainAgentId);
    if (active) return active;
    const starting = this.startNew(mainAgentId, request);
    this.startByMain.set(mainAgentId, starting);
    void starting.catch(() => {
      if (this.startByMain.get(mainAgentId) === starting) {
        this.startByMain.delete(mainAgentId);
      }
    });
    return starting;
  }

  async rebindProject(service: PlannerService): Promise<void> {
    await this.stopActive();
    this.currentService = service;
  }

  async shutdown(): Promise<void> {
    await this.stopActive();
  }

  private async stopActive(): Promise<void> {
    const starts = [...this.startByMain.values()];
    await Promise.allSettled(starts);
    const active = [...this.planByPlanner.keys()];
    await Promise.all(active.map(async (plannerAgentId) => {
      const planner = this.supervisor.get(plannerAgentId);
      if (planner && !planner.exit) {
        await this.supervisor.terminate(plannerAgentId, 5_000);
      }
      if (planner?.exit) await this.handleExit(plannerAgentId, planner.exit);
    }));
  }

  private async startNew(
    mainAgentId: string,
    request: Readonly<PlannerRouteRequest>,
  ): Promise<PlannerProcessHandle> {
    const main = this.supervisor.require(mainAgentId);
    const service = this.currentService;
    const planId = `plan-${randomUUID()}`;
    let resolveStarted!: (handle: PlannerProcessHandle) => void;
    let rejectStarted!: (error: Error) => void;
    const started = new Promise<PlannerProcessHandle>((resolve, reject) => {
      resolveStarted = resolve;
      rejectStarted = reject;
    });
    const execution = this.supervisor.spawn({
      application: PLANNER_APPLICATION_NAME,
      parentAgentId: mainAgentId,
      description: "Planner: prepare an auditable execution plan",
      input: {
        prompt: [
          `Plan ID: ${planId}`,
          `Request ID: ${request.requestId}`,
          "Create the goal and constraints, investigate read-only evidence,",
          "compare bounded candidates, request required decisions, then request approval.",
          "",
          request.requestText,
        ].join("\n"),
      },
      attachment: "foreground",
      recording: "process-only",
      restoreParentOnExit: false,
      onSpawn: async (plannerAgentId) => {
        const created = await service.create({
          planId,
          sessionId: main.parentSessionId,
          mainAgentId,
          plannerAgentId,
          request: {
            requestId: request.requestId,
            text: request.requestText,
            submittedAt: Date.now(),
          },
          status: "drafting",
          goal: request.requestText,
          constraints: [],
          decisions: [],
          items: [],
          sideEffectSummary: "",
          trajectoryEvents: [],
        });
        if (!created.ok) throw new Error(`Plan ID collision: ${planId}`);
        this.planByPlanner.set(plannerAgentId, { planId, service });
        resolveStarted({ planId, plannerAgentId, mainAgentId });
      },
    });
    void execution.then(
      ({ result }) => {
        if (result) void this.handleExit(result.agentId, result).catch(() => {});
      },
      (error) => {
        rejectStarted(error instanceof Error ? error : new Error(String(error)));
      },
    );
    return started;
  }

  async submitDecision(
    command: SubmitPlannerDecision,
  ): Promise<PlannerMutationResult> {
    const active = [...this.planByPlanner.entries()].find(
      ([, item]) => item.planId === command.planId,
    );
    const planner = active ? this.supervisor.get(active[0]) : undefined;
    if (!active || !planner || planner.exit) {
      throw new Error(`Active Planner not found for Plan ${command.planId}`);
    }
    const [plannerAgentId, binding] = active;
    const result = await binding.service.applyDecision({
      ...command,
      plannerAgentId,
    });
    if (result.ok && command.interactionId) {
      this.interactions.resolve(command.interactionId, result.plan);
    }
    return result;
  }

  async completeApproved(planId: string): Promise<Readonly<PlanRecord>> {
    const binding = [...this.planByPlanner.entries()].find(
      ([, item]) => item.planId === planId,
    );
    const service = binding?.[1].service ?? this.currentService;
    const loaded = await service.load(planId);
    if (!loaded.ok || !loaded.plan) {
      throw new Error(`Plan not found: ${planId}`);
    }
    const plan = loaded.plan;
    const plannerAgentId = plan.plannerAgentId;
    if (!plannerAgentId) throw new Error(`Plan ${planId} has no Planner`);
    if (plan.status !== "approved") {
      throw new Error(`Plan ${planId} is not approved`);
    }
    const planner = this.supervisor.require(plannerAgentId);
    if (!planner.exit) await this.supervisor.terminate(planner.agentId);
    await this.handleExit(planner.agentId, planner.exit!);
    return plan;
  }

  private handleExit(
    plannerAgentId: string,
    exit: Readonly<AgentExitResult>,
  ): Promise<void> {
    const current = this.exits.get(plannerAgentId);
    if (current) return current;
    const handling = this.finishExit(plannerAgentId, exit);
    this.exits.set(plannerAgentId, handling);
    void handling.finally(() => {
      if (this.exits.get(plannerAgentId) === handling) {
        this.exits.delete(plannerAgentId);
      }
    }).catch(() => {});
    return handling;
  }

  private async finishExit(
    plannerAgentId: string,
    exit: Readonly<AgentExitResult>,
  ): Promise<void> {
    const binding = this.planByPlanner.get(plannerAgentId);
    if (!binding) return;
    const planner = this.supervisor.get(plannerAgentId);
    let pendingInteractionId: string | undefined;
    try {
      try {
        const loaded = await binding.service.load(binding.planId);
        pendingInteractionId = loaded.ok
          ? loaded.plan?.pendingInteraction?.interactionId
          : undefined;
        await binding.service.finishPlannerExit(binding.planId, plannerAgentId, exit);
      } finally {
        if (pendingInteractionId) {
          this.interactions.reject(
            pendingInteractionId,
            new Error(exit.error ?? `Planner exited: ${exit.state}`),
          );
        }
        if (
          planner
          && this.supervisor.foreground(planner.parentSessionId)?.agentId === plannerAgentId
        ) {
          await this.supervisor.restoreForeground(plannerAgentId, planner.parentAgentId);
        }
      }
    } finally {
      this.planByPlanner.delete(plannerAgentId);
      if (planner?.parentAgentId) {
        this.startByMain.delete(planner.parentAgentId);
      }
    }
  }
}
