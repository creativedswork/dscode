import { randomUUID } from "node:crypto";

import type {
  PlanExecutionMutationResult,
  PlanHumanAcceptanceCommand,
  PlanItemVerificationCommand,
  PlanMaterialConflictCommand,
} from "./execution-types.js";
import { allCriteriaPassed } from "./execution-acceptance.js";
import {
  itemBindings,
  mutationFailure,
  PlanDomainError,
  requireCurrentApproval,
  requireItem,
} from "./execution-rules.js";
import { PlanStore } from "./store.js";
import type {
  PlanEvidence,
  PlanItemStatus,
  PlanStatus,
} from "./types.js";

const TERMINAL = new Set<PlanStatus>(["completed", "cancelled", "failed"]);

export class PlanExecutionState {
  constructor(
    private readonly store: PlanStore,
    private readonly now: () => number = Date.now,
  ) {}

  async verifyItem(
    command: PlanItemVerificationCommand,
  ): Promise<PlanExecutionMutationResult> {
    try {
      const outcome = await this.store.applyCommand({
        planId: command.planId,
        expectedVersion: command.expectedVersion,
        commandId: command.commandId,
        operation: "verify_item",
        payload: command,
      }, (draft) => {
        if (draft.status !== "executing") {
          throw new PlanDomainError("invalid_transition", "Plan is not executing");
        }
        requireCurrentApproval(draft, command.revision, command.digest);
        if (draft.mainAgentId !== command.callerAgentId) {
          throw new PlanDomainError("invalid_command", "Only the bound Main Agent can verify");
        }
        const item = requireItem(draft, command.itemId);
        if (!itemBindings(item).some((binding) =>
          binding.agentId === command.callerAgentId && binding.role === "main"
        )) {
          throw new PlanDomainError("invalid_command", "Main Agent is not bound to item");
        }
        if (!allCriteriaPassed(item, draft, command)) {
          throw new PlanDomainError(
            "invalid_command",
            "Acceptance criteria did not pass. Use exact persisted evidence IDs in the form tool-<toolCallId>, with a distinct evidence ID for each criterion.",
          );
        }
        item.status = "completed";
        if (draft.items.every((candidate) =>
          candidate.status === "completed" || candidate.status === "skipped"
        )) {
          draft.status = "completed";
        }
      });
      if (!outcome.ok) {
        return {
          ok: false,
          reason: outcome.reason === "conflict" ? "conflict" : "invalid_command",
          message: "Verification command was rejected",
          plan: outcome.reason === "conflict" ? outcome.conflict.current : outcome.plan,
        };
      }
      return { ok: true, plan: outcome.plan, duplicate: outcome.duplicate };
    } catch (error) {
      return mutationFailure(error);
    }
  }

  async recordHumanAcceptance(
    command: PlanHumanAcceptanceCommand,
  ): Promise<PlanExecutionMutationResult> {
    try {
      const outcome = await this.store.applyCommand({
        planId: command.planId,
        expectedVersion: command.expectedVersion,
        commandId: command.commandId,
        operation: "human_acceptance",
        payload: command,
        interactionId: command.interactionId,
        interactionPayloadDigest: command.interactionPayloadDigest,
      }, (draft) => {
        if (draft.status !== "executing") {
          throw new PlanDomainError("invalid_transition", "Plan is not executing");
        }
        requireCurrentApproval(draft, command.revision, command.digest);
        if (draft.mainAgentId !== command.callerAgentId) {
          throw new PlanDomainError("invalid_command", "Only Main can record human acceptance");
        }
        if (draft.approval?.acknowledgementReceiptCommandId === command.commandId) {
          throw new PlanDomainError("invalid_command", "Approval receipt cannot prove acceptance");
        }
        const item = requireItem(draft, command.itemId);
        const criterion = item.acceptanceCriteria.find((candidate) =>
          candidate.criterionId === command.criterionId
        );
        if (criterion?.kind !== "human") {
          throw new PlanDomainError("invalid_command", "Human criterion not found");
        }
        const interaction = draft.pendingInteraction;
        if (
          interaction?.kind !== "acceptance"
          || interaction.payload.itemId !== item.itemId
          || interaction.payload.criterionId !== criterion.criterionId
          || interaction.revision !== draft.revision
          || interaction.planDigest !== draft.digest
        ) {
          throw new PlanDomainError("invalid_command", "Human acceptance is not pending");
        }
        if (draft.items.some((candidate) => candidate.evidence.some((evidence) =>
          evidence.kind === "human_receipt"
          && evidence.receiptCommandId === command.commandId
        ))) {
          throw new PlanDomainError("invalid_command", "Human receipt was already consumed");
        }
        item.evidence.push({
          kind: "human_receipt",
          evidenceId: `human-${command.commandId}`,
          planId: draft.planId,
          revision: draft.revision,
          itemId: item.itemId,
          criterionId: criterion.criterionId,
          receiptCommandId: command.commandId,
          summary: command.summary.trim(),
          recordedAt: this.now(),
        });
      });
      if (!outcome.ok) {
        return {
          ok: false,
          reason: outcome.reason === "conflict" ? "conflict" : "invalid_command",
          message: "Human acceptance was rejected",
          ...("plan" in outcome ? { plan: outcome.plan } : {}),
        };
      }
      return { ok: true, plan: outcome.plan, duplicate: outcome.duplicate };
    } catch (error) {
      return mutationFailure(error);
    }
  }

  async transitionItem(
    planId: string,
    expectedVersion: number,
    itemId: string,
    status: PlanItemStatus,
    skipReason?: string,
  ): Promise<PlanExecutionMutationResult> {
    try {
      const result = await this.store.update(planId, expectedVersion, (draft) => {
        if (TERMINAL.has(draft.status)) {
          throw new PlanDomainError("invalid_transition", "Terminal Plan cannot change");
        }
        const item = requireItem(draft, itemId);
        const allowed = item.status === "in_progress" && status === "blocked"
          || item.status === "blocked" && status === "in_progress"
          || item.status === "pending" && status === "skipped";
        if (!allowed) {
          throw new PlanDomainError("invalid_transition", "Illegal Plan item transition");
        }
        if (status === "skipped" && !skipReason?.trim()) {
          throw new PlanDomainError("invalid_command", "Skipped item requires a reason");
        }
        item.status = status;
        item.skipReason = status === "skipped" ? skipReason?.trim() : undefined;
        if (status === "skipped") draft.status = "needs_replan";
      }, { semanticChange: status === "skipped" });
      return result.ok
        ? { ok: true, plan: result.plan }
        : { ok: false, reason: "conflict", message: "Plan version conflict" };
    } catch (error) {
      return mutationFailure(error);
    }
  }

  async materialConflict(
    command: PlanMaterialConflictCommand,
  ): Promise<PlanExecutionMutationResult> {
    try {
      const outcome = await this.store.applyCommand({
        ...command,
        operation: "material_conflict",
        payload: { summary: command.summary.trim() },
      }, (draft) => {
        if (draft.status !== "executing") {
          throw new PlanDomainError("invalid_transition", "Plan is no longer executing");
        }
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
          message: "Material conflict was rejected",
          plan: outcome.reason === "conflict" ? outcome.conflict.current : outcome.plan,
        };
      }
      if (outcome.duplicate && outcome.plan.status !== "needs_replan") {
        return {
          ok: false,
          reason: "conflict",
          message: "Material conflict receipt belongs to an older Plan state",
          plan: outcome.plan,
        };
      }
      return { ok: true, plan: outcome.plan, duplicate: outcome.duplicate };
    } catch (error) {
      return mutationFailure(error);
    }
  }

  async deriveReplan(
    planId: string,
    expectedVersion: number,
    plannerAgentId: string,
  ): Promise<PlanExecutionMutationResult> {
    try {
      const result = await this.store.update(planId, expectedVersion, (draft) => {
        if (draft.status !== "needs_replan") {
          throw new PlanDomainError("invalid_transition", "Plan does not need replanning");
        }
        draft.baseRevision = draft.revision;
        draft.plannerAgentId = plannerAgentId;
        draft.status = "drafting";
        draft.pendingInteraction = undefined;
        draft.items = draft.items.map((item) => ({
          ...item,
          executionBinding: undefined,
          executionBindings: [],
          status: item.status === "completed" ? "completed" : "pending",
          evidence: item.evidence.map((evidence) =>
            evidence.kind === "tool_result" || evidence.kind === "agent_exit"
              ? { ...evidence, acceptanceEligible: false }
              : evidence
          ) as PlanEvidence[],
        }));
      }, { semanticChange: true });
      return result.ok
        ? { ok: true, plan: result.plan }
        : { ok: false, reason: "conflict", message: "Plan version conflict" };
    } catch (error) {
      return mutationFailure(error);
    }
  }
}
