import type {
  PlanCriterionResult,
  PlanItemVerificationCommand,
} from "./execution-types.js";
import type {
  PlanAcceptanceCriterion,
  PlanEvidence,
  PlanExecutionStep,
  PlanExecutionStepState,
  PlanItem,
  PlanRecord,
  PlanStdoutMatcher,
  PlanVerification,
} from "./types.js";

function isCurrentEvidence(
  evidence: PlanEvidence | undefined,
  command: PlanItemVerificationCommand,
): evidence is PlanEvidence {
  return Boolean(
    evidence
    && evidence.planId === command.planId
    && evidence.revision === command.revision
    && evidence.itemId === command.itemId,
  );
}

function criterionPassed(
  criterion: PlanAcceptanceCriterion,
  result: PlanCriterionResult,
  item: Readonly<PlanItem>,
  plan: Readonly<PlanRecord>,
  command: PlanItemVerificationCommand,
): boolean {
  if (!result.passed) return false;
  const currentEvidence = item.evidence.filter((candidate) =>
    isCurrentEvidence(candidate, command)
  );
  const requestedEvidence = result.evidenceIds.map((evidenceId) =>
    currentEvidence.find((candidate) => candidate.evidenceId === evidenceId)
  );
  if (requestedEvidence.some((candidate) => candidate === undefined)) {
    return false;
  }
  const evidence = requestedEvidence.length > 0
    ? requestedEvidence.filter(
      (candidate): candidate is PlanEvidence => candidate !== undefined,
    )
    : currentEvidence;
  if (criterion.kind === "command") {
    return evidence.some((candidate) =>
      candidate.kind === "tool_result"
      && candidate.acceptanceEligible
      && candidate.exitCode === criterion.expectedExitCode
      && candidate.toolName === "bash"
      && candidate.command === criterion.command
      && candidate.output.includes(criterion.expectedOutput)
    );
  }
  if (criterion.kind === "observable") {
    const observationMatches = result.observed === undefined
      || (result.observed.matched
        && result.observed.description.trim().length > 0);
    return observationMatches
      && evidence.some((candidate) =>
        candidate.kind === "tool_result"
        && (!criterion.toolName || candidate.toolName === criterion.toolName)
        && candidate.acceptanceEligible
        && candidate.structuredOutcome === "success"
      );
  }
  return typeof result.humanReceiptCommandId === "string"
    && plan.commandReceipts.some((receipt) =>
      receipt.commandId === result.humanReceiptCommandId
      && receipt.operation === "human_acceptance"
      && receipt.result.kind === "interaction_consumed"
    )
    && evidence.some((candidate) =>
      candidate.kind === "human_receipt"
      && candidate.receiptCommandId === result.humanReceiptCommandId
      && candidate.criterionId === criterion.criterionId
    );
}

export function matchesPlanStdout(
  output: string,
  matcher: Readonly<PlanStdoutMatcher> | undefined,
): boolean {
  if (!matcher) return true;
  if (matcher.matcher === "contains") return output.includes(matcher.value);
  if (matcher.matcher === "equals") return output === matcher.value;
  try {
    return new RegExp(
      matcher.value,
      "flags" in matcher ? matcher.flags : undefined,
    ).test(output);
  } catch {
    return false;
  }
}

export function verificationPassed(
  verification: Readonly<PlanVerification>,
  evidence: readonly Readonly<PlanEvidence>[],
): boolean {
  if (verification.kind === "command") {
    return evidence.some((candidate) =>
      candidate.kind === "tool_result"
      && candidate.acceptanceEligible
      && candidate.exitCode === verification.expect.exitCode
      && candidate.toolName === "bash"
      && candidate.command === verification.command
      && matchesPlanStdout(candidate.output, verification.expect.stdout)
    );
  }
  return evidence.some((candidate) =>
    candidate.kind === "tool_result"
    && candidate.toolName === verification.toolName
    && candidate.acceptanceEligible
    && candidate.structuredOutcome === "success"
  );
}

export function allCriteriaPassed(
  item: Readonly<PlanItem>,
  plan: Readonly<PlanRecord>,
  command: PlanItemVerificationCommand,
): boolean {
  const results = new Map(command.criteria.map((result) => [
    result.criterionId,
    result,
  ]));
  if (
    results.size !== command.criteria.length
    || results.size !== item.acceptanceCriteria.length
  ) return false;
  const exactEvidenceIds = command.criteria.flatMap((result) =>
    result.evidenceIds
  );
  if (
    exactEvidenceIds.length > 0
    && new Set(exactEvidenceIds).size !== exactEvidenceIds.length
  ) return false;
  return item.acceptanceCriteria.every((criterion) => {
    const result = results.get(criterion.criterionId);
    return result && criterionPassed(criterion, result, item, plan, command);
  });
}

export function allPersistedCriteriaPassed(
  item: Readonly<PlanItem>,
  plan: Readonly<PlanRecord>,
): boolean {
  return item.acceptanceCriteria.every((criterion) => criterion.kind !== "human")
    && allCriteriaPassed(item, plan, {
      planId: plan.planId,
      expectedVersion: plan.version,
      commandId: "host-acceptance-reconciliation",
      revision: plan.revision,
      digest: plan.digest,
      itemId: item.itemId,
      callerAgentId: plan.mainAgentId,
      criteria: item.acceptanceCriteria.map((criterion) => ({
        criterionId: criterion.criterionId,
        passed: true,
        evidenceIds: [],
      })),
    });
}

export function allPersistedVerificationsPassed(
  step: Readonly<PlanExecutionStep>,
  state: Readonly<PlanExecutionStepState>,
  plan: Readonly<PlanRecord>,
): boolean {
  const evidence = state.evidence.filter((candidate) =>
    candidate.planId === plan.planId
    && candidate.revision === plan.revision
    && candidate.itemId === step.stepId
  );
  return step.verifications.every((verification) =>
    verificationPassed(verification, evidence)
  );
}
