import type {
  PlanExecutionMutationResult,
  PlanHumanAcceptanceCommand,
  PlanItemVerificationCommand,
} from "./execution-types.js";
import {
  allCriteriaPassed,
  allPersistedVerificationsPassed,
} from "./execution-acceptance.js";
import {
  itemBindings,
  mutationFailure,
  PlanDomainError,
  requireCurrentApproval,
  requireStep,
  requireStepState,
} from "./execution-rules.js";
import { PlanStore } from "./store.js";
import type {
  PlanEvidence,
  PlanItemStatus,
  PlanStatus,
} from "./types.js";

const TERMINAL = new Set<PlanStatus>(["completed", "cancelled", "failed"]);

export class PlanExecutionState {
  constructor(private readonly store: PlanStore) {}

  async verifyItem(
    command: PlanItemVerificationCommand,
  ): Promise<PlanExecutionMutationResult> {
    try {
      const loaded = await this.store.load(command.planId);
      if (loaded.ok && loaded.plan?.schemaVersion === 1) {
        const item = loaded.plan.items.find((candidate) =>
          candidate.itemId === command.itemId
        );
        return item && allCriteriaPassed(item, loaded.plan, command)
          ? { ok: true, plan: loaded.plan, duplicate: false }
          : {
            ok: false,
            reason: "invalid_command",
            message: "Legacy acceptance criteria did not pass persisted evidence",
            plan: loaded.plan,
          };
      }
      const outcome = await this.store.applyCommand({
        planId: command.planId,
        expectedVersion: command.expectedVersion,
        commandId: command.commandId,
        operation: "verify_item",
        payload: command,
      }, (draft) => {
        if (draft.schemaVersion === 2) {
          throw new PlanDomainError(
            "invalid_command",
            "Schema v2 Plan verification is Host-owned",
          );
        }
        if (draft.status !== "executing") {
          throw new PlanDomainError("invalid_transition", "Plan is not executing");
        }
        requireCurrentApproval(draft, command.revision, command.digest);
        if (draft.mainAgentId !== command.callerAgentId) {
          throw new PlanDomainError("invalid_command", "Only the bound Main Agent can verify");
        }
        const step = requireStep(draft, command.itemId);
        const state = requireStepState(draft, command.itemId);
        if (!itemBindings(state).some((binding) =>
          binding.agentId === command.callerAgentId && binding.role === "main"
        )) {
          throw new PlanDomainError(
            "invalid_command",
            "Main Agent is not bound to execution step",
          );
        }
        if (!allPersistedVerificationsPassed(step, state, draft)) {
          throw new PlanDomainError(
            "invalid_command",
            "Plan verification did not pass against the persisted evidence.",
          );
        }
        state.status = "completed";
        if (draft.execution.steps.every((candidate) =>
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
        void draft;
        throw new PlanDomainError(
          "invalid_command",
          "Schema v2 Plans do not support human verification",
        );
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
        const state = requireStepState(draft, itemId);
        const allowed = state.status === "in_progress" && status === "blocked"
          || state.status === "blocked" && status === "in_progress"
          || state.status === "pending" && status === "skipped";
        if (!allowed) {
          throw new PlanDomainError("invalid_transition", "Illegal Plan item transition");
        }
        if (status === "skipped" && !skipReason?.trim()) {
          throw new PlanDomainError("invalid_command", "Skipped item requires a reason");
        }
        state.status = status;
        state.skipReason = status === "skipped" ? skipReason?.trim() : undefined;
        if (status === "skipped") draft.status = "needs_replan";
      }, { semanticChange: status === "skipped" });
      return result.ok
        ? { ok: true, plan: result.plan }
        : { ok: false, reason: "conflict", message: "Plan version conflict" };
    } catch (error) {
      return mutationFailure(error);
    }
  }

  async deriveReplan(
    planId: string,
    expectedVersion: number,
    plannerAgentId: string,
    mainAgentId?: string,
  ): Promise<PlanExecutionMutationResult> {
    try {
      const result = await this.store.update(planId, expectedVersion, (draft) => {
        if (draft.status !== "needs_replan") {
          throw new PlanDomainError("invalid_transition", "Plan does not need replanning");
        }
        draft.baseRevision = draft.revision;
        if (mainAgentId) draft.mainAgentId = mainAgentId;
        draft.plannerAgentId = plannerAgentId;
        draft.status = "drafting";
        draft.pendingInteraction = undefined;
        draft.execution.steps = draft.execution.steps.map((state) => ({
          ...state,
          executionBinding: undefined,
          executionBindings: [],
          status: state.status === "completed" ? "completed" : "pending",
          skipReason: undefined,
          evidence: state.evidence.map((evidence) =>
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
