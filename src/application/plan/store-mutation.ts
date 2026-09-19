import { computePlanDigest } from "./digest.js";
import { validatePlanRecord } from "./schema.js";
import type {
  PlanCancellationRequest,
  PlanRecordV2,
} from "./types.js";

export interface PlanUpdateOptions {
  semanticChange?: boolean;
  cancellation?: PlanCancellationRequest;
}

export function preparePlanMutation(
  current: PlanRecordV2,
  draft: PlanRecordV2,
  now: number,
  options: PlanUpdateOptions = {},
): PlanRecordV2 {
  draft.schemaVersion = 2;
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
    for (const state of draft.execution.steps) {
      state.executionBinding = undefined;
      state.executionBindings = [];
    }
  }
  const validated = validatePlanRecord(draft);
  if (validated.schemaVersion !== 2) {
    throw new Error("Plan mutation unexpectedly changed schema version");
  }
  return validated;
}

export function isSameCancellation(
  current: PlanCancellationRequest | undefined,
  accepted: PlanCancellationRequest,
): boolean {
  return current?.commandId === accepted.commandId
    && current.expectedVersion === accepted.expectedVersion
    && current.acceptedVersion === accepted.acceptedVersion;
}
