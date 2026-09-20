import { randomUUID } from "node:crypto";

import type {
  PlanCancelCommand, PlanExecutionMutationResult, PlanMaterialConflictCommand,
  PlanRequestedReplanCommand, PlanReplanTransitionCommand,
} from "./execution-types.js";
import { PlanDomainError } from "./execution-rules.js";
import { coordinateAfterCommit, type PlanCoordinationFailure } from "./plan-coordination.js";
import { PlanStore } from "./store.js";
import type { PlanCancellationRequest, PlanRecord, PlanStatus } from "./types.js";

const TERMINAL = new Set<PlanStatus>(["completed", "cancelled", "failed"]);

interface PendingCancel {
  command: PlanCancelCommand;
  accepted: Promise<PlanExecutionMutationResult>;
  resolveAccepted(result: PlanExecutionMutationResult): void;
  promise: Promise<PlanExecutionMutationResult>;
  resolve(result: PlanExecutionMutationResult): void;
  token?: PlanCancellationRequest;
}

export interface PlanExecutionLifecycleCallbacks {
  onReplanReady?(plan: Readonly<PlanRecord>): Promise<void> | void;
  onTerminal?(plan: Readonly<PlanRecord>): Promise<void> | void;
  onCoordinationFailure?(failure: PlanCoordinationFailure): void;
}

export class PlanExecutionLifecycle {
  private readonly inFlight = new Map<string, number>();
  private readonly cancelling = new Set<string>();
  private readonly blocked = new Set<string>();
  private readonly pendingCancels = new Map<string, PendingCancel>();
  private readonly replanning = new Set<string>();

  constructor(
    private readonly store: PlanStore,
    private readonly replan: (command: PlanReplanTransitionCommand) =>
      Promise<PlanExecutionMutationResult>,
    private readonly callbacks: PlanExecutionLifecycleCallbacks,
    private readonly now: () => number,
  ) {}

  hasInFlight(planId: string): boolean {
    return (this.inFlight.get(planId) ?? 0) > 0;
  }

  isCancelling(planId: string): boolean {
    return this.cancelling.has(planId) || this.blocked.has(planId);
  }

  resume(planId: string): void {
    this.blocked.delete(planId);
    this.replanning.delete(planId);
  }

  startTool(planId: string): void {
    this.inFlight.set(planId, (this.inFlight.get(planId) ?? 0) + 1);
  }

  async settleTool(planId: string): Promise<void> {
    const current = this.inFlight.get(planId);
    if (!current) return;
    const remaining = current - 1;
    if (remaining > 0) {
      this.inFlight.set(planId, remaining);
      return;
    }
    this.inFlight.delete(planId);
    if (this.cancelling.delete(planId)) {
      const token = this.pendingCancels.get(planId)?.token;
      if (token) await this.finishCancellation(planId, token);
      return;
    }
    const plan = await this.load(planId);
    if (plan?.status === "needs_replan") await this.scheduleReplan(plan);
  }

  async reportConflict(command: PlanMaterialConflictCommand):
    Promise<PlanExecutionMutationResult> {
    return this.transitionToReplan(command);
  }

  requestReplan(command: PlanRequestedReplanCommand):
    Promise<PlanExecutionMutationResult> {
    return this.transitionToReplan(command);
  }

  private async transitionToReplan(command: PlanReplanTransitionCommand):
    Promise<PlanExecutionMutationResult> {
    this.blocked.add(command.planId);
    const result = await this.replan(command);
    if (!result.ok) this.blocked.delete(command.planId);
    if (result.ok && !this.hasInFlight(command.planId)) {
      setTimeout(() => {
        void this.scheduleReplan(result.plan);
      }, 0);
    }
    return result;
  }

  cancel(command: PlanCancelCommand): Promise<PlanExecutionMutationResult> {
    const pending = this.pendingCancels.get(command.planId);
    if (pending) {
      return pending.command.commandId === command.commandId
        && pending.command.expectedVersion === command.expectedVersion
        ? pending.promise
        : pending.accepted.then((accepted) => accepted.ok
          ? {
              ok: false,
              reason: "conflict",
              message: "A different cancellation request is already accepted",
              plan: accepted.plan,
            }
          : accepted);
    }
    let resolveAccepted!: (result: PlanExecutionMutationResult) => void;
    let resolve!: (result: PlanExecutionMutationResult) => void;
    const accepted = new Promise<PlanExecutionMutationResult>((settle) => {
      resolveAccepted = settle;
    });
    const promise = new Promise<PlanExecutionMutationResult>((settle) => {
      resolve = settle;
    });
    this.pendingCancels.set(command.planId, {
      command,
      accepted,
      resolveAccepted,
      promise,
      resolve,
    });
    void this.beginCancellation(command);
    return promise;
  }

  private async beginCancellation(command: PlanCancelCommand): Promise<void> {
    try {
      const accepted = await this.acceptCancellation(command);
      const pending = this.pendingCancels.get(command.planId);
      pending?.resolveAccepted(accepted);
      if (!accepted.ok) {
        this.resolveCancellation(command.planId, accepted);
        return;
      }
      if (accepted.duplicate && accepted.plan.status === "cancelled") {
        this.resolveCancellation(command.planId, accepted);
        return;
      }
      const token = accepted.plan.cancellation;
      if (!token) throw new Error("Accepted cancellation token was not persisted");
      if (pending) pending.token = token;
      if (accepted.plan.status === "executing" && this.hasInFlight(command.planId)) {
        this.cancelling.add(command.planId);
        return;
      }
      await this.finishCancellation(command.planId, token);
    } catch (error) {
      const result = {
        ok: false,
        reason: error instanceof PlanDomainError
          ? error.reason
          : "invalid_command",
        message: error instanceof Error ? error.message : String(error),
      } as PlanExecutionMutationResult;
      this.pendingCancels.get(command.planId)?.resolveAccepted(result);
      this.resolveCancellation(command.planId, result);
    }
  }

  async notifyTerminal(plan: Readonly<PlanRecord>): Promise<void> {
    await coordinateAfterCommit(plan.planId, [{
      operation: "terminal_cleanup",
      run: () => this.callbacks.onTerminal?.(plan),
    }], (failure) => this.callbacks.onCoordinationFailure?.(failure));
  }

  private async finishCancellation(
    planId: string,
    token: PlanCancellationRequest,
  ): Promise<void> {
    let result: PlanExecutionMutationResult;
    try {
      result = await this.commitCancelled(planId, token);
    } catch (error) {
      this.resolveCancellation(planId, {
        ok: false,
        reason: "invalid_command",
        message: error instanceof Error ? error.message : String(error),
      });
      return;
    }
    if (result.ok) await this.notifyTerminal(result.plan);
    this.resolveCancellation(planId, result);
  }

  private resolveCancellation(planId: string, result: PlanExecutionMutationResult): void {
    const pending = this.pendingCancels.get(planId);
    this.pendingCancels.delete(planId);
    pending?.resolve(result);
  }

  private async commitCancelled(
    planId: string,
    token: PlanCancellationRequest,
  ): Promise<PlanExecutionMutationResult> {
    const result = await this.store.update(planId, token.acceptedVersion, (draft) => {
      if (TERMINAL.has(draft.status)) return;
      const from = draft.status;
      draft.status = "cancelled";
      draft.approval = undefined;
      draft.pendingInteraction = undefined;
      draft.trajectoryEvents.push({
        eventId: randomUUID(),
        revision: draft.revision,
        recordedAt: this.now(),
        kind: "status_changed",
        from,
        to: "cancelled",
      });
    }, { cancellation: token });
    return result.ok
      ? { ok: true, plan: result.plan }
      : {
          ok: false,
          reason: "conflict",
          message: "Plan version conflict",
          plan: result.conflict.current,
        };
  }

  private async acceptCancellation(
    command: PlanCancelCommand,
  ): Promise<PlanExecutionMutationResult> {
    const result = await this.store.applyCommand({
      ...command,
      operation: "cancel",
      payload: {},
    }, (draft) => {
        if (TERMINAL.has(draft.status)) {
          throw new PlanDomainError("invalid_transition", "Plan is terminal");
        }
        if (![
          "drafting",
          "awaiting_decision",
          "awaiting_approval",
          "approved",
          "needs_replan",
          "executing",
        ].includes(draft.status)) {
          throw new PlanDomainError("invalid_transition", "Plan cannot be cancelled");
        }
        draft.cancellation = {
          commandId: command.commandId,
          expectedVersion: command.expectedVersion,
          acceptedVersion: command.expectedVersion + 1,
          acceptedAt: this.now(),
        };
        draft.pendingInteraction = undefined;
      });
    return result.ok
      ? { ok: true, plan: result.plan, duplicate: result.duplicate }
      : {
          ok: false,
          reason: result.reason === "conflict" ? "conflict" : "invalid_command",
          message: result.reason === "conflict"
            ? "Plan version conflict"
            : result.message,
          plan: result.reason === "conflict"
            ? result.conflict.current
            : result.plan,
        };
  }

  private async scheduleReplan(plan: Readonly<PlanRecord>): Promise<void> {
    if (!this.callbacks.onReplanReady || this.replanning.has(plan.planId)) return;
    this.replanning.add(plan.planId);
    try {
      await this.callbacks.onReplanReady(plan);
    } catch (error) {
      this.replanning.delete(plan.planId);
      this.callbacks.onCoordinationFailure?.({
        planId: plan.planId,
        operation: "start_replan",
        error,
      });
    }
  }

  private async load(planId: string): Promise<Readonly<PlanRecord> | undefined> {
    const loaded = await this.store.load(planId);
    return loaded.ok ? loaded.plan : undefined;
  }
}
