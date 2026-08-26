import type {
  PlanCriterionResult,
  PlanItemVerificationCommand,
} from "./execution-types.js";
import type {
  PlanAcceptanceCriterion,
  PlanEvidence,
  PlanItem,
  PlanRecord,
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
  if (!result.passed || result.evidenceIds.length === 0) return false;
  const evidence = result.evidenceIds.map((evidenceId) =>
    item.evidence.find((candidate) => candidate.evidenceId === evidenceId)
  );
  if (!evidence.every((candidate) => isCurrentEvidence(candidate, command))) return false;
  if (criterion.kind === "command") {
    return evidence.some((candidate) =>
      candidate.kind === "tool_result"
      && candidate.acceptanceEligible
      && candidate.structuredOutcome === "success"
      && !candidate.isError
      && candidate.exitCode === criterion.expectedExitCode
      && candidate.toolName === "bash"
      && candidate.command === criterion.command
      && candidate.output.includes(criterion.expectedOutput)
    );
  }
  if (criterion.kind === "observable") {
    return result.observed?.matched === true
      && result.observed.description.trim().length > 0
      && evidence.some((candidate) =>
        candidate.kind === "tool_result"
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
  const evidenceIds = command.criteria.flatMap((result) => result.evidenceIds);
  if (new Set(evidenceIds).size !== evidenceIds.length) return false;
  return item.acceptanceCriteria.every((criterion) => {
    const result = results.get(criterion.criterionId);
    return result && criterionPassed(criterion, result, item, plan, command);
  });
}
