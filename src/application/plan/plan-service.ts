import type { HarnessEvent } from "../events.js";
import { PlanExecutionService } from "./execution-service.js";
import { ExecutionEpisodeService } from "./execution-episode-service.js";
import type { PlanExecutionCallbacks } from "./execution-service.js";
import type {
  PlanExecutionMutationResult,
  PlanItemVerificationCommand,
} from "./execution-types.js";
import { PlanDomainError } from "./execution-rules.js";
import type {
  PlanApprovalCommand,
  PlanCancelCommand,
  PlanDecisionCommand,
  PlanInteractionPort,
  PlanMutationResult,
  PlanReplanCommand,
} from "./plan-port.js";
import {
  immutablePlan,
  immutableConflict,
  planInteractionRequest,
  publishCommittedPlan,
  publishPlanConflict,
} from "./plan-events.js";
import type { PlanCoordinationFailure } from "./plan-coordination.js";
import { PlanRecoveryService } from "./plan-recovery.js";
import { PlanRetentionService } from "./plan-retention.js";
import { PlannerService } from "./planner-service.js";
import type { PlannerMutationResult } from "./planner-types.js";
import type { PlanConflict } from "./store-types.js";
import { PlanStore } from "./store.js";
import type {
  PlanCommandReceipt,
  PlanRecord,
} from "./types.js";
const TERMINAL = new Set(["completed", "cancelled", "failed"]);

function receiptFor(
  plan: Readonly<PlanRecord>,
  commandId: string,
): Readonly<PlanCommandReceipt> | undefined {
  return plan.commandReceipts.find((receipt) => receipt.commandId === commandId);
}

export interface PlanServiceOptions {
  publish(event: HarnessEvent): void;
  interactionPort(): PlanInteractionPort;
  onInteractionError?(error: unknown): void;
  onCoordinationFailure?(failure: PlanCoordinationFailure): void;
  terminalRecoveryTtlMs?: number;
  now?: () => number;
}

export class PlanService extends PlannerService {
  readonly execution: PlanExecutionService;
  readonly episodes: ExecutionEpisodeService;
  readonly recovery: PlanRecoveryService;
  readonly retention: PlanRetentionService;
  private readonly activeBySession = new Map<string, string>();
  private readonly notified = new WeakMap<PlanInteractionPort, Set<string>>();
  private executionCallbacks: PlanExecutionCallbacks = {};

  constructor(
    store: PlanStore,
    private readonly options: PlanServiceOptions,
  ) {
    super(store, options.now);
    store.bindMutationObserver({
      committed: (plan, previous) => this.committed(plan, previous),
      conflicted: (conflict) => this.conflicted(conflict),
    });
    this.execution = new PlanExecutionService(store, options.now, {
      onReplanReady: (plan) => this.executionCallbacks.onReplanReady?.(plan),
      onTerminal: (plan) => this.executionCallbacks.onTerminal?.(plan),
      onCoordinationFailure: (failure) => this.reportCoordinationFailure(failure),
    });
    this.episodes = new ExecutionEpisodeService(store, options.now);
    this.recovery = new PlanRecoveryService(store, options.now);
    this.retention = new PlanRetentionService(
      store,
      options.terminalRecoveryTtlMs,
      options.now,
    );
  }
  bindExecutionCallbacks(callbacks: PlanExecutionCallbacks): void {
    this.executionCallbacks = callbacks;
  }

  reportCoordinationFailure(failure: PlanCoordinationFailure): void {
    this.options.onCoordinationFailure?.(failure);
  }
  async getActivePlan(
    sessionId: string,
  ): Promise<Readonly<PlanRecord> | undefined> {
    const planId = this.activeBySession.get(sessionId);
    if (planId) {
      const loaded = await this.load(planId);
      if (
        loaded.ok
        && loaded.plan
        && !TERMINAL.has(loaded.plan.status)
      ) return immutablePlan(loaded.plan);
      this.activeBySession.delete(sessionId);
    }
    const latest = await this.store.findLatestForSession(sessionId);
    if (!latest || TERMINAL.has(latest.status)) return undefined;
    this.activeBySession.set(sessionId, latest.planId);
    return immutablePlan(latest);
  }
  async getLatestPlan(
    sessionId: string,
  ): Promise<Readonly<PlanRecord> | undefined> {
    const latest = await this.store.findLatestForSession(sessionId);
    return latest ? immutablePlan(latest) : undefined;
  }
  async requestDecision(
    ...args: Parameters<PlannerService["requestDecision"]>
  ): Promise<Readonly<PlanRecord>> {
    const plan = await super.requestDecision(...args);
    await this.notifyInteraction(plan);
    return plan;
  }
  async requestApproval(
    ...args: Parameters<PlannerService["requestApproval"]>
  ): Promise<Readonly<PlanRecord>> {
    const plan = await super.requestApproval(...args);
    await this.notifyInteraction(plan);
    return plan;
  }

  async mutateDecision(
    command: PlanDecisionCommand,
    plannerAgentId: string,
  ): Promise<PlanMutationResult> {
    let result: PlannerMutationResult;
    try {
      result = await super.applyDecision({
        ...command,
        plannerAgentId,
      });
    } catch (error) {
      return {
        ok: false,
        reason: error instanceof PlanDomainError
          && error.reason === "invalid_transition"
          ? "invalid_transition"
          : "invalid_command",
        message: error instanceof Error ? error.message : String(error),
      };
    }
    return this.fromPlannerResult(result, command);
  }

  async approve(command: PlanApprovalCommand): Promise<PlanMutationResult> {
    return this.runExecution(
      () => this.execution.approve(command),
      command.expectedVersion,
      command.commandId,
    );
  }

  async verifyItem(
    command: PlanItemVerificationCommand,
  ): Promise<PlanMutationResult> {
    return this.runExecution(
      () => this.execution.verifyItem(command),
      command.expectedVersion,
      command.commandId,
    );
  }

  async requestReplan(command: PlanReplanCommand): Promise<PlanMutationResult> {
    return this.runExecution(
      () => this.execution.requestReplan({
        planId: command.planId,
        expectedVersion: command.expectedVersion,
        commandId: command.commandId,
        summary: command.reason,
      }),
      command.expectedVersion,
      command.commandId,
    );
  }

  async cancel(command: PlanCancelCommand): Promise<PlanMutationResult> {
    return this.runExecution(
      () => this.execution.cancel(command),
      command.expectedVersion,
      command.commandId,
    );
  }

  committed(
    plan: Readonly<PlanRecord>,
    previous?: Readonly<PlanRecord>,
  ): void {
    try {
      if (TERMINAL.has(plan.status)) this.activeBySession.delete(plan.sessionId);
      else this.activeBySession.set(plan.sessionId, plan.planId);
      publishCommittedPlan(this.options.publish, plan, previous);
    } catch (error) {
      this.reportCoordinationFailure({
        planId: plan.planId,
        operation: "publish_event",
        error,
      });
    }
  }

  async reissuePendingInteractions(): Promise<void> {
    await Promise.all([...this.activeBySession.values()].map(async (planId) => {
      try {
        const loaded = await this.load(planId);
        if (loaded.ok && loaded.plan) await this.notifyInteraction(loaded.plan);
      } catch (error) {
        this.options.onInteractionError?.(error);
      }
    }));
  }

  private async notifyInteraction(plan: Readonly<PlanRecord>): Promise<void> {
    const interaction = plan.pendingInteraction;
    if (!interaction || interaction.kind === "acceptance") return;
    const port = this.options.interactionPort();
    let notified = this.notified.get(port);
    if (!notified) {
      notified = new Set();
      this.notified.set(port, notified);
    }
    if (notified.has(interaction.interactionId)) return;
    notified.add(interaction.interactionId);
    try {
      const request = planInteractionRequest(plan, interaction);
      if (!request) return;
      if ("decisionNodeId" in request) await port.requestPlanDecision(request);
      else await port.requestPlanApproval(request);
    } catch (error) {
      notified.delete(interaction.interactionId);
      this.options.onInteractionError?.(error);
    }
  }

  private fromPlannerResult(
    result: PlannerMutationResult,
    command: PlanDecisionCommand,
  ): PlanMutationResult {
    if (result.ok) return this.success(result.plan, command.commandId, result.duplicate);
    if (result.reason === "conflict" && result.plan) {
      return this.conflictResult(command.expectedVersion, result.plan);
    }
    return {
      ok: false,
      reason: "invalid_command",
      message: result.message ?? `Plan decision rejected: ${result.reason}`,
      plan: result.plan && immutablePlan(result.plan),
    };
  }

  private fromExecutionResult(
    result: PlanExecutionMutationResult,
    expectedVersion: number,
    commandId: string,
  ): PlanMutationResult {
    if (result.ok) return this.success(result.plan, commandId, result.duplicate ?? false);
    if ((result.reason === "conflict" || result.reason === "stale_approval") && result.plan) {
      if (result.reason === "stale_approval") {
        this.conflicted(immutableConflict(expectedVersion, result.plan));
      }
      return this.conflictResult(expectedVersion, result.plan);
    }
    return {
      ok: false,
      reason: result.reason === "invalid_transition"
        ? "invalid_transition"
        : "invalid_command",
      message: result.message,
      plan: result.plan && immutablePlan(result.plan),
    };
  }

  private async runExecution(
    operation: () => Promise<PlanExecutionMutationResult>,
    expectedVersion: number,
    commandId: string,
  ): Promise<PlanMutationResult> {
    let result: PlanExecutionMutationResult;
    try {
      result = await operation();
    } catch (error) {
      return {
        ok: false,
        reason: "invalid_command",
        message: error instanceof Error ? error.message : String(error),
      };
    }
    return this.fromExecutionResult(result, expectedVersion, commandId);
  }

  private success(
    plan: Readonly<PlanRecord>,
    commandId: string,
    duplicate: boolean,
  ): PlanMutationResult {
    const snapshot = immutablePlan(plan);
    const receipt = receiptFor(snapshot, commandId);
    if (!receipt) {
      return {
        ok: false,
        reason: "invalid_command",
        message: `Plan command has no receipt: ${commandId}`,
        plan: snapshot,
      };
    }
    return { ok: true, plan: snapshot, receipt, duplicate };
  }

  private conflictResult(expectedVersion: number, plan: Readonly<PlanRecord>): PlanMutationResult {
    const conflict = immutableConflict(expectedVersion, plan);
    return { ok: false, reason: "conflict", conflict };
  }

  private conflicted(conflict: PlanConflict): void {
    try {
      publishPlanConflict(this.options.publish, conflict);
    } catch (error) {
      this.reportCoordinationFailure({
        planId: conflict.current.planId,
        operation: "publish_event",
        error,
      });
    }
  }
}
