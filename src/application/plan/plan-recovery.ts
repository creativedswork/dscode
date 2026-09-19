import { randomUUID } from "node:crypto";

import type { AgentProcess } from "../../agents/process/types.js";
import { PlanDomainError } from "./execution-rules.js";
import { planExecutionUnits } from "./execution-model.js";
import { PlanStore } from "./store.js";
import type {
  PlanExecutionBinding,
  PlanExecutionStepState,
  PlanRecord,
} from "./types.js";

const RECOVERABLE_PLANNING_STATUSES = new Set([
  "drafting",
  "awaiting_decision",
  "awaiting_approval",
]);

function bindingsForItem(
  item: Readonly<PlanExecutionStepState>,
): readonly PlanExecutionBinding[] {
  return item.executionBindings
    ?? (item.executionBinding ? [item.executionBinding] : []);
}

export function validMainRecoveryBinding(
  plan: Readonly<PlanRecord>,
  main: Readonly<AgentProcess>,
): Readonly<PlanExecutionBinding> | undefined {
  const active = main.context.activePlan;
  const binding = main.context.planBinding;
  if (
    plan.mainAgentId !== main.agentId
    || plan.sessionId !== main.parentSessionId
    || active?.planId !== plan.planId
    || active.revision !== plan.revision
    || active.digest !== plan.digest
    || !binding
    || binding.agentId !== main.agentId
    || binding.role !== "main"
    || binding.planId !== plan.planId
    || binding.revision !== plan.revision
    || binding.digest !== plan.digest
  ) {
    return undefined;
  }
  const item = planExecutionUnits(plan).find((candidate) =>
    candidate.stepId === binding.itemId
  );
  if (
    item?.status !== "in_progress"
    || !bindingsForItem(item).some((candidate) =>
      candidate.agentId === binding.agentId
      && candidate.role === binding.role
      && candidate.planId === binding.planId
      && candidate.revision === binding.revision
      && candidate.digest === binding.digest
      && candidate.itemId === binding.itemId
      && candidate.boundAt === binding.boundAt
    )
  ) {
    return undefined;
  }
  return binding;
}

export class PlanRecoveryService {
  constructor(
    private readonly store: PlanStore,
    private readonly now: () => number = Date.now,
  ) {}

  rebindPlanner(
    planId: string,
    expectedVersion: number,
    mainAgentId: string,
    plannerAgentId: string,
  ) {
    return this.store.update(planId, expectedVersion, (draft) => {
      if (!RECOVERABLE_PLANNING_STATUSES.has(draft.status)) {
        throw new PlanDomainError(
          "invalid_transition",
          `Plan ${planId} cannot restore a Planner from ${draft.status}`,
        );
      }
      draft.mainAgentId = mainAgentId;
      draft.plannerAgentId = plannerAgentId;
    });
  }

  invalidateExecution(
    planId: string,
    expectedVersion: number,
    mainAgentId: string,
  ) {
    return this.store.update(planId, expectedVersion, (draft) => {
      if (draft.status !== "approved" && draft.status !== "executing") {
        throw new PlanDomainError(
          "invalid_transition",
          `Plan ${planId} is not awaiting execution recovery`,
        );
      }
      const from = draft.status;
      draft.status = "needs_replan";
      draft.mainAgentId = mainAgentId;
      draft.plannerAgentId = undefined;
      draft.approval = undefined;
      draft.pendingInteraction = undefined;
      for (const state of draft.execution.steps) {
        state.executionBinding = undefined;
        state.executionBindings = [];
        if (state.status !== "completed") {
          state.status = "pending";
          state.skipReason = undefined;
        }
      }
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
        summary: "Execution recovery rejected an invalid Main Plan binding.",
        references: [],
      });
    });
  }
}
