import { Type } from "@earendil-works/pi-ai";
import { Value } from "typebox/value";

import { digestCanonicalPayload } from "./digest.js";
import {
  DecisionNode,
  Digest,
  EffectCategory,
  EvidenceReference,
  Identifier,
  Interaction,
  PlanItem,
  PlanStatus,
  PositiveInteger,
  Text,
  Timestamp,
} from "./schema-parts.js";
import { assertNever } from "./types.js";
import type { PlanRecord, PlanTrajectoryEvent } from "./types.js";
import { MAX_PLAN_DECISION_NODES } from "./planner-types.js";

const STRICT_OBJECT_OPTIONS = { additionalProperties: false } as const;

const ReceiptResult = Type.Union([
  Type.Object({
    kind: Type.Literal("interaction_consumed"),
    interactionId: Identifier,
  }, STRICT_OBJECT_OPTIONS),
  Type.Object({
    kind: Type.Literal("mutation_applied"),
    operation: Identifier,
  }, STRICT_OBJECT_OPTIONS),
]);

const Receipt = Type.Object({
  commandId: Identifier,
  interactionId: Type.Optional(Identifier),
  payloadDigest: Digest,
  result: ReceiptResult,
  resultingVersion: PositiveInteger,
  completedAt: Timestamp,
}, STRICT_OBJECT_OPTIONS);

const TrajectoryEvent = Type.Union([
  Type.Object({
    eventId: Identifier,
    revision: PositiveInteger,
    recordedAt: Timestamp,
    kind: Type.Literal("status_changed"),
    from: PlanStatus,
    to: PlanStatus,
  }, STRICT_OBJECT_OPTIONS),
  Type.Object({
    eventId: Identifier,
    revision: PositiveInteger,
    recordedAt: Timestamp,
    kind: Type.Literal("decision_recorded"),
    decisionNodeId: Identifier,
    optionId: Identifier,
    summary: Text,
  }, STRICT_OBJECT_OPTIONS),
  Type.Object({
    eventId: Identifier,
    revision: PositiveInteger,
    recordedAt: Timestamp,
    kind: Type.Literal("candidate_summarized"),
    decisionNodeId: Identifier,
    optionId: Identifier,
    summary: Text,
  }, STRICT_OBJECT_OPTIONS),
  Type.Object({
    eventId: Identifier,
    revision: PositiveInteger,
    recordedAt: Timestamp,
    kind: Type.Literal("fact_recorded"),
    summary: Text,
    references: Type.Array(EvidenceReference),
  }, STRICT_OBJECT_OPTIONS),
  Type.Object({
    eventId: Identifier,
    revision: PositiveInteger,
    recordedAt: Timestamp,
    kind: Type.Literal("evidence_recorded"),
    reference: EvidenceReference,
  }, STRICT_OBJECT_OPTIONS),
  Type.Object({
    eventId: Identifier,
    revision: PositiveInteger,
    recordedAt: Timestamp,
    kind: Type.Literal("backtracked"),
    targetDecisionNodeId: Identifier,
    invalidatedDecisionNodeIds: Type.Array(Identifier),
    summary: Text,
  }, STRICT_OBJECT_OPTIONS),
]);

export const PlanRecordSchema = Type.Object({
  schemaVersion: Type.Literal(1),
  planId: Identifier,
  projectKey: Identifier,
  sessionId: Identifier,
  mainAgentId: Identifier,
  plannerAgentId: Type.Optional(Identifier),
  request: Type.Object({
    requestId: Identifier,
    text: Text,
    submittedAt: Timestamp,
  }, STRICT_OBJECT_OPTIONS),
  status: PlanStatus,
  version: PositiveInteger,
  revision: PositiveInteger,
  baseRevision: Type.Optional(PositiveInteger),
  digest: Digest,
  goal: Text,
  constraints: Type.Array(Type.Object({
    constraintId: Identifier,
    kind: Type.Union([Type.Literal("hard"), Type.Literal("preference")]),
    description: Text,
    source: Type.Union([
      Type.Literal("user"),
      Type.Literal("system"),
      Type.Literal("evidence"),
    ]),
  }, STRICT_OBJECT_OPTIONS)),
  decisions: Type.Array(DecisionNode, { maxItems: MAX_PLAN_DECISION_NODES }),
  items: Type.Array(PlanItem),
  sideEffectSummary: Text,
  approval: Type.Optional(Type.Object({
    revision: PositiveInteger,
    digest: Digest,
    approvedEffects: Type.Array(EffectCategory),
    acknowledgedSideEffects: Type.Array(Text),
    interactionId: Identifier,
    approvedAt: Timestamp,
  }, STRICT_OBJECT_OPTIONS)),
  pendingInteraction: Type.Optional(Interaction),
  commandReceipts: Type.Array(Receipt),
  trajectoryEvents: Type.Array(TrajectoryEvent),
  telemetry: Type.Optional(Type.Object({
    lastProgressAt: Type.Optional(Timestamp),
    counters: Type.Record(Type.String(), Type.Number()),
  }, STRICT_OBJECT_OPTIONS)),
  createdAt: Timestamp,
  updatedAt: Timestamp,
}, STRICT_OBJECT_OPTIONS);

export class PlanValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlanValidationError";
  }
}

function requireUnique(values: string[], label: string): void {
  if (new Set(values).size !== values.length) {
    throw new PlanValidationError(`Plan record contains duplicate ${label}`);
  }
}

function assertTrajectoryEventHandled(event: PlanTrajectoryEvent): void {
  switch (event.kind) {
    case "status_changed":
    case "decision_recorded":
    case "candidate_summarized":
    case "fact_recorded":
    case "evidence_recorded":
    case "backtracked":
      return;
    default:
      assertNever(event);
  }
}

export function validatePlanRecord(value: unknown): PlanRecord {
  if (!Value.Check(PlanRecordSchema, value)) {
    throw new PlanValidationError("Plan record does not match schema version 1");
  }
  const plan = value as PlanRecord;
  requireUnique(plan.constraints.map((item) => item.constraintId), "constraint IDs");
  requireUnique(plan.decisions.map((item) => item.decisionNodeId), "decision node IDs");
  requireUnique(plan.items.map((item) => item.itemId), "item IDs");
  requireUnique(plan.commandReceipts.map((item) => item.commandId), "command IDs");
  requireUnique(plan.trajectoryEvents.map((item) => item.eventId), "trajectory event IDs");
  const consumedInteractionIds: string[] = [];
  for (const receipt of plan.commandReceipts) {
    switch (receipt.result.kind) {
      case "interaction_consumed":
        if (receipt.interactionId !== receipt.result.interactionId) {
          throw new PlanValidationError(
            `Command receipt ${receipt.commandId} has inconsistent interaction IDs`,
          );
        }
        consumedInteractionIds.push(receipt.result.interactionId);
        break;
      case "mutation_applied":
        if (receipt.interactionId !== undefined) {
          throw new PlanValidationError(
            `Command receipt ${receipt.commandId} unexpectedly references an interaction`,
          );
        }
        break;
      default:
        assertNever(receipt.result);
    }
  }
  requireUnique(consumedInteractionIds, "consumed interaction IDs");
  for (const event of plan.trajectoryEvents) assertTrajectoryEventHandled(event);
  for (const decision of plan.decisions) {
    requireUnique(
      decision.candidates.map((candidate) => candidate.optionId),
      `candidate IDs in ${decision.decisionNodeId}`,
    );
    const hasSelection = decision.selectedOptionId !== undefined;
    if (decision.status === "selected" !== hasSelection) {
      throw new PlanValidationError(
        `Decision ${decision.decisionNodeId} has inconsistent selection state`,
      );
    }
    if (
      decision.selectedOptionId
      && !decision.candidates.some((candidate) =>
        candidate.optionId === decision.selectedOptionId
      )
    ) {
      throw new PlanValidationError(
        `Decision ${decision.decisionNodeId} selects an unknown option`,
      );
    }
  }
  if (
    plan.approval
    && (plan.approval.revision !== plan.revision || plan.approval.digest !== plan.digest)
  ) {
    throw new PlanValidationError("Plan approval does not match the current revision and digest");
  }
  if (plan.pendingInteraction) {
    if (
      plan.pendingInteraction.revision !== plan.revision
      || plan.pendingInteraction.planDigest !== plan.digest
    ) {
      throw new PlanValidationError(
        "Pending interaction does not match the current revision and digest",
      );
    }
    if (
      plan.pendingInteraction.payloadDigest
      !== digestCanonicalPayload(plan.pendingInteraction.payload)
    ) {
      throw new PlanValidationError("Pending interaction payload digest does not match");
    }
    if (consumedInteractionIds.includes(plan.pendingInteraction.interactionId)) {
      throw new PlanValidationError("Pending interaction was already consumed");
    }
  }
  if (plan.commandReceipts.some((receipt) => receipt.resultingVersion > plan.version)) {
    throw new PlanValidationError("Command receipt refers to a future Plan version");
  }
  return plan;
}
