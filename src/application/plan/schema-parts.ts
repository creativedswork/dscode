import { Type } from "@earendil-works/pi-ai";

import { MAX_PLAN_CANDIDATES } from "./planner-types.js";

export const Identifier = Type.String({ minLength: 1, maxLength: 200 });
export const Text = Type.String();
export const Timestamp = Type.Number({ minimum: 0 });
export const Digest = Type.String({ pattern: "^[a-f0-9]{64}$" });
export const PositiveInteger = Type.Integer({ minimum: 1 });

const STRICT_OBJECT_OPTIONS = { additionalProperties: false } as const;

export const PlanStatus = Type.Union([
  Type.Literal("drafting"),
  Type.Literal("awaiting_decision"),
  Type.Literal("awaiting_approval"),
  Type.Literal("approved"),
  Type.Literal("executing"),
  Type.Literal("needs_replan"),
  Type.Literal("completed"),
  Type.Literal("cancelled"),
  Type.Literal("failed"),
]);

export const EffectCategory = Type.Union([
  Type.Literal("read"),
  Type.Literal("workspace_write"),
  Type.Literal("process"),
  Type.Literal("network"),
  Type.Literal("external_write"),
  Type.Literal("unknown"),
]);

export const EvidenceReference = Type.Union([
  Type.Object({
    kind: Type.Literal("file"),
    referenceId: Identifier,
    path: Text,
    description: Text,
  }, STRICT_OBJECT_OPTIONS),
  Type.Object({
    kind: Type.Literal("command"),
    referenceId: Identifier,
    command: Text,
    description: Text,
  }, STRICT_OBJECT_OPTIONS),
  Type.Object({
    kind: Type.Literal("external"),
    referenceId: Identifier,
    uri: Text,
    description: Text,
  }, STRICT_OBJECT_OPTIONS),
]);

export const Candidate = Type.Object({
  optionId: Identifier,
  summary: Text,
  affectedScopes: Type.Array(Text),
  evidence: Type.Array(EvidenceReference),
  risks: Type.Array(Text),
  cost: Type.Union([
    Type.Literal("low"),
    Type.Literal("medium"),
    Type.Literal("high"),
  ]),
  reversibility: Type.Union([
    Type.Literal("reversible"),
    Type.Literal("partial"),
    Type.Literal("irreversible"),
  ]),
  constraintFit: Type.Union([
    Type.Literal("satisfies"),
    Type.Literal("uncertain"),
    Type.Literal("violates"),
  ]),
  recommended: Type.Boolean(),
  rationale: Text,
}, STRICT_OBJECT_OPTIONS);

export const DecisionNode = Type.Object({
  decisionNodeId: Identifier,
  question: Text,
  status: Type.Union([
    Type.Literal("open"),
    Type.Literal("selected"),
    Type.Literal("invalidated"),
  ]),
  candidates: Type.Array(Candidate, {
    minItems: 1,
    maxItems: MAX_PLAN_CANDIDATES,
  }),
  selectedOptionId: Type.Optional(Identifier),
}, STRICT_OBJECT_OPTIONS);

const ResourceScope = Type.Union([
  Type.Object(
    { kind: Type.Literal("workspace_path"), pattern: Text },
    STRICT_OBJECT_OPTIONS,
  ),
  Type.Object(
    { kind: Type.Literal("process_command"), commandClass: Text },
    STRICT_OBJECT_OPTIONS,
  ),
  Type.Object(
    { kind: Type.Literal("network_origin"), origin: Text },
    STRICT_OBJECT_OPTIONS,
  ),
  Type.Object({
    kind: Type.Literal("external_resource"),
    resourceType: Text,
    resourceId: Text,
  }, STRICT_OBJECT_OPTIONS),
]);

const AcceptanceCriterion = Type.Union([
  Type.Object({
    kind: Type.Literal("command"),
    criterionId: Identifier,
    command: Text,
    expectedExitCode: Type.Integer(),
  }, STRICT_OBJECT_OPTIONS),
  Type.Object({
    kind: Type.Literal("observable"),
    criterionId: Identifier,
    description: Text,
  }, STRICT_OBJECT_OPTIONS),
  Type.Object({
    kind: Type.Literal("human"),
    criterionId: Identifier,
    prompt: Text,
  }, STRICT_OBJECT_OPTIONS),
]);

const Evidence = Type.Union([
  Type.Object({
    kind: Type.Literal("agent_progress"),
    evidenceId: Identifier,
    agentId: Identifier,
    phase: Text,
    summary: Text,
    recordedAt: Timestamp,
  }, STRICT_OBJECT_OPTIONS),
  Type.Object({
    kind: Type.Literal("tool_result"),
    evidenceId: Identifier,
    toolCallId: Identifier,
    summary: Text,
    recordedAt: Timestamp,
  }, STRICT_OBJECT_OPTIONS),
  Type.Object({
    kind: Type.Literal("agent_exit"),
    evidenceId: Identifier,
    agentId: Identifier,
    outcome: Type.Union([
      Type.Literal("completed"),
      Type.Literal("failed"),
      Type.Literal("terminated"),
      Type.Literal("killed"),
    ]),
    summary: Text,
    recordedAt: Timestamp,
  }, STRICT_OBJECT_OPTIONS),
  Type.Object({
    kind: Type.Literal("human_receipt"),
    evidenceId: Identifier,
    receiptCommandId: Identifier,
    summary: Text,
    recordedAt: Timestamp,
  }, STRICT_OBJECT_OPTIONS),
]);

const ExecutionBinding = Type.Object({
  agentId: Identifier,
  role: Type.Union([Type.Literal("main"), Type.Literal("subagent")]),
  planId: Identifier,
  revision: PositiveInteger,
  digest: Digest,
  itemId: Identifier,
  boundAt: Timestamp,
}, STRICT_OBJECT_OPTIONS);

export const PlanItem = Type.Object({
  itemId: Identifier,
  order: Type.Integer({ minimum: 0 }),
  title: Text,
  description: Text,
  dependsOn: Type.Array(Identifier),
  status: Type.Union([
    Type.Literal("pending"),
    Type.Literal("in_progress"),
    Type.Literal("blocked"),
    Type.Literal("completed"),
    Type.Literal("skipped"),
  ]),
  acceptanceCriteria: Type.Array(AcceptanceCriterion),
  effectGrants: Type.Array(Type.Object({
    effect: EffectCategory,
    resourceScopes: Type.Array(ResourceScope),
  }, STRICT_OBJECT_OPTIONS)),
  evidence: Type.Array(Evidence),
  executionBinding: Type.Optional(ExecutionBinding),
}, STRICT_OBJECT_OPTIONS);

const InteractionBase = {
  interactionId: Identifier,
  revision: PositiveInteger,
  planDigest: Digest,
  payloadDigest: Digest,
  createdAt: Timestamp,
  state: Type.Union([Type.Literal("pending"), Type.Literal("resolving")]),
};

export const Interaction = Type.Union([
  Type.Object({
    ...InteractionBase,
    kind: Type.Literal("decision"),
    payload: Type.Object({
      decisionNodeId: Identifier,
      candidateIds: Type.Array(Identifier),
      prompt: Text,
    }, STRICT_OBJECT_OPTIONS),
  }, STRICT_OBJECT_OPTIONS),
  Type.Object({
    ...InteractionBase,
    kind: Type.Literal("approval"),
    payload: Type.Object({
      itemIds: Type.Array(Identifier),
      effectCategories: Type.Array(EffectCategory),
      sideEffectSummary: Text,
    }, STRICT_OBJECT_OPTIONS),
  }, STRICT_OBJECT_OPTIONS),
]);
