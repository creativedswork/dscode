import type { ToolEffect } from "../../kernel/tool-effects.js";
import type {
  PlanExecutionBinding,
  PlanRecord,
  PlanResourceScope,
} from "./types.js";

export interface PlanApprovalCommand {
  planId: string;
  expectedVersion: number;
  commandId: string;
  interactionId: string;
  interactionPayloadDigest: string;
  revision: number;
  digest: string;
  acknowledgedEffects: ToolEffect[];
}

export interface PlanCancelCommand {
  planId: string;
  expectedVersion: number;
  commandId: string;
}

export interface PlanItemBindingCommand {
  planId: string;
  expectedVersion: number;
  revision: number;
  digest: string;
  itemId: string;
  agentId: string;
  role: "main" | "subagent";
}

export interface PlanCriterionResult {
  criterionId: string;
  passed: boolean;
  evidenceIds: string[];
  observedExitCode?: number;
  observed?: {
    matched: boolean;
    description: string;
  };
  humanReceiptCommandId?: string;
}

export interface PlanHumanAcceptanceCommand {
  planId: string;
  expectedVersion: number;
  commandId: string;
  interactionId: string;
  interactionPayloadDigest: string;
  revision: number;
  digest: string;
  itemId: string;
  criterionId: string;
  callerAgentId: string;
  summary: string;
}

export interface PlanMaterialConflictCommand {
  planId: string;
  expectedVersion: number;
  commandId: string;
  revision: number;
  digest: string;
  itemId: string;
  callerAgentId: string;
  conflictTarget:
    | { kind: "hard_constraint"; constraintId: string }
    | {
        kind: "selected_decision";
        decisionNodeId: string;
        optionId: string;
      };
  evidenceIds: string[];
  summary: string;
}

export interface PlanRequestedReplanCommand {
  planId: string;
  expectedVersion: number;
  commandId: string;
  summary: string;
}

export type PlanReplanTransitionCommand =
  | PlanMaterialConflictCommand
  | PlanRequestedReplanCommand;

export interface PlanItemVerificationCommand {
  planId: string;
  expectedVersion: number;
  commandId: string;
  revision: number;
  digest: string;
  itemId: string;
  callerAgentId: string;
  criteria: PlanCriterionResult[];
}

export interface PlanToolAuthorization {
  binding: PlanExecutionBinding;
  toolCallId: string;
  toolName: string;
  effect: ToolEffect;
  resourceScopes: PlanResourceScope[];
}

export type PlanExecutionMutationResult =
  | { ok: true; plan: Readonly<PlanRecord>; duplicate?: boolean }
  | {
      ok: false;
      reason:
        | "conflict"
        | "stale_approval"
        | "invalid_transition"
        | "invalid_command";
      message: string;
      plan?: Readonly<PlanRecord>;
    };

export type PlanToolAuthorizationResult =
  | { ok: true; plan: Readonly<PlanRecord> }
  | {
      ok: false;
      reason:
        | "stale_binding"
        | "invalid_transition"
        | "invalid_command"
        | "effect_mismatch"
        | "scope_mismatch"
        | "conflict";
      message: string;
      plan?: Readonly<PlanRecord>;
    };
