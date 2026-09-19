import { randomUUID } from "node:crypto";

import type {
  PlanExecutionMutationResult,
  PlanMaterialConflictCommand,
  PlanRequestedReplanCommand,
} from "./execution-types.js";
import {
  itemBindings,
  mutationFailure,
  PlanDomainError,
  requireCurrentApproval,
  requireStepState,
} from "./execution-rules.js";
import { PlanStore } from "./store.js";
import type { PlanRecord } from "./types.js";

interface ReplanCommand {
  planId: string;
  expectedVersion: number;
  commandId: string;
  summary: string;
}

export class PlanExecutionReplan {
  constructor(
    private readonly store: PlanStore,
    private readonly now: () => number = Date.now,
  ) {}

  materialConflict(
    command: PlanMaterialConflictCommand,
  ): Promise<PlanExecutionMutationResult> {
    return this.transition(command, "material_conflict", () => {
      return {
        revision: command.revision,
        digest: command.digest,
        itemId: command.itemId,
        callerAgentId: command.callerAgentId,
        conflictTarget: command.conflictTarget,
        evidenceIds: command.evidenceIds,
        summary: command.summary.trim(),
      };
    }, (draft) => this.validateMaterialConflict(draft, command));
  }

  requestReplan(
    command: PlanRequestedReplanCommand,
  ): Promise<PlanExecutionMutationResult> {
    return this.transition(
      command,
      "request_replan",
      () => ({ summary: command.summary.trim() }),
    );
  }

  private async transition(
    command: ReplanCommand,
    operation: string,
    payload: () => unknown,
    validate?: (draft: PlanRecord) => void,
  ): Promise<PlanExecutionMutationResult> {
    try {
      const outcome = await this.store.applyCommand({
        ...command,
        operation,
        payload: payload(),
      }, (draft) => {
        if (draft.status !== "executing") {
          throw new PlanDomainError("invalid_transition", "Plan is no longer executing");
        }
        if (!command.summary.trim()) {
          throw new PlanDomainError("invalid_command", "Replan summary is required");
        }
        validate?.(draft);
        const from = draft.status;
        draft.status = "needs_replan";
        draft.approval = undefined;
        draft.trajectoryEvents.push({
          eventId: randomUUID(),
          revision: draft.revision,
          recordedAt: this.now(),
          kind: "status_changed",
          from,
          to: "needs_replan",
        }, {
          eventId: randomUUID(),
          revision: draft.revision,
          recordedAt: this.now(),
          kind: "fact_recorded",
          summary: command.summary.trim(),
          references: [],
        });
      });
      if (!outcome.ok) {
        return {
          ok: false,
          reason: outcome.reason === "conflict" ? "conflict" : "invalid_command",
          message: "Replan request was rejected",
          plan: outcome.reason === "conflict" ? outcome.conflict.current : outcome.plan,
        };
      }
      if (outcome.duplicate && outcome.plan.status !== "needs_replan") {
        return {
          ok: false,
          reason: "conflict",
          message: "Replan receipt belongs to an older Plan state",
          plan: outcome.plan,
        };
      }
      return { ok: true, plan: outcome.plan, duplicate: outcome.duplicate };
    } catch (error) {
      return mutationFailure(error);
    }
  }

  private validateMaterialConflict(
    draft: PlanRecord,
    command: PlanMaterialConflictCommand,
  ): void {
    requireCurrentApproval(draft, command.revision, command.digest);
    if (draft.mainAgentId !== command.callerAgentId) {
      throw new PlanDomainError(
        "invalid_command",
        "Only the bound Main Agent can report a material conflict",
      );
    }
    const state = requireStepState(draft, command.itemId);
    if (
      state.status !== "in_progress"
      || !itemBindings(state).some((binding) =>
        binding.agentId === command.callerAgentId
        && binding.role === "main"
        && binding.planId === draft.planId
        && binding.revision === draft.revision
        && binding.digest === draft.digest
        && binding.itemId === state.stepId
      )
    ) {
      throw new PlanDomainError(
        "invalid_command",
        "Main Agent is not bound to the current Plan item",
      );
    }
    const target = command.conflictTarget;
    if (target.kind === "hard_constraint") {
      const constraint = draft.constraints.find((candidate) =>
        candidate.constraintId === target.constraintId
      );
      if (constraint?.kind !== "hard") {
        throw new PlanDomainError("invalid_command", "Hard constraint not found");
      }
    } else {
      const decision = draft.decisions.find((candidate) =>
        candidate.decisionNodeId === target.decisionNodeId
      );
      if (
        decision?.status !== "selected"
        || decision.selectedOptionId !== target.optionId
      ) {
        throw new PlanDomainError("invalid_command", "Selected decision not found");
      }
    }
    if (
      command.evidenceIds.length === 0
      || new Set(command.evidenceIds).size !== command.evidenceIds.length
      || command.evidenceIds.some((evidenceId) => {
        const evidence = state.evidence.find((candidate) =>
          candidate.evidenceId === evidenceId
        );
        return evidence?.kind !== "tool_result"
          || evidence.planId !== draft.planId
          || evidence.revision !== draft.revision
          || evidence.itemId !== state.stepId
          || !evidence.acceptanceEligible
          || evidence.isError
          || evidence.structuredOutcome !== "success";
      })
    ) {
      throw new PlanDomainError(
        "invalid_command",
        "Material conflict requires successful objective evidence from the current item",
      );
    }
  }
}
