import type {
  PlanCandidate,
  PlanDecisionNode,
  PlanRecord,
} from "./types.js";
import { PlanDomainError } from "./execution-rules.js";
import {
  decisionById,
  type HumanInteractionAssessment,
  type PlannerCommand,
} from "./planner-types.js";

const COST_RANK = { low: 0, medium: 1, high: 2 } as const;
const REVERSIBILITY_RANK = {
  reversible: 0,
  partial: 1,
  irreversible: 2,
} as const;

function dominates(left: PlanCandidate, right: PlanCandidate): boolean {
  const leftRanks = [
    COST_RANK[left.cost],
    REVERSIBILITY_RANK[left.reversibility],
    left.risks.length,
  ];
  const rightRanks = [
    COST_RANK[right.cost],
    REVERSIBILITY_RANK[right.reversibility],
    right.risks.length,
  ];
  return leftRanks.every((rank, index) => rank <= rightRanks[index])
    && leftRanks.some((rank, index) => rank < rightRanks[index]);
}

function hasHighImpactTradeoff(candidates: readonly PlanCandidate[]): boolean {
  return candidates.some((candidate) =>
    candidate.cost === "high"
    || candidate.reversibility !== "reversible"
    || candidate.risks.length > 0
  ) || candidates.length > 1 && new Set(candidates.map((candidate) =>
    [...candidate.affectedScopes].sort().join("\0")
  )).size > 1;
}

export function assessHumanInteraction(
  plan: Readonly<PlanRecord>,
  decision?: Readonly<PlanDecisionNode>,
  finalApproval = false,
): HumanInteractionAssessment {
  const reasons: HumanInteractionAssessment["reasons"] = [];
  const viable = decision?.candidates.filter((candidate) =>
    candidate.constraintFit !== "violates"
  ) ?? [];
  const nonDominated = viable.filter((candidate) =>
    !viable.some((other) => other !== candidate && dominates(other, candidate))
  );
  if (nonDominated.length >= 2) {
    reasons.push("multiple_viable_candidates");
  }
  if (hasHighImpactTradeoff(viable)) {
    reasons.push("high_impact_tradeoff");
  }
  if (
    plan.constraints.length === 0
    || viable.some((candidate) => candidate.constraintFit === "uncertain")
  ) {
    reasons.push("constraints_missing");
  }
  if (finalApproval) reasons.push("final_approval");
  return { required: reasons.length > 0, reasons };
}

export function assertPlannerActionInteraction(
  plan: Readonly<PlanRecord>,
  command: PlannerCommand,
): void {
  let decisionNodeId: string | undefined;
  if (command.action.kind === "select") {
    const decision = decisionById(plan, command.action.decisionNodeId);
    if (!decision) throw new Error(`Decision not found: ${command.action.decisionNodeId}`);
    if (!assessHumanInteraction(plan, decision).required) return;
    decisionNodeId = decision.decisionNodeId;
  } else if (
    command.action.kind === "update_constraints"
    || command.action.kind === "backtrack"
  ) {
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
