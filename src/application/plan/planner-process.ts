import { randomUUID } from "node:crypto";
import type { AgentSupervisor } from "../../agents/process/supervisor.js";
import type { AgentExitResult } from "../../agents/process/types.js";
import { attachPlanToAgent, clearAgentPlan } from "./execution-binding.js";
import { PlanExecutionService } from "./execution-service.js";
import type {
  PlanApprovalCommand,
  PlanCancelCommand,
} from "./execution-types.js";
import { PlannerInteractionBroker } from "./planner-interactions.js";
import { coordinateAfterCommit } from "./plan-coordination.js";
import { spawnPlanner } from "./planner-spawn.js";
import { PlanService } from "./plan-service.js";
import type { PlanMutationResult } from "./plan-port.js";
import type { PlannerRouteRequest } from "./route.js";
import type { PlanDecisionAction } from "./planner-types.js";
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
    service: PlanService;
  }>();
  private readonly startByMain = new Map<string, Promise<PlannerProcessHandle>>();
  private readonly exits = new Map<string, Promise<void>>();

  constructor(
    private readonly supervisor: AgentSupervisor,
    private currentService: PlanService,
    readonly interactions = new PlannerInteractionBroker(),
  ) {
    this.bindExecutionCallbacks(currentService);
  }
  get service(): PlanService {
    return this.currentService;
  }
  get execution(): PlanExecutionService {
    return this.currentService.execution;
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
  async replan(
    planId: string,
    expectedVersion: number,
  ): Promise<PlannerProcessHandle> {
    const loaded = await this.currentService.execution.load(planId);
    if (!loaded.ok || !loaded.plan) throw new Error(`Plan not found: ${planId}`);
    const plan = loaded.plan;
    if (plan.status !== "needs_replan" || plan.version !== expectedVersion) {
      throw new Error(`Plan ${planId} is not ready for replanning`);
    }
    const active = this.startByMain.get(plan.mainAgentId);
    if (active) return active;
    await this.stopPlanExecution(planId, plan.mainAgentId);
    const starting = this.startNew(plan.mainAgentId, {
      requestId: plan.request.requestId,
      requestText: plan.request.text,
      decision: {
        requestId: plan.request.requestId,
        route: "plan",
        source: "explicit",
      },
    }, planId, expectedVersion);
    this.startByMain.set(plan.mainAgentId, starting);
    void starting.catch(() => {
      if (this.startByMain.get(plan.mainAgentId) === starting) {
        this.startByMain.delete(plan.mainAgentId);
      }
    });
    return starting;
  }

  async rebindProject(service: PlanService): Promise<void> {
    await this.stopActive();
    this.currentService = service;
    this.bindExecutionCallbacks(service);
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
    existingPlanId?: string,
    expectedVersion?: number,
  ): Promise<PlannerProcessHandle> {
    const service = this.currentService;
    const planId = existingPlanId ?? `plan-${randomUUID()}`;
    return spawnPlanner({
      supervisor: this.supervisor,
      service,
      execution: service.execution,
      mainAgentId,
      planId,
      request,
      expectedVersion,
      onBound: (plannerAgentId) => {
        this.planByPlanner.set(plannerAgentId, { planId, service });
      },
      onExit: (exit) => this.handleExit(exit.agentId, exit),
    });
  }

  async submitDecision(
    command: SubmitPlannerDecision,
  ): Promise<PlanMutationResult> {
    const active = [...this.planByPlanner.entries()].find(
      ([, item]) => item.planId === command.planId,
    );
    const planner = active ? this.supervisor.get(active[0]) : undefined;
    if (!active || !planner || planner.exit) {
      throw new Error(`Active Planner not found for Plan ${command.planId}`);
    }
    const [plannerAgentId, binding] = active;
    const result = await binding.service.mutateDecision(command, plannerAgentId);
    if (result.ok && command.interactionId) {
      await coordinateAfterCommit(command.planId, [{
        operation: "resolve_decision",
        run: () => { this.interactions.resolve(command.interactionId!, result.plan); },
      }], (failure) => binding.service.reportCoordinationFailure(failure));
    }
    return result;
  }

  async submitApproval(
    command: PlanApprovalCommand,
  ): Promise<PlanMutationResult> {
    const result = await this.currentService.approve(command);
    if (!result.ok) return result;
    await coordinateAfterCommit(command.planId, [{
      operation: "resolve_approval",
      run: () => { this.interactions.resolve(command.interactionId, result.plan); },
    }, {
      operation: "complete_approved",
      run: () => this.completeApproved(command.planId).then(() => undefined),
    }], (failure) => this.currentService.reportCoordinationFailure(failure));
    return result;
  }

  async cancel(command: PlanCancelCommand) {
    return this.currentService.cancel(command);
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
        const settled = await binding.service.finishPlannerExit(
          binding.planId,
          plannerAgentId,
          exit,
        );
        if (settled?.status === "approved") {
          try {
            attachPlanToAgent(
              this.supervisor.require(settled.mainAgentId),
              settled,
            );
          } catch (error) {
            binding.service.reportCoordinationFailure({
              planId: binding.planId,
              operation: "attach_main",
              error,
            });
          }
        }
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

  private bindExecutionCallbacks(service: PlanService): void {
    service.bindExecutionCallbacks({
      onReplanReady: (plan) => this.replan(plan.planId, plan.version).then(() => undefined),
      onTerminal: (plan) => this.cleanupTerminalPlan(plan),
    });
  }

  private async stopPlanExecution(planId: string, mainAgentId: string): Promise<void> {
    for (const process of this.supervisor.list()) {
      if (
        process.context.activePlan?.planId !== planId
        && process.context.planBinding?.planId !== planId
      ) continue;
      clearAgentPlan(process);
      if (process.role === "subagent" && !process.exit) {
        await this.supervisor.terminate(process.agentId);
      }
    }
    const main = this.supervisor.get(mainAgentId);
    if (main && !main.exit) void main.runtime.terminate().catch(() => {});
  }

  private async cleanupTerminalPlan(plan: Readonly<PlanRecord>): Promise<void> {
    await this.stopPlanExecution(plan.planId, plan.mainAgentId);
    const active = [...this.planByPlanner.entries()].find(
      ([, binding]) => binding.planId === plan.planId,
    );
    if (!active) return;
    const planner = this.supervisor.get(active[0]);
    if (planner && !planner.exit) await this.supervisor.terminate(planner.agentId);
    if (planner?.exit) await this.handleExit(planner.agentId, planner.exit);
  }
}
