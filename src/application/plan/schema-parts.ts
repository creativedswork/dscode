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

export const AlignmentRequirement = Type.Object({
  requirementId: Identifier,
  topic: Type.Union([
    Type.Literal("visual_direction"),
    Type.Literal("delivery"),
    Type.Literal("product_scope"),
    Type.Literal("compatibility"),
    Type.Literal("cost"),
    Type.Literal("reversibility"),
    Type.Literal("other"),
  ]),
  publicSummary: Type.String({ minLength: 1 }),
  status: Type.Union([
    Type.Literal("pending"),
    Type.Literal("resolved"),
  ]),
  resolvedByDecisionNodeId: Type.Optional(Identifier),
}, STRICT_OBJECT_OPTIONS);

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
  resolvesRequirementIds: Type.Optional(Type.Array(Identifier, { maxItems: 1 })),
}, STRICT_OBJECT_OPTIONS);

export const ResourceScope = Type.Union([
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

export const AcceptanceCriterion = Type.Union([
  Type.Object({
    kind: Type.Literal("command"),
    criterionId: Identifier,
    command: Text,
    expectedExitCode: Type.Integer(),
    expectedOutput: Text,
  }, STRICT_OBJECT_OPTIONS),
  Type.Object({
    kind: Type.Literal("observable"),
    criterionId: Identifier,
    description: Text,
    toolName: Type.Optional(Identifier),
  }, STRICT_OBJECT_OPTIONS),
  Type.Object({
    kind: Type.Literal("human"),
    criterionId: Identifier,
    prompt: Text,
  }, STRICT_OBJECT_OPTIONS),
]);

const StdoutMatcher = Type.Union([
  Type.Object({
    matcher: Type.Union([
      Type.Literal("contains"),
      Type.Literal("equals"),
    ]),
    value: Text,
  }, STRICT_OBJECT_OPTIONS),
  Type.Object({
    matcher: Type.Literal("regex"),
    value: Text,
    flags: Type.Optional(Text),
  }, STRICT_OBJECT_OPTIONS),
]);

export const PlanVerification = Type.Union([
  Type.Object({
    kind: Type.Literal("command"),
    verificationId: Identifier,
    description: Text,
    command: Text,
    expect: Type.Object({
      exitCode: Type.Integer(),
      stdout: Type.Optional(StdoutMatcher),
    }, STRICT_OBJECT_OPTIONS),
  }, STRICT_OBJECT_OPTIONS),
  Type.Object({
    kind: Type.Literal("observable"),
    verificationId: Identifier,
    description: Text,
    toolName: Identifier,
  }, STRICT_OBJECT_OPTIONS),
]);

const Evidence = Type.Union([
  Type.Object({
    planId: Identifier,
    revision: PositiveInteger,
    itemId: Identifier,
    kind: Type.Literal("agent_progress"),
    evidenceId: Identifier,
    agentId: Identifier,
    phase: Text,
    summary: Text,
    recordedAt: Timestamp,
  }, STRICT_OBJECT_OPTIONS),
  Type.Object({
    planId: Identifier,
    revision: PositiveInteger,
    itemId: Identifier,
    kind: Type.Literal("tool_result"),
    evidenceId: Identifier,
    toolCallId: Identifier,
    toolName: Identifier,
    isError: Type.Boolean(),
    exitCode: Type.Optional(Type.Integer()),
    command: Type.Optional(Text),
    output: Type.String(),
    structuredOutcome: Type.Union([
      Type.Literal("success"),
      Type.Literal("business_error"),
      Type.Literal("unknown"),
    ]),
    acceptanceEligible: Type.Boolean(),
    summary: Text,
    recordedAt: Timestamp,
  }, STRICT_OBJECT_OPTIONS),
  Type.Object({
    planId: Identifier,
    revision: PositiveInteger,
    itemId: Identifier,
    kind: Type.Literal("agent_exit"),
    evidenceId: Identifier,
    agentId: Identifier,
    outcome: Type.Union([
      Type.Literal("completed"),
      Type.Literal("failed"),
      Type.Literal("terminated"),
      Type.Literal("killed"),
    ]),
    acceptanceEligible: Type.Boolean(),
    summary: Text,
    recordedAt: Timestamp,
  }, STRICT_OBJECT_OPTIONS),
  Type.Object({
    planId: Identifier,
    revision: PositiveInteger,
    itemId: Identifier,
    kind: Type.Literal("human_receipt"),
    evidenceId: Identifier,
    receiptCommandId: Identifier,
    criterionId: Identifier,
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

export const EffectGrant = Type.Object({
  effect: EffectCategory,
  resourceScopes: Type.Array(ResourceScope),
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
  effectGrants: Type.Array(EffectGrant),
  evidence: Type.Array(Evidence),
  executionBinding: Type.Optional(ExecutionBinding),
  executionBindings: Type.Optional(Type.Array(ExecutionBinding)),
  skipReason: Type.Optional(Text),
}, STRICT_OBJECT_OPTIONS);

export const PlanExecutionStep = Type.Object({
  stepId: Identifier,
  order: Type.Integer({ minimum: 0 }),
  title: Text,
  description: Text,
  dependsOn: Type.Array(Identifier),
  verifications: Type.Array(PlanVerification),
  effectGrants: Type.Array(EffectGrant),
}, STRICT_OBJECT_OPTIONS);

export const PlanExecutionStepState = Type.Object({
  stepId: Identifier,
  status: Type.Union([
    Type.Literal("pending"),
    Type.Literal("in_progress"),
    Type.Literal("blocked"),
    Type.Literal("completed"),
    Type.Literal("skipped"),
  ]),
  evidence: Type.Array(Evidence),
  executionBinding: Type.Optional(ExecutionBinding),
  executionBindings: Type.Optional(Type.Array(ExecutionBinding)),
  skipReason: Type.Optional(Text),
}, STRICT_OBJECT_OPTIONS);

const ExecutionProgress = Type.Object({
  passedVerificationIds: Type.Array(Identifier),
  planSteps: Type.Array(Type.Object({
    stepId: Identifier,
    status: Type.Union([
      Type.Literal("pending"),
      Type.Literal("in_progress"),
      Type.Literal("blocked"),
      Type.Literal("completed"),
      Type.Literal("skipped"),
    ]),
  }, STRICT_OBJECT_OPTIONS)),
  task: Type.Optional(Type.Object({
    status: Type.Union([
      Type.Literal("active"),
      Type.Literal("completed"),
      Type.Literal("blocked"),
      Type.Literal("cancelled"),
      Type.Literal("failed"),
    ]),
    todos: Type.Array(Type.Object({
      todoId: Identifier,
      status: Type.Union([
        Type.Literal("pending"),
        Type.Literal("in_progress"),
        Type.Literal("completed"),
        Type.Literal("blocked"),
        Type.Literal("skipped"),
      ]),
      result: Type.Optional(Text),
      blocker: Type.Optional(Type.Object({
        kind: Identifier,
        reason: Text,
        recovery: Text,
      }, STRICT_OBJECT_OPTIONS)),
    }, STRICT_OBJECT_OPTIONS)),
  }, STRICT_OBJECT_OPTIONS)),
}, STRICT_OBJECT_OPTIONS);

const EpisodePolicy = Type.Object({
  maxTurns: PositiveInteger,
  maxToolCalls: PositiveInteger,
  maxNoProgressActions: PositiveInteger,
  maxEquivalentActions: PositiveInteger,
  reflectionMaxTurns: PositiveInteger,
  reflectionMaxToolCalls: PositiveInteger,
}, STRICT_OBJECT_OPTIONS);

const Incident = Type.Object({
  rule: Type.Union([
    Type.Literal("max_turns"),
    Type.Literal("max_tool_calls"),
    Type.Literal("max_no_progress_actions"),
    Type.Literal("max_equivalent_actions"),
  ]),
  occurredAt: Timestamp,
  reflectionAvailable: Type.Boolean(),
  unchangedProgress: ExecutionProgress,
  equivalentActionCount: Type.Optional(Type.Integer({ minimum: 1 })),
  fingerprint: Type.Optional(Identifier),
  errors: Type.Array(Text, { maxItems: 3 }),
}, STRICT_OBJECT_OPTIONS);

const RecoveryReceipt = Type.Object({
  commandId: Identifier,
  operation: Type.Union([
    Type.Literal("adjust_plan"),
    Type.Literal("continue_execution"),
  ]),
  payloadDigest: Digest,
  resultingVersion: PositiveInteger,
  episodeId: Type.Optional(Identifier),
  completedAt: Timestamp,
}, STRICT_OBJECT_OPTIONS);

export const ExecutionEpisode = Type.Object({
  episodeId: Identifier,
  planId: Identifier,
  planRevision: PositiveInteger,
  planDigest: Digest,
  sessionId: Identifier,
  mainAgentId: Identifier,
  phase: Type.Union([
    Type.Literal("running"),
    Type.Literal("reflecting"),
    Type.Literal("paused_inconclusive"),
    Type.Literal("completed"),
  ]),
  policy: EpisodePolicy,
  turnCount: Type.Integer({ minimum: 0 }),
  toolCallCount: Type.Integer({ minimum: 0 }),
  noProgressActionCount: Type.Integer({ minimum: 0 }),
  reflectionUsed: Type.Boolean(),
  startedAt: Timestamp,
  updatedAt: Timestamp,
  progress: ExecutionProgress,
  incident: Type.Optional(Incident),
  recentFingerprints: Type.Array(Digest, { maxItems: 16 }),
  recoveryReceipts: Type.Array(RecoveryReceipt, { maxItems: 64 }),
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
  Type.Object({
    ...InteractionBase,
    kind: Type.Literal("acceptance"),
    payload: Type.Object({
      itemId: Identifier,
      criterionId: Identifier,
      prompt: Text,
    }, STRICT_OBJECT_OPTIONS),
  }, STRICT_OBJECT_OPTIONS),
]);
