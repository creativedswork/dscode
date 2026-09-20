import { computePlanDigest } from "./digest.js";
import type {
  PlanExecutionBinding,
  PlanExecutionStepState,
  PlanRecord,
} from "./types.js";
import {
  requireExecutionStep,
  requireExecutionStepState,
} from "./execution-model.js";

export class PlanDomainError extends Error {
  constructor(
    readonly reason: "stale_approval" | "invalid_transition" | "invalid_command",
    message: string,
  ) {
    super(message);
    this.name = "PlanDomainError";
  }
}

export function itemBindings(
  state: Readonly<PlanExecutionStepState>,
): readonly PlanExecutionBinding[] {
  return state.executionBindings
    ?? (state.executionBinding ? [state.executionBinding] : []);
}

export function requireCurrentApproval(
  plan: Readonly<PlanRecord>,
  revision: number,
  digest: string,
): void {
  if (
    plan.revision !== revision
    || plan.digest !== digest
    || plan.approval?.revision !== revision
    || plan.approval.digest !== digest
    || computePlanDigest(plan) !== digest
  ) {
    throw new PlanDomainError("stale_approval", "Plan approval is stale");
  }
}

export function requireStep(plan: Readonly<PlanRecord>, stepId: string) {
  try {
    return requireExecutionStep(plan, stepId);
  } catch {
    throw new PlanDomainError(
      "invalid_command",
      `Plan execution step not found: ${stepId}`,
    );
  }
}

export function requireStepState(plan: PlanRecord, stepId: string) {
  try {
    return requireExecutionStepState(plan, stepId);
  } catch {
    throw new PlanDomainError(
      "invalid_command",
      `Plan execution state not found: ${stepId}`,
    );
  }
}

export function mutationFailure(error: unknown): {
  ok: false;
  reason: "stale_approval" | "invalid_transition" | "invalid_command";
  message: string;
} {
  if (error instanceof PlanDomainError) {
    return { ok: false, reason: error.reason, message: error.message };
  }
  throw error;
}
