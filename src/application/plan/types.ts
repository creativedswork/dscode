import type { ToolEffect } from "../../kernel/tool-effects.js";

export type PlanStatus =
  | "drafting"
  | "awaiting_decision"
  | "awaiting_approval"
  | "approved"
  | "executing"
  | "needs_replan"
  | "completed"
  | "cancelled"
  | "failed";

export type PlanConstraintKind = "hard" | "preference";
export type PlanConstraintSource = "user" | "system" | "evidence";

export interface PlanConstraint {
  constraintId: string;
  kind: PlanConstraintKind;
  description: string;
  source: PlanConstraintSource;
}

export type PlanEvidenceReference =
  | { kind: "file"; referenceId: string; path: string; description: string }
  | { kind: "command"; referenceId: string; command: string; description: string }
  | { kind: "external"; referenceId: string; uri: string; description: string };

export type PlanCandidateCost = "low" | "medium" | "high";
export type PlanCandidateReversibility = "reversible" | "partial" | "irreversible";
export type PlanConstraintFit = "satisfies" | "uncertain" | "violates";

export interface PlanCandidate {
  optionId: string;
  summary: string;
  affectedScopes: string[];
  evidence: PlanEvidenceReference[];
  risks: string[];
  cost: PlanCandidateCost;
  reversibility: PlanCandidateReversibility;
  constraintFit: PlanConstraintFit;
  recommended: boolean;
  rationale: string;
}

export type PlanDecisionStatus = "open" | "selected" | "invalidated";

export interface PlanDecisionNode {
  decisionNodeId: string;
  question: string;
  status: PlanDecisionStatus;
  candidates: PlanCandidate[];
  selectedOptionId?: string;
}

export type PlanEffectCategory = ToolEffect;

export type PlanResourceScope =
  | { kind: "workspace_path"; pattern: string }
  | { kind: "process_command"; commandClass: string }
  | { kind: "network_origin"; origin: string }
  | { kind: "external_resource"; resourceType: string; resourceId: string };

export interface PlanEffectGrant {
  effect: PlanEffectCategory;
  resourceScopes: PlanResourceScope[];
}

export type PlanAcceptanceCriterion =
  | {
      kind: "command";
      criterionId: string;
      command: string;
      expectedExitCode: number;
    }
  | {
      kind: "observable";
      criterionId: string;
      description: string;
    }
  | {
      kind: "human";
      criterionId: string;
      prompt: string;
    };

export type PlanEvidence =
  | {
      kind: "agent_progress";
      evidenceId: string;
      agentId: string;
      phase: string;
      summary: string;
      recordedAt: number;
    }
  | {
      kind: "tool_result";
      evidenceId: string;
      toolCallId: string;
      summary: string;
      recordedAt: number;
    }
  | {
      kind: "agent_exit";
      evidenceId: string;
      agentId: string;
      outcome: "completed" | "failed" | "terminated" | "killed";
      summary: string;
      recordedAt: number;
    }
  | {
      kind: "human_receipt";
      evidenceId: string;
      receiptCommandId: string;
      summary: string;
      recordedAt: number;
    };

export interface PlanExecutionBinding {
  agentId: string;
  role: "main" | "subagent";
  planId: string;
  revision: number;
  digest: string;
  itemId: string;
  boundAt: number;
}

export type PlanItemStatus =
  | "pending"
  | "in_progress"
  | "blocked"
  | "completed"
  | "skipped";

export interface PlanItem {
  itemId: string;
  order: number;
  title: string;
  description: string;
  dependsOn: string[];
  status: PlanItemStatus;
  acceptanceCriteria: PlanAcceptanceCriterion[];
  effectGrants: PlanEffectGrant[];
  evidence: PlanEvidence[];
  executionBinding?: PlanExecutionBinding;
}

export interface PlanApproval {
  revision: number;
  digest: string;
  approvedEffects: PlanEffectCategory[];
  acknowledgedSideEffects: string[];
  interactionId: string;
  approvedAt: number;
}

interface PlanInteractionBase {
  interactionId: string;
  revision: number;
  planDigest: string;
  payloadDigest: string;
  createdAt: number;
  state: "pending" | "resolving";
}

export type PlanInteraction =
  | PlanInteractionBase & {
      kind: "decision";
      payload: {
        decisionNodeId: string;
        candidateIds: string[];
        prompt: string;
      };
    }
  | PlanInteractionBase & {
      kind: "approval";
      payload: {
        itemIds: string[];
        effectCategories: PlanEffectCategory[];
        sideEffectSummary: string;
      };
    };

export type PlanCommandReceiptResult =
  | { kind: "interaction_consumed"; interactionId: string }
  | { kind: "mutation_applied"; operation: string };

export interface PlanCommandReceipt {
  commandId: string;
  interactionId?: string;
  payloadDigest: string;
  result: PlanCommandReceiptResult;
  resultingVersion: number;
  completedAt: number;
}

interface PlanTrajectoryEventBase {
  eventId: string;
  revision: number;
  recordedAt: number;
}

export type PlanTrajectoryEvent =
  | PlanTrajectoryEventBase & {
      kind: "status_changed";
      from: PlanStatus;
      to: PlanStatus;
    }
  | PlanTrajectoryEventBase & {
      kind: "decision_recorded";
      decisionNodeId: string;
      optionId: string;
      summary: string;
    }
  | PlanTrajectoryEventBase & {
      kind: "candidate_summarized";
      decisionNodeId: string;
      optionId: string;
      summary: string;
    }
  | PlanTrajectoryEventBase & {
      kind: "fact_recorded";
      summary: string;
      references: PlanEvidenceReference[];
    }
  | PlanTrajectoryEventBase & {
      kind: "evidence_recorded";
      reference: PlanEvidenceReference;
    }
  | PlanTrajectoryEventBase & {
      kind: "backtracked";
      targetDecisionNodeId: string;
      summary: string;
    };

export interface PlanTelemetry {
  lastProgressAt?: number;
  counters: Record<string, number>;
}

export interface PlanRecord {
  schemaVersion: 1;
  planId: string;
  projectKey: string;
  sessionId: string;
  mainAgentId: string;
  plannerAgentId?: string;
  request: {
    requestId: string;
    text: string;
    submittedAt: number;
  };
  status: PlanStatus;
  version: number;
  revision: number;
  baseRevision?: number;
  digest: string;
  goal: string;
  constraints: PlanConstraint[];
  decisions: PlanDecisionNode[];
  items: PlanItem[];
  sideEffectSummary: string;
  approval?: PlanApproval;
  pendingInteraction?: PlanInteraction;
  commandReceipts: PlanCommandReceipt[];
  trajectoryEvents: PlanTrajectoryEvent[];
  telemetry?: PlanTelemetry;
  createdAt: number;
  updatedAt: number;
}

export function assertNever(value: never): never {
  throw new Error(`Unhandled Plan union member: ${JSON.stringify(value)}`);
}
