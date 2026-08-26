import type { AgentExitResult } from "../../agents/process/types.js";
import {
  compileSelectedTrajectory,
  type PlanCompilation,
} from "./compiler.js";
import { PlanExecutionApproval } from "./execution-approval.js";
import { PlanExecutionRuntime } from "./execution-runtime.js";
import { PlanExecutionState } from "./execution-state.js";
import type {
  PlanApprovalCommand,
  PlanCancelCommand,
  PlanHumanAcceptanceCommand,
  PlanItemBindingCommand,
  PlanItemVerificationCommand,
  PlanMaterialConflictCommand,
  PlanToolAuthorization,
} from "./execution-types.js";
import { PlanStore } from "./store.js";
import type {
  PlanExecutionBinding,
  PlanItemStatus,
  PlanRecord,
} from "./types.js";

export interface PlanExecutionCallbacks {
  onReplanReady?(plan: Readonly<PlanRecord>): Promise<void> | void;
  onTerminal?(plan: Readonly<PlanRecord>): Promise<void> | void;
}

export class PlanExecutionService {
  private readonly approval: PlanExecutionApproval;
  private readonly runtime: PlanExecutionRuntime;
  private readonly state: PlanExecutionState;

  constructor(
    private readonly store: PlanStore,
    private readonly now: () => number = Date.now,
    callbacks: PlanExecutionCallbacks = {},
  ) {
    this.approval = new PlanExecutionApproval(store, now);
    this.state = new PlanExecutionState(store, now);
    this.runtime = new PlanExecutionRuntime(
      store,
      (command) => this.state.materialConflict(command),
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
  ) {
    return this.store.update(planId, expectedVersion, (draft) => {
      if (
        draft.plannerAgentId !== plannerAgentId
        || !["drafting", "awaiting_decision"].includes(draft.status)
      ) {
        throw new Error(`Planner cannot compile Plan ${planId}`);
      }
      draft.items = compileSelectedTrajectory(
        draft,
        compilation,
        this.store.projectPath,
      );
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
  ) {
    return this.runtime.recordToolResult(
      binding,
      toolCallId,
      toolName,
      args,
      result,
      isError,
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
    return this.store.persistInteraction(
      binding.planId,
      expectedVersion,
      {
        interactionId,
        kind: "acceptance",
        createdAt: this.now(),
        payload: {
          itemId: binding.itemId,
          criterionId,
          prompt: "Confirm the acceptance criterion",
        },
      },
      (draft) => {
        if (
          draft.status !== "executing"
          || draft.revision !== binding.revision
          || draft.digest !== binding.digest
        ) throw new Error("Plan execution binding is stale");
        const criterion = draft.items
          .find((item) => item.itemId === binding.itemId)
          ?.acceptanceCriteria.find((candidate) =>
            candidate.criterionId === criterionId
          );
        if (criterion?.kind !== "human") {
          throw new Error("Human acceptance criterion not found");
        }
      },
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

  deriveReplan(
    planId: string,
    expectedVersion: number,
    plannerAgentId: string,
  ) {
    if (this.runtime.hasInFlight(planId)) {
      return Promise.resolve({
        ok: false as const,
        reason: "invalid_transition" as const,
        message: "In-flight tool calls must settle before deriving a revision",
      });
    }
    return this.state.deriveReplan(planId, expectedVersion, plannerAgentId);
  }

  cancel(command: PlanCancelCommand) {
    return this.runtime.cancel(command);
  }

  load(planId: string) {
    return this.store.load(planId);
  }
}
