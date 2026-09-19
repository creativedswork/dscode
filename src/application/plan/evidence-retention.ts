import { verificationPassed } from "./execution-acceptance.js";
import type {
  PlanEvidence,
  PlanExecutionStep,
  PlanExecutionStepState,
} from "./types.js";

export function retainVerificationEvidence(
  step: Readonly<PlanExecutionStep>,
  state: Readonly<PlanExecutionStepState>,
  candidate?: Readonly<PlanEvidence>,
): PlanEvidence[] {
  const eligible = [...state.evidence, ...(candidate ? [candidate] : [])]
    .filter((evidence): evidence is Extract<PlanEvidence, { kind: "tool_result" }> =>
      evidence.kind === "tool_result" && evidence.acceptanceEligible
    )
    .sort((left, right) =>
      right.recordedAt - left.recordedAt
      || right.evidenceId.localeCompare(left.evidenceId)
    );
  const retained = new Map<string, PlanEvidence>();
  for (const verification of step.verifications) {
    const evidence = eligible.find((item) =>
      verificationPassed(verification, [item])
    );
    if (evidence) retained.set(evidence.evidenceId, evidence);
  }
  for (const evidence of eligible
    .filter((item) =>
      !item.isError
      && item.structuredOutcome === "success"
      && !step.verifications.some((verification) =>
        verificationPassed(verification, [item])
      )
    )
    .slice(0, 4)) {
    retained.set(evidence.evidenceId, evidence);
  }
  return [...retained.values()].sort((left, right) =>
    left.recordedAt - right.recordedAt
    || left.evidenceId.localeCompare(right.evidenceId)
  );
}
