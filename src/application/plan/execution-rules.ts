import { computePlanDigest } from "./digest.js";
import type {
  PlanExecutionBinding,
  PlanItem,
  PlanRecord,
} from "./types.js";

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
  item: Readonly<PlanItem>,
): readonly PlanExecutionBinding[] {
  return item.executionBindings
    ?? (item.executionBinding ? [item.executionBinding] : []);
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

export function requireItem(plan: PlanRecord, itemId: string): PlanItem {
  const item = plan.items.find((candidate) => candidate.itemId === itemId);
  if (!item) {
    throw new PlanDomainError("invalid_command", `Plan item not found: ${itemId}`);
  }
  return item;
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
