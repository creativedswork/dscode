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
