import type {
  PlanDecisionNode,
  PlanRecord,
} from "./types.js";
import { PlanDomainError } from "./execution-rules.js";
import {
  decisionById,
  type HumanInteractionAssessment,
  type PlannerCommand,
} from "./planner-types.js";

export function assessHumanInteraction(
  plan: Readonly<PlanRecord>,
  decision?: Readonly<PlanDecisionNode>,
): HumanInteractionAssessment {
  const viable = decision?.candidates.filter((candidate) =>
    candidate.constraintFit !== "violates"
  ) ?? [];
  const reasons: HumanInteractionAssessment["reasons"] =
    decision?.resolvesRequirementIds?.some((requirementId) =>
      plan.alignmentRequirements?.some((requirement) =>
        requirement.requirementId === requirementId
        && requirement.status === "pending"
      )
    )
    || viable.some((candidate) => candidate.constraintFit === "uncertain")
      ? ["user_value_missing"]
      : [];
  return { required: reasons.length > 0, reasons };
}

export function assertPlannerActionInteraction(
  plan: Readonly<PlanRecord>,
  command: PlannerCommand,
): void {
  let decisionNodeId: string | undefined;
  if (command.action.kind === "select") {
    const action = command.action;
    const decision = decisionById(plan, action.decisionNodeId);
    if (!decision) throw new Error(`Decision not found: ${action.decisionNodeId}`);
    const option = decision.candidates.find((candidate) =>
      candidate.optionId === action.optionId
    );
    if (
      !option
      || (
        option.constraintFit !== "uncertain"
        && !(decision.resolvesRequirementIds?.length)
      )
    ) return;
    decisionNodeId = decision.decisionNodeId;
  } else if (command.action.kind === "update_constraints") {
    if (command.action.constraints.every((patch) =>
      patch.kind === "remove" || patch.constraint.source !== "user"
    )) return;
    decisionNodeId = plan.pendingInteraction?.kind === "decision"
      ? plan.pendingInteraction.payload.decisionNodeId
      : undefined;
  } else {
    return;
  }
  const pending = plan.pendingInteraction;
  if (
    !command.interactionId
    || !command.interactionPayloadDigest
    || pending?.kind !== "decision"
    || pending.payload.decisionNodeId !== decisionNodeId
  ) {
    throw new Error(`${command.action.kind} requires a matching pending decision`);
  }
}

export function assertActivePlanner(
  plan: Readonly<PlanRecord>,
  plannerAgentId: string,
): void {
  if (plan.plannerAgentId !== plannerAgentId) {
    throw new PlanDomainError(
      "invalid_command",
      `Planner ${plannerAgentId} does not own Plan ${plan.planId}`,
    );
  }
  if (!["drafting", "awaiting_decision", "awaiting_approval"].includes(plan.status)) {
    throw new PlanDomainError(
      "invalid_transition",
      `Planner cannot mutate Plan ${plan.planId} in status ${plan.status}`,
    );
  }
}
