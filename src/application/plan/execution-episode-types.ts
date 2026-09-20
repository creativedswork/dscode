import type { PlanItemStatus } from "./types.js";
import type { TaskStatus, TodoStatus } from "../../agents/process/task-state.js";

export const EXECUTION_EPISODE_POLICY = Object.freeze({
  maxTurns: 12,
  maxToolCalls: 80,
  maxNoProgressActions: 16,
  maxEquivalentActions: 3,
  reflectionMaxTurns: 4,
  reflectionMaxToolCalls: 20,
});

export interface ExecutionEpisodePolicy {
  maxTurns: number;
  maxToolCalls: number;
  maxNoProgressActions: number;
  maxEquivalentActions: number;
  reflectionMaxTurns: number;
  reflectionMaxToolCalls: number;
}

export type ExecutionEpisodePhase =
  | "running"
  | "reflecting"
  | "paused_inconclusive"
  | "completed";

export interface ExecutionProgressSnapshot {
  passedVerificationIds: string[];
  planSteps: Array<{ stepId: string; status: PlanItemStatus }>;
  task?: {
    status: TaskStatus;
    todos: Array<{
      todoId: string;
      status: TodoStatus;
      result?: string;
      blocker?: {
        kind: string;
        reason: string;
        recovery: string;
      };
    }>;
  };
}

export type ExecutionOutcomeClass =
  | "succeeded"
  | "rejected"
  | "failed"
  | "inconclusive";

export interface ExecutionActionFingerprint {
  action: string;
  semanticArguments: unknown;
  outcomeClass: ExecutionOutcomeClass;
  fingerprint: string;
}

export type ExecutionImpasseRule =
  | "max_turns"
  | "max_tool_calls"
  | "max_no_progress_actions"
  | "max_equivalent_actions";

export interface ExecutionIncidentSummary {
  rule: ExecutionImpasseRule;
  occurredAt: number;
  reflectionAvailable: boolean;
  unchangedProgress: ExecutionProgressSnapshot;
  equivalentActionCount?: number;
  fingerprint?: string;
  errors: string[];
}

export interface ExecutionEpisodeSnapshot {
  episodeId: string;
  planId: string;
  planRevision: number;
  planDigest: string;
  sessionId: string;
  mainAgentId: string;
  phase: ExecutionEpisodePhase;
  policy: ExecutionEpisodePolicy;
  turnCount: number;
  toolCallCount: number;
  noProgressActionCount: number;
  reflectionUsed: boolean;
  startedAt: number;
  updatedAt: number;
  progress: ExecutionProgressSnapshot;
  incident?: ExecutionIncidentSummary;
}

export interface PersistedExecutionEpisode extends ExecutionEpisodeSnapshot {
  recentFingerprints: string[];
  recoveryReceipts: ExecutionRecoveryReceipt[];
}

export interface ExecutionRecoveryCommand {
  commandId: string;
  planId: string;
  expectedVersion: number;
  revision: number;
  digest: string;
  operation: "adjust_plan" | "continue_execution";
}

export type ExecutionAdjustPlanCommand = ExecutionRecoveryCommand & {
  operation: "adjust_plan";
};

export type ExecutionContinueCommand = ExecutionRecoveryCommand & {
  operation: "continue_execution";
};

export interface ExecutionRecoveryReceipt {
  commandId: string;
  operation: ExecutionRecoveryCommand["operation"];
  payloadDigest: string;
  resultingVersion: number;
  episodeId?: string;
  completedAt: number;
}

export type ExecutionRecoveryResult =
  | {
      ok: true;
      episode: Readonly<ExecutionEpisodeSnapshot>;
      receipt: Readonly<ExecutionRecoveryReceipt>;
      duplicate: boolean;
    }
  | {
      ok: false;
      reason: "conflict" | "invalid_phase" | "command_id_reused";
      episode?: Readonly<ExecutionEpisodeSnapshot>;
    };
