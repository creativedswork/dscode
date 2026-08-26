import { randomUUID } from "node:crypto";

import { applyPlannerAction } from "./planner-actions.js";
import {
  assessHumanInteraction,
  assertPlannerActionInteraction,
} from "./planner-policy.js";
import type { AgentExitResult } from "../../agents/process/types.js";
import type {
  NewPlanInteraction,
  NewPlanRecord,
} from "./store-types.js";
import { PlanStore } from "./store.js";
import type {
  PlanConstraint,
  PlanRecord,
} from "./types.js";
import {
  decisionById,
  MAX_PLAN_CANDIDATES,
  MAX_PLAN_DECISION_NODES,
  PlanBudgetError,
  type PlannerCommand,
  type PlannerDecisionInput,
  type PlannerFactInput,
  type PlannerMutationResult,
} from "./planner-types.js";

export class PlannerService {
  constructor(
    private readonly store: PlanStore,
    private readonly now: () => number = Date.now,
  ) {}

  create(input: NewPlanRecord) {
    return this.store.create(input);
  }

  load(planId: string) {
    return this.store.load(planId);
  }

  initialize(
    planId: string,
    plannerAgentId: string,
    expectedVersion: number,
    goal: string,
    constraints: PlanConstraint[],
  ) {
    return this.store.update(planId, expectedVersion, (draft) => {
      this.assertActivePlanner(draft, plannerAgentId);
      draft.goal = goal;
      draft.constraints = structuredClone(constraints);
    });
  }

  appendDecision(
    planId: string,
    plannerAgentId: string,
    expectedVersion: number,
    input: PlannerDecisionInput,
  ) {
    if (
      input.candidates.length < 1
      || input.candidates.length > MAX_PLAN_CANDIDATES
    ) {
      throw new PlanBudgetError(
        "candidates",
        "clarify",
        `Decision ${input.decisionNodeId} has ${input.candidates.length} candidates; `
          + `clarify the choice and provide between 1 and ${MAX_PLAN_CANDIDATES}`,
      );
    }
    return this.store.update(planId, expectedVersion, (draft) => {
      this.assertActivePlanner(draft, plannerAgentId);
      if (draft.decisions.length >= MAX_PLAN_DECISION_NODES) {
        const behavior = draft.decisions.some((decision) =>
          decision.status === "open"
        ) ? "clarify" : "commit";
        throw new PlanBudgetError(
          "decision_nodes",
          behavior,
          `Revision ${draft.revision} reached ${MAX_PLAN_DECISION_NODES} decision nodes; `
            + `${behavior === "clarify" ? "request a user choice" : "request final approval"}`,
        );
      }
      if (decisionById(draft, input.decisionNodeId)) {
        throw new Error(`Decision already exists: ${input.decisionNodeId}`);
      }
      const revision = draft.revision + 1;
      draft.decisions.push({
        ...structuredClone(input),
        status: "open",
      });
      for (const candidate of input.candidates) {
        draft.trajectoryEvents.push({
          eventId: randomUUID(),
          revision,
          recordedAt: this.now(),
          kind: "candidate_summarized",
          decisionNodeId: input.decisionNodeId,
          optionId: candidate.optionId,
          summary: candidate.rationale,
        });
      }
    });
  }

  recordFact(
    planId: string,
    plannerAgentId: string,
    expectedVersion: number,
    input: PlannerFactInput,
  ) {
    return this.store.update(planId, expectedVersion, (draft) => {
      this.assertActivePlanner(draft, plannerAgentId);
      draft.trajectoryEvents.push({
        eventId: randomUUID(),
        revision: draft.revision,
        recordedAt: this.now(),
        kind: "fact_recorded",
        summary: input.summary,
        references: structuredClone(input.references),
      });
    });
  }

  async requestDecision(
    planId: string,
    plannerAgentId: string,
    expectedVersion: number,
    interactionId: string,
    decisionNodeId: string,
  ): Promise<Readonly<PlanRecord>> {
    const plan = await this.requirePlan(planId);
    this.assertActivePlanner(plan, plannerAgentId);
    if (plan.version !== expectedVersion) {
      throw new Error(`Plan version conflict: expected ${expectedVersion}, current ${plan.version}`);
    }
    const decision = decisionById(plan, decisionNodeId);
    if (!decision || decision.status !== "open") {
      throw new Error(`Open decision not found: ${decisionNodeId}`);
    }
    const assessment = assessHumanInteraction(plan, decision);
    if (!assessment.required) return plan;
    return this.persistInteraction(plan, plannerAgentId, {
      interactionId,
      createdAt: this.now(),
      kind: "decision",
      payload: {
        decisionNodeId,
        candidateIds: decision.candidates.map((candidate) => candidate.optionId),
        prompt: assessment.reasons.join(","),
      },
    }, "awaiting_decision");
  }

  async requestApproval(
    planId: string,
    plannerAgentId: string,
    expectedVersion: number,
    interactionId: string,
  ): Promise<Readonly<PlanRecord>> {
    const plan = await this.requirePlan(planId);
    this.assertActivePlanner(plan, plannerAgentId);
    if (plan.version !== expectedVersion) {
      throw new Error(`Plan version conflict: expected ${expectedVersion}, current ${plan.version}`);
    }
    return this.persistInteraction(plan, plannerAgentId, {
      interactionId,
      createdAt: this.now(),
      kind: "approval",
      payload: {
        itemIds: plan.items.map((item) => item.itemId),
        effectCategories: [...new Set(
          plan.items.flatMap((item) => item.effectGrants.map((grant) => grant.effect)),
        )],
        sideEffectSummary: plan.sideEffectSummary,
      },
    }, "awaiting_approval");
  }

  async applyDecision(command: PlannerCommand): Promise<PlannerMutationResult> {
    const outcome = await this.store.applyCommand({
      planId: command.planId,
      expectedVersion: command.expectedVersion,
      commandId: command.commandId,
      payload: command.action,
      operation: command.action.kind,
      interactionId: command.interactionId,
      interactionPayloadDigest: command.interactionPayloadDigest,
    }, (draft) => {
      this.assertActivePlanner(draft, command.plannerAgentId);
      assertPlannerActionInteraction(draft, command);
      applyPlannerAction(draft, command.action, this.now());
    });
    if (outcome.ok) {
      return { ok: true, plan: outcome.plan, duplicate: outcome.duplicate };
    }
    return {
      ok: false,
      reason: outcome.reason,
      ...("plan" in outcome ? { plan: outcome.plan, message: outcome.message } : {}),
    };
  }
  async finishPlannerExit(
    planId: string,
    plannerAgentId: string,
    exit: Readonly<AgentExitResult>,
  ): Promise<Readonly<PlanRecord> | undefined> {
    const loaded = await this.load(planId);
    if (!loaded.ok || !loaded.plan) return undefined;
    if (loaded.plan.plannerAgentId !== plannerAgentId) return loaded.plan;
    if (["approved", "completed", "cancelled", "failed"].includes(loaded.plan.status)) {
      return loaded.plan;
    }
    const status = exit.state === "terminated" || exit.state === "killed"
      ? "cancelled"
      : "failed";
    const result = await this.store.update(
      planId,
      loaded.plan.version,
      (draft) => {
        this.assertActivePlanner(draft, plannerAgentId);
        const from = draft.status;
        draft.status = status;
        draft.pendingInteraction = undefined;
        draft.trajectoryEvents.push({
          eventId: randomUUID(),
          revision: draft.revision,
          recordedAt: this.now(),
          kind: "status_changed",
          from,
          to: status,
        });
        if (status === "failed") {
          draft.trajectoryEvents.push({
            eventId: randomUUID(),
            revision: draft.revision,
            recordedAt: this.now(),
            kind: "fact_recorded",
            summary: exit.error ?? "Planner exited before approval",
            references: [],
          });
        }
      },
    );
    if (!result.ok) return this.finishPlannerExit(planId, plannerAgentId, exit);
    return result.plan;
  }
  private async persistInteraction(
    plan: Readonly<PlanRecord>,
    plannerAgentId: string,
    interaction: NewPlanInteraction,
    status: "awaiting_decision" | "awaiting_approval",
  ): Promise<Readonly<PlanRecord>> {
    if (plan.pendingInteraction) {
      if (plan.pendingInteraction.interactionId === interaction.interactionId) return plan;
      throw new Error(`Interaction already pending: ${plan.pendingInteraction.interactionId}`);
    }
    const persisted = await this.store.persistInteraction(
      plan.planId,
      plan.version,
      interaction,
      (draft) => {
        this.assertActivePlanner(draft, plannerAgentId);
        draft.status = status;
        draft.trajectoryEvents.push({
          eventId: randomUUID(),
          revision: draft.revision,
          recordedAt: this.now(),
          kind: "status_changed",
          from: plan.status,
          to: status,
        });
      },
    );
    if (!persisted.ok) throw new Error("Plan changed while persisting interaction");
    return persisted.plan;
  }
  private async requirePlan(planId: string): Promise<Readonly<PlanRecord>> {
    const loaded = await this.store.load(planId);
    if (!loaded.ok || !loaded.plan) throw new Error(`Plan not found: ${planId}`);
    return loaded.plan;
  }
  private assertActivePlanner(
    plan: Readonly<PlanRecord>,
    plannerAgentId: string,
  ): void {
    if (plan.plannerAgentId !== plannerAgentId) {
      throw new Error(`Planner ${plannerAgentId} does not own Plan ${plan.planId}`);
    }
    if (!["drafting", "awaiting_decision", "awaiting_approval"].includes(plan.status)) {
      throw new Error(`Planner cannot mutate Plan ${plan.planId} in status ${plan.status}`);
    }
  }
}
