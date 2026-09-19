import type { ToolEffect } from "../../kernel/tool-effects.js";
import type { PlanDecisionAction } from "./planner-types.js";
import type { PlanConflict } from "./store-types.js";
import type {
  PlanCandidate,
  PlanCommandReceipt,
  PlanItem,
  PlanRecord,
} from "./types.js";
import type {
  PlanApprovalCommand,
  PlanCancelCommand,
  PlanItemVerificationCommand,
} from "./execution-types.js";
import type {
  ExecutionAdjustPlanCommand,
  ExecutionContinueCommand,
  ExecutionEpisodeSnapshot,
  ExecutionRecoveryResult,
} from "./execution-episode-types.js";

export interface PlanDecisionCommand {
  planId: string;
  expectedVersion: number;
  commandId: string;
  interactionId?: string;
  interactionPayloadDigest?: string;
  action: PlanDecisionAction;
}

export interface PlanReplanCommand {
  planId: string;
  expectedVersion: number;
  commandId: string;
  reason: string;
}

export type PlanMutationResult =
  | {
      ok: true;
      plan: Readonly<PlanRecord>;
      receipt: Readonly<PlanCommandReceipt>;
      duplicate: boolean;
    }
  | {
      ok: false;
      reason: "conflict";
      conflict: PlanConflict;
    }
  | {
      ok: false;
      reason: "invalid_transition" | "invalid_command";
      message: string;
      plan?: Readonly<PlanRecord>;
    };

export interface PlanDecisionRequest {
  interactionId: string;
  planId: string;
  version: number;
  revision: number;
  decisionNodeId: string;
  prompt: string;
  candidates: readonly Readonly<PlanCandidate>[];
}

export interface PlanApprovalRequest {
  interactionId: string;
  planId: string;
  version: number;
  revision: number;
  digest: string;
  items: readonly Readonly<PlanItem>[];
  effectCategories: readonly ToolEffect[];
  sideEffectSummary: string;
}

export interface PlanInteractionPort {
  requestPlanDecision(request: PlanDecisionRequest): Promise<void>;
  requestPlanApproval(request: PlanApprovalRequest): Promise<void>;
}

export interface PlanApplicationPort {
  getActivePlan(sessionId: string): Promise<Readonly<PlanRecord> | undefined>;
  getLatestPlan(sessionId: string): Promise<Readonly<PlanRecord> | undefined>;
  submitDecision(command: PlanDecisionCommand): Promise<PlanMutationResult>;
  approve(command: PlanApprovalCommand): Promise<PlanMutationResult>;
  verifyItem(command: PlanItemVerificationCommand): Promise<PlanMutationResult>;
  requestReplan(command: PlanReplanCommand): Promise<PlanMutationResult>;
  cancel(command: PlanCancelCommand): Promise<PlanMutationResult>;
  getEpisode(planId: string): Promise<Readonly<ExecutionEpisodeSnapshot> | undefined>;
  adjustPlan(command: ExecutionAdjustPlanCommand): Promise<ExecutionRecoveryResult>;
  continueExecution(command: ExecutionContinueCommand): Promise<ExecutionRecoveryResult>;
}

export type {
  PlanApprovalCommand,
  PlanCancelCommand,
  PlanItemVerificationCommand,
};
