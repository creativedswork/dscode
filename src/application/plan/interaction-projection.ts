import type {
  PlanApprovalRequest,
  PlanDecisionRequest,
} from "./plan-port.js";
import type {
  PlanInteraction,
  PlanRecord,
} from "./types.js";
import { planExecutionUnits } from "./execution-model.js";

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
    items: structuredClone(planExecutionUnits(plan).map((step) => ({
      itemId: step.stepId,
      order: step.order,
      title: step.title,
      description: step.description,
      dependsOn: step.dependsOn,
      status: step.status,
      acceptanceCriteria: [],
      effectGrants: step.effectGrants,
      evidence: step.evidence,
      executionBinding: step.executionBinding,
      executionBindings: step.executionBindings,
      skipReason: step.skipReason,
    }))),
    effectCategories: [...interaction.payload.effectCategories],
    sideEffectSummary: interaction.payload.sideEffectSummary,
  });
}
