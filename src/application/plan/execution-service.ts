import type { AgentExitResult } from "../../agents/process/types.js";
import {
  compileSelectedTrajectory,
  type PlanCompilation,
} from "./compiler.js";
import { PlanExecutionApproval } from "./execution-approval.js";
import { PlanExecutionReplan } from "./execution-replan.js";
import { PlanExecutionRuntime } from "./execution-runtime.js";
import { PlanExecutionState } from "./execution-state.js";
import type {
  PlanApprovalCommand,
  PlanCancelCommand,
  PlanHumanAcceptanceCommand,
  PlanItemBindingCommand,
  PlanItemVerificationCommand,
  PlanMaterialConflictCommand,
  PlanRequestedReplanCommand,
  PlanToolAuthorization,
} from "./execution-types.js";
import type { ToolEffect } from "../../kernel/tool-effects.js";
import { PlanStore } from "./store.js";
import type { PlanCoordinationFailure } from "./plan-coordination.js";
import type {
  PlanExecutionBinding,
  PlanItemStatus,
  PlanRecord,
} from "./types.js";

export interface PlanExecutionCallbacks {
  onReplanReady?(plan: Readonly<PlanRecord>): Promise<void> | void;
  onTerminal?(plan: Readonly<PlanRecord>): Promise<void> | void;
  onCoordinationFailure?(failure: PlanCoordinationFailure): void;
}

export class PlanExecutionService {
  private readonly approval: PlanExecutionApproval;
  private readonly replan: PlanExecutionReplan;
  private readonly runtime: PlanExecutionRuntime;
  private readonly state: PlanExecutionState;

  constructor(
    private readonly store: PlanStore,
    private readonly now: () => number = Date.now,
    callbacks: PlanExecutionCallbacks = {},
  ) {
    this.approval = new PlanExecutionApproval(store, now);
    this.replan = new PlanExecutionReplan(store, now);
    this.state = new PlanExecutionState(store);
    this.runtime = new PlanExecutionRuntime(
      store,
      (command) => "conflictTarget" in command
        ? this.replan.materialConflict(command)
        : this.replan.requestReplan(command),
      callbacks,
      now,
    );
  }

  approve(command: PlanApprovalCommand) {
    return this.approval.approve(command);
  }

  compile(
    planId: string,
    plannerAgentId: string,
    expectedVersion: number,
    compilation: PlanCompilation,
    availableToolNames?: ReadonlySet<string>,
  ) {
    return this.store.update(planId, expectedVersion, (draft) => {
      if (
        draft.plannerAgentId !== plannerAgentId
        || !["drafting", "awaiting_decision"].includes(draft.status)
      ) {
        throw new Error(`Planner cannot compile Plan ${planId}`);
      }
      draft.executionSteps = compileSelectedTrajectory(
        draft,
        compilation,
        this.store.projectPath,
        availableToolNames,
      );
      draft.execution = {
        steps: draft.executionSteps.map((step) => ({
          stepId: step.stepId,
          status: "pending",
          evidence: [],
          executionBindings: [],
        })),
      };
      draft.sideEffectSummary = compilation.sideEffectSummary.trim();
      draft.status = "drafting";
    });
  }

  async bindItem(command: PlanItemBindingCommand) {
    const result = await this.approval.bindItem(command);
    if (result.ok) this.runtime.resume(command.planId);
    return result;
  }

  authorizeTool(authorization: PlanToolAuthorization) {
    return this.runtime.authorizeTool(authorization);
  }

  hasInFlight(planId: string): boolean {
    return this.runtime.hasInFlight(planId);
  }

  releaseTool(binding: PlanExecutionBinding) {
    return this.runtime.releaseTool(binding);
  }

  recordToolResult(
    binding: PlanExecutionBinding,
    toolCallId: string,
    toolName: string,
    args: unknown,
    result: unknown,
    isError: boolean,
    effect?: ToolEffect,
    settleLifecycle?: boolean,
  ) {
    return this.runtime.recordToolResult(
      binding,
      toolCallId,
      toolName,
      args,
      result,
      isError,
      effect,
      settleLifecycle,
    );
  }

  recordProgress(
    binding: PlanExecutionBinding,
    phase: string,
    summary: string,
  ): Promise<void> {
    return this.runtime.recordAgentEvidence(binding, {
      planId: binding.planId,
      revision: binding.revision,
      itemId: binding.itemId,
      kind: "agent_progress",
      evidenceId: `progress-${binding.agentId}-${this.now()}`,
      agentId: binding.agentId,
      phase,
      summary,
      recordedAt: this.now(),
    });
  }

  recordExit(
    binding: PlanExecutionBinding,
    exit: Readonly<AgentExitResult>,
  ): Promise<void> {
    return this.runtime.recordAgentEvidence(binding, {
      planId: binding.planId,
      revision: binding.revision,
      itemId: binding.itemId,
      kind: "agent_exit",
      evidenceId: `exit-${exit.agentId}-${exit.endedAt}`,
      agentId: exit.agentId,
      outcome: exit.state,
      acceptanceEligible: true,
      summary: exit.output ?? exit.error ?? exit.state,
      recordedAt: exit.endedAt,
    });
  }

  recordHumanAcceptance(command: PlanHumanAcceptanceCommand) {
    return this.state.recordHumanAcceptance(command);
  }

  requestHumanAcceptance(
    binding: PlanExecutionBinding,
    expectedVersion: number,
    criterionId: string,
    interactionId: string,
  ) {
    void expectedVersion;
    void criterionId;
    void interactionId;
    throw new Error(
      `Schema v2 Plan ${binding.planId} does not support human verification`,
    );
  }

  async verifyItem(command: PlanItemVerificationCommand) {
    const result = await this.state.verifyItem(command);
    if (result.ok && result.plan.status === "completed") {
      await this.runtime.notifyTerminal(result.plan);
    }
    return result;
  }

  transitionItem(
    planId: string,
    expectedVersion: number,
    itemId: string,
    status: PlanItemStatus,
    reason?: string,
  ) {
    return this.state.transitionItem(planId, expectedVersion, itemId, status, reason);
  }

  materialConflict(command: PlanMaterialConflictCommand) {
    return this.runtime.reportMaterialConflict(command);
  }

  requestReplan(command: PlanRequestedReplanCommand) {
    return this.runtime.requestReplan(command);
  }

  deriveReplan(
    planId: string,
    expectedVersion: number,
    plannerAgentId: string,
    mainAgentId?: string,
  ) {
    if (this.runtime.hasInFlight(planId)) {
      return Promise.resolve({
        ok: false as const,
        reason: "invalid_transition" as const,
        message: "In-flight tool calls must settle before deriving a revision",
      });
    }
    return this.state.deriveReplan(
      planId,
      expectedVersion,
      plannerAgentId,
      mainAgentId,
    );
  }

  cancel(command: PlanCancelCommand) {
    return this.runtime.cancel(command);
  }

  load(planId: string) {
    return this.store.load(planId);
  }
}
