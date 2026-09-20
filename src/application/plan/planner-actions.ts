import { randomUUID } from "node:crypto";

import type { PlanDecisionAction } from "./planner-types.js";
import type {
  PlanDecisionNode,
  PlanRecord,
} from "./types.js";

function resolvePendingRequirements(
  draft: PlanRecord,
  decision: PlanDecisionNode,
  recordDecision = true,
): void {
  const interaction = draft.pendingInteraction;
  if (
    interaction?.kind !== "decision"
    || interaction.payload.decisionNodeId !== decision.decisionNodeId
  ) return;
  for (const requirementId of decision.resolvesRequirementIds ?? []) {
    const requirement = draft.alignmentRequirements?.find((item) =>
      item.requirementId === requirementId
    );
    if (!requirement || requirement.status !== "pending") {
      throw new Error(
        `Decision ${decision.decisionNodeId} does not match a pending alignment requirement`,
      );
    }
    requirement.status = "resolved";
    if (recordDecision) {
      requirement.resolvedByDecisionNodeId = decision.decisionNodeId;
    } else {
      delete requirement.resolvedByDecisionNodeId;
    }
  }
}

export function applyPlannerAction(
  draft: PlanRecord,
  action: PlanDecisionAction,
  now: number,
): void {
  if (action.kind === "select") {
    const decision = draft.decisions.find((item) =>
      item.decisionNodeId === action.decisionNodeId
    );
    const option = decision?.candidates.find((item) =>
      item.optionId === action.optionId
    );
    if (!decision || decision.status !== "open" || !option) {
      throw new Error("Selection must reference an open decision and known option");
    }
    if (option.constraintFit === "violates") {
      throw new Error(`Option violates hard constraints: ${action.optionId}`);
    }
    const interaction = draft.pendingInteraction;
    if (
      interaction?.kind === "decision"
      && interaction.payload.decisionNodeId === decision.decisionNodeId
    ) {
      const constraintId = `alignment:${interaction.interactionId}`;
      if (!draft.constraints.some((item) => item.constraintId === constraintId)) {
        draft.constraints.push({
          constraintId,
          kind: "preference",
          description: `${decision.question}: ${option.summary}`,
          source: "user",
        });
      }
    }
    resolvePendingRequirements(draft, decision);
    decision.status = "selected";
    decision.selectedOptionId = option.optionId;
    draft.status = "drafting";
    draft.trajectoryEvents.push({
      eventId: randomUUID(),
      revision: draft.revision + 1,
      recordedAt: now,
      kind: "decision_recorded",
      decisionNodeId: decision.decisionNodeId,
      optionId: option.optionId,
      summary: option.rationale,
    });
    return;
  }
  if (action.kind === "investigate") {
    const decision = draft.decisions.find((item) =>
      item.decisionNodeId === action.decisionNodeId
    );
    if (!decision) throw new Error(`Decision not found: ${action.decisionNodeId}`);
    if (
      action.optionId
      && !decision.candidates.some((candidate) =>
        candidate.optionId === action.optionId
      )
    ) {
      throw new Error(`Option not found: ${action.optionId}`);
    }
    draft.status = "drafting";
    draft.trajectoryEvents.push({
      eventId: randomUUID(),
      revision: draft.revision,
      recordedAt: now,
      kind: "fact_recorded",
      summary: action.question ?? `Investigate ${action.optionId ?? action.decisionNodeId}`,
      references: [],
    });
    return;
  }
  if (action.kind === "update_constraints") {
    const pendingDecisionId = draft.pendingInteraction?.kind === "decision"
      ? draft.pendingInteraction.payload.decisionNodeId
      : undefined;
    const pendingDecision = pendingDecisionId
      ? draft.decisions.find((decision) =>
        decision.decisionNodeId === pendingDecisionId
      )
      : undefined;
    for (const patch of action.constraints) {
      const constraintId = patch.kind === "set"
        ? patch.constraint.constraintId
        : patch.constraintId;
      const index = draft.constraints.findIndex((item) =>
        item.constraintId === constraintId
      );
      if (patch.kind === "remove") {
        if (index >= 0) draft.constraints.splice(index, 1);
      } else if (index >= 0) {
        draft.constraints[index] = structuredClone(patch.constraint);
      } else {
        draft.constraints.push(structuredClone(patch.constraint));
      }
    }
    if (pendingDecision) {
      resolvePendingRequirements(draft, pendingDecision, false);
    }
    draft.decisions = [];
    draft.status = "drafting";
    return;
  }
  const index = draft.decisions.findIndex((decision) =>
    decision.decisionNodeId === action.targetDecisionNodeId
  );
  if (index < 0) {
    throw new Error(`Decision not found: ${action.targetDecisionNodeId}`);
  }
  const invalidatedDecisionNodeIds = draft.decisions
    .slice(index + 1)
    .map((decision) => decision.decisionNodeId);
  const target = structuredClone(draft.decisions[index]);
  target.status = "open";
  target.selectedOptionId = undefined;
  draft.decisions = [...draft.decisions.slice(0, index), target];
  draft.status = "drafting";
  draft.trajectoryEvents.push({
    eventId: randomUUID(),
    revision: draft.revision + 1,
    recordedAt: now,
    kind: "backtracked",
    targetDecisionNodeId: action.targetDecisionNodeId,
    invalidatedDecisionNodeIds,
    summary: `Reopened ${action.targetDecisionNodeId}; invalidated ${
      invalidatedDecisionNodeIds.join(", ") || "no later decisions"
    }`,
  });
}
