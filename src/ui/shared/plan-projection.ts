import type {
  PlanAcceptanceCriterion,
  PlanRecord,
  PlanStatus,
  PlanVerification,
} from "../../application/plan/types.js";
import { planExecutionUnits } from "../../application/plan/execution-model.js";

const AUTHORIZED_STATUSES = new Set<PlanStatus>([
  "approved",
  "executing",
  "completed",
  "cancelled",
  "failed",
]);

const INTERNAL_TERMS: readonly [RegExp, string][] = [
  [/\beffectGrants?\b/gi, "授权范围"],
  [/\bsideEffectSummary\b/gi, "影响说明"],
  [/\bacceptance criteria\b/gi, "验收条件"],
  [/\bcompiled items?\b/gi, "执行步骤"],
  [/\bdecisionNodeId\b/gi, "决策"],
  [/\bcriterionId\b/gi, "验收项"],
  [/\brevision\b/gi, "版本"],
  [/\bdigest\b/gi, "校验信息"],
  [/\bevidence\b/gi, "验证依据"],
];

export interface PublicPlanStep {
  title: string;
  description: string;
}

export interface PublicPlanProjection {
  status: PlanStatus;
  goal: string;
  committedConstraints: readonly string[];
  selectedDecisionSummaries: readonly string[];
  scope: readonly string[];
  sideEffectSummary: string;
  steps: readonly PublicPlanStep[];
  verificationApproach: readonly string[];
}

function uniqueText(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

const OPAQUE_IDENTIFIER = /^(?:internal|plan|request|main|planner|agent|interaction|constraint|decision|option|item|criterion|evidence|tool(?:-?call)?)[-:_][a-z0-9_-]+$/i;
const UUID_IDENTIFIER = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const DIGEST_IDENTIFIER = /^[a-f0-9]{32,}$/i;

function isOpaqueIdentifier(value: string): boolean {
  return OPAQUE_IDENTIFIER.test(value)
    || UUID_IDENTIFIER.test(value)
    || DIGEST_IDENTIFIER.test(value);
}

function internalIdentifiers(plan: Readonly<PlanRecord>): string[] {
  const execution = planExecutionUnits(plan);
  return uniqueText([
    plan.planId,
    plan.request.requestId,
    plan.mainAgentId,
    plan.plannerAgentId ?? "",
    plan.digest,
    plan.approval?.interactionId ?? "",
    ...plan.constraints.map((constraint) => constraint.constraintId),
    ...plan.decisions.flatMap((decision) => [
      decision.decisionNodeId,
      decision.selectedOptionId ?? "",
      ...decision.candidates.flatMap((candidate) => [
        candidate.optionId,
        ...candidate.evidence.map((evidence) => evidence.referenceId),
      ]),
    ]),
    ...execution.flatMap((step) => [
      step.stepId,
      ...step.verifications.map((verification) => verification.verificationId),
      ...step.evidence.flatMap((evidence) => [
        evidence.evidenceId,
        "toolCallId" in evidence ? evidence.toolCallId : "",
        "agentId" in evidence ? evidence.agentId : "",
      ]),
    ]),
  ])
    .filter(isOpaqueIdentifier)
    .sort((left, right) => right.length - left.length);
}

function structuredVerificationSummary(
  verification: PlanVerification,
  identifiers: readonly string[],
): string {
  if (verification.kind === "observable") {
    return publicText(verification.description, identifiers);
  }
  const stdout = verification.expect.stdout;
  return publicText([
    verification.description,
    `运行 ${verification.command}，预期退出码 ${verification.expect.exitCode}`,
    stdout
      ? `输出${stdout.matcher === "contains" ? "包含" : stdout.matcher === "equals" ? "等于" : "匹配"} ${stdout.value}`
      : "",
  ].filter(Boolean).join("，"), identifiers);
}

function publicText(value: string, identifiers: readonly string[]): string {
  let result = value;
  for (const identifier of identifiers) {
    result = result.split(identifier).join("");
  }
  for (const [term, replacement] of INTERNAL_TERMS) {
    result = result.replace(term, replacement);
  }
  return result.replace(/\s+/g, " ").trim();
}

function verificationSummary(
  criterion: PlanAcceptanceCriterion,
  identifiers: readonly string[],
): string {
  switch (criterion.kind) {
    case "command":
      return publicText([
        `运行 ${criterion.command}，预期退出码 ${criterion.expectedExitCode}`,
        criterion.expectedOutput ? `输出包含 ${criterion.expectedOutput}` : "",
      ].filter(Boolean).join("，"), identifiers);
    case "observable":
      return publicText(criterion.description, identifiers);
    case "human":
      return publicText(criterion.prompt, identifiers);
  }
}

export function projectPublicPlan(
  plan: Readonly<PlanRecord>,
): PublicPlanProjection | null {
  const approval = plan.approval;
  const terminalAfterAuthorization = (
    plan.status === "cancelled" || plan.status === "failed"
  ) && plan.trajectoryEvents.some((event) =>
    event.kind === "status_changed"
    && event.revision === plan.revision
    && (event.from === "approved" || event.from === "executing")
  );
  if (
    !AUTHORIZED_STATUSES.has(plan.status)
    || (
      !terminalAfterAuthorization
      && (
        !approval
        || approval.revision !== plan.revision
        || approval.digest !== plan.digest
      )
    )
  ) return null;

  const identifiers = internalIdentifiers(plan);
  const selectedCandidates = plan.decisions.flatMap((decision) => {
    if (decision.status !== "selected" || !decision.selectedOptionId) return [];
    const selected = decision.candidates.find(
      (candidate) => candidate.optionId === decision.selectedOptionId,
    );
    return selected ? [selected] : [];
  });
  const orderedItems = planExecutionUnits(plan)
    .map((item, index) => ({ item, index }))
    .sort((left, right) =>
      left.item.order - right.item.order || left.index - right.index
    )
    .map(({ item }) => item);
  const steps = orderedItems
    .map((item) => ({
      title: publicText(item.title, identifiers),
      description: publicText(item.description, identifiers),
    }));

  return {
    status: plan.status,
    goal: publicText(plan.goal, identifiers),
    committedConstraints: uniqueText(plan.constraints
      .filter((constraint) => constraint.source === "user")
      .map((constraint) => publicText(constraint.description, identifiers))),
    selectedDecisionSummaries: uniqueText(
      selectedCandidates.map((candidate) =>
        publicText(candidate.summary, identifiers)
      ),
    ),
    scope: uniqueText(
      selectedCandidates.flatMap((candidate) =>
        candidate.affectedScopes.map((scope) => publicText(scope, identifiers))
      ),
    ),
    sideEffectSummary: publicText(plan.sideEffectSummary, identifiers),
    steps,
    verificationApproach: uniqueText(orderedItems
      .flatMap((item) => item.verifications.map((verification) =>
        plan.schemaVersion === 1
          ? verificationSummary(
            plan.items
              .find((legacy) => legacy.itemId === item.stepId)!
              .acceptanceCriteria.find((criterion) =>
                criterion.criterionId === verification.verificationId
              )!,
            identifiers,
          )
          : structuredVerificationSummary(verification, identifiers)
      ))),
  };
}
