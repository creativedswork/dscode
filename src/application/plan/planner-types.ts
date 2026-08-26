import type {
  PlanCandidate,
  PlanConstraint,
  PlanDecisionNode,
  PlanEvidenceReference,
  PlanRecord,
} from "./types.js";

export const MAX_PLAN_CANDIDATES = 3;
export const MAX_PLAN_DECISION_NODES = 6;

export type PlanConstraintPatch =
  | { kind: "set"; constraint: PlanConstraint }
  | { kind: "remove"; constraintId: string };

export type PlanDecisionAction =
  | {
      kind: "select";
      decisionNodeId: string;
      optionId: string;
    }
  | {
      kind: "investigate";
      decisionNodeId: string;
      optionId?: string;
      question?: string;
    }
  | {
      kind: "update_constraints";
      constraints: readonly PlanConstraintPatch[];
    }
  | {
      kind: "backtrack";
      targetDecisionNodeId: string;
    };

export interface PlannerDecisionInput {
  decisionNodeId: string;
  question: string;
  candidates: PlanCandidate[];
}

export interface PlannerFactInput {
  summary: string;
  references: PlanEvidenceReference[];
}

export type PlanBudgetBehavior = "clarify" | "commit";

export class PlanBudgetError extends Error {
  constructor(
    readonly limit: "candidates" | "decision_nodes",
    readonly behavior: PlanBudgetBehavior,
    message: string,
  ) {
    super(message);
    this.name = "PlanBudgetError";
  }
}

export type HumanInteractionReason =
  | "multiple_viable_candidates"
  | "high_impact_tradeoff"
  | "constraints_missing"
  | "final_approval";

export interface HumanInteractionAssessment {
  required: boolean;
  reasons: HumanInteractionReason[];
}

export interface PlannerCommand {
  planId: string;
  plannerAgentId: string;
  expectedVersion: number;
  commandId: string;
  interactionId?: string;
  interactionPayloadDigest?: string;
  action: PlanDecisionAction;
}

export type PlannerMutationResult =
  | {
      ok: true;
      plan: Readonly<PlanRecord>;
      duplicate: boolean;
    }
  | {
      ok: false;
      reason:
        | "conflict"
        | "command_id_reused"
        | "interaction_not_pending"
        | "interaction_digest_mismatch";
      plan?: Readonly<PlanRecord>;
      message?: string;
    };

export function decisionById(
  plan: Readonly<PlanRecord>,
  decisionNodeId: string,
): Readonly<PlanDecisionNode> | undefined {
  return plan.decisions.find((decision) =>
    decision.decisionNodeId === decisionNodeId
  );
}
