import type { HarnessEvent } from "../events.js";
import type { PlanConflict } from "./store-types.js";
import type {
  PlanApprovalRequest,
  PlanDecisionRequest,
} from "./plan-port.js";
import type {
  PlanInteraction,
  PlanRecord,
} from "./types.js";

export function freezePlan<T>(value: T): Readonly<T> {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezePlan(child);
    Object.freeze(value);
  }
  return value;
}

export function immutablePlan(
  plan: Readonly<PlanRecord>,
): Readonly<PlanRecord> {
  return freezePlan(structuredClone(plan));
}

export function planInteractionRequest(
  plan: Readonly<PlanRecord>,
  interaction: Readonly<PlanInteraction>,
): Readonly<PlanDecisionRequest | PlanApprovalRequest> | undefined {
  if (interaction.kind === "acceptance") return undefined;
  if (interaction.kind === "decision") {
    const decision = plan.decisions.find((item) =>
      item.decisionNodeId === interaction.payload.decisionNodeId
    );
    return freezePlan({
      interactionId: interaction.interactionId,
      planId: plan.planId,
      version: plan.version,
      revision: plan.revision,
      decisionNodeId: interaction.payload.decisionNodeId,
      prompt: interaction.payload.prompt,
      candidates: structuredClone(decision?.candidates ?? []),
    });
  }
  return freezePlan({
    interactionId: interaction.interactionId,
    planId: plan.planId,
    version: plan.version,
    revision: plan.revision,
    digest: plan.digest,
    items: structuredClone(plan.items),
    effectCategories: [...interaction.payload.effectCategories],
    sideEffectSummary: interaction.payload.sideEffectSummary,
  });
}

function executionSummary(plan: Readonly<PlanRecord>) {
  return {
    status: plan.status,
    items: plan.items.map((item) => ({
      itemId: item.itemId,
      status: item.status,
      evidenceCount: item.evidence.length,
    })),
  };
}

export function publishCommittedPlan(
  publish: (event: HarnessEvent) => void,
  plan: Readonly<PlanRecord>,
  previous?: Readonly<PlanRecord>,
): void {
  const snapshot = immutablePlan(plan);
  publish({
    type: "plan:updated",
    planId: plan.planId,
    version: plan.version,
    revision: plan.revision,
    plan: snapshot,
  });
  if (
    plan.pendingInteraction
    && plan.pendingInteraction.interactionId
      !== previous?.pendingInteraction?.interactionId
  ) {
    publish({
      type: "plan:interaction",
      planId: plan.planId,
      version: plan.version,
      revision: plan.revision,
      interaction: freezePlan(structuredClone(plan.pendingInteraction)),
      request: planInteractionRequest(snapshot, plan.pendingInteraction),
    });
  }
  if (JSON.stringify(plan.approval) !== JSON.stringify(previous?.approval)) {
    publish({
      type: "plan:approval",
      planId: plan.planId,
      version: plan.version,
      revision: plan.revision,
      digest: plan.digest,
      approved: plan.approval !== undefined,
      approvedEffects: Object.freeze([...(plan.approval?.approvedEffects ?? [])]),
    });
  }
  const execution = executionSummary(plan);
  const priorExecution = previous && executionSummary(previous);
  if (JSON.stringify(execution) !== JSON.stringify(priorExecution)) {
    publish({
      type: "plan:execution",
      planId: plan.planId,
      version: plan.version,
      revision: plan.revision,
      status: plan.status,
      items: freezePlan(execution.items),
    });
  }
}

export function publishPlanConflict(
  publish: (event: HarnessEvent) => void,
  conflict: PlanConflict,
): void {
  const snapshot = immutableConflict(
    conflict.expectedVersion,
    conflict.current,
  );
  const plan = snapshot.current;
  publish({
    type: "plan:conflict",
    planId: plan.planId,
    expectedVersion: conflict.expectedVersion,
    currentVersion: conflict.currentVersion,
    revision: plan.revision,
    conflict: snapshot,
    plan,
  });
}

export function immutableConflict(
  expectedVersion: number,
  current: Readonly<PlanRecord>,
): PlanConflict {
  const snapshot = immutablePlan(current);
  return {
    kind: "version",
    expectedVersion,
    currentVersion: snapshot.version,
    current: snapshot,
  };
}
