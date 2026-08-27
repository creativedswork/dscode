import { computePlanDigest } from "./digest.js";
import { validatePlanRecord } from "./schema.js";
import type {
  PlanCancellationRequest,
  PlanRecord,
} from "./types.js";

export interface PlanUpdateOptions {
  semanticChange?: boolean;
  cancellation?: PlanCancellationRequest;
}

export function preparePlanMutation(
  current: PlanRecord,
  draft: PlanRecord,
  now: number,
  options: PlanUpdateOptions = {},
): PlanRecord {
  draft.schemaVersion = 1;
  draft.planId = current.planId;
  draft.projectKey = current.projectKey;
  draft.createdAt = current.createdAt;
  draft.commandReceipts = structuredClone(current.commandReceipts);
  const digest = computePlanDigest(draft);
  const isSemanticChange = options.semanticChange === true
    || digest !== current.digest;
  draft.version = current.version + 1;
  draft.revision = current.revision + Number(isSemanticChange);
  draft.digest = digest;
  draft.updatedAt = now;
  if (isSemanticChange) {
    draft.approval = undefined;
    draft.pendingInteraction = undefined;
    if (current.status === "approved" && draft.status === "approved") {
      draft.status = "awaiting_approval";
    } else if (current.status === "executing" && draft.status === "executing") {
      draft.status = "needs_replan";
    }
    for (const item of draft.items) {
      item.executionBinding = undefined;
      item.executionBindings = [];
    }
  }
  return validatePlanRecord(draft);
}

export function isSameCancellation(
  current: PlanCancellationRequest | undefined,
  accepted: PlanCancellationRequest,
): boolean {
  return current?.commandId === accepted.commandId
    && current.expectedVersion === accepted.expectedVersion
    && current.acceptedVersion === accepted.acceptedVersion;
}
