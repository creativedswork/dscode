import type {
  PlanExecutionStep,
  PlanExecutionStepState,
  PlanItem,
  PlanRecord,
  PlanRecordV2,
} from "./types.js";

export interface PlanExecutionUnit extends PlanExecutionStep, PlanExecutionStepState {}

function legacyStep(item: Readonly<PlanItem>): PlanExecutionStep {
  return {
    stepId: item.itemId,
    order: item.order,
    title: item.title,
    description: item.description,
    dependsOn: item.dependsOn,
    verifications: item.acceptanceCriteria.map((criterion) => {
      if (criterion.kind === "command") {
        return {
          kind: "command" as const,
          verificationId: criterion.criterionId,
          description: criterion.expectedOutput,
          command: criterion.command,
          expect: {
            exitCode: criterion.expectedExitCode,
            ...(criterion.expectedOutput
              ? {
                stdout: {
                  matcher: "contains" as const,
                  value: criterion.expectedOutput,
                },
              }
              : {}),
          },
        };
      }
      if (criterion.kind === "observable") {
        return {
          kind: "observable" as const,
          verificationId: criterion.criterionId,
          description: criterion.description,
          toolName: criterion.toolName ?? "",
        };
      }
      return {
        kind: "observable" as const,
        verificationId: criterion.criterionId,
        description: criterion.prompt,
        toolName: "",
      };
    }),
    effectGrants: item.effectGrants,
  };
}

export function planExecutionUnits(
  plan: Readonly<PlanRecord>,
): PlanExecutionUnit[] {
  if (plan.schemaVersion === 1) {
    return plan.items.map((item) => ({
      ...legacyStep(item),
      stepId: item.itemId,
      status: item.status,
      evidence: item.evidence,
      executionBinding: item.executionBinding,
      executionBindings: item.executionBindings,
      skipReason: item.skipReason,
    }));
  }
  const states = new Map(plan.execution.steps.map((state) => [
    state.stepId,
    state,
  ]));
  return plan.executionSteps.map((step) => {
    const state = states.get(step.stepId);
    if (!state) throw new Error(`Execution state is missing for step ${step.stepId}`);
    return { ...step, ...state };
  });
}

export function requireMutablePlanV2(plan: PlanRecord): PlanRecordV2 {
  if (plan.schemaVersion !== 2) {
    throw new Error("Schema v1 Plan records are read-only");
  }
  return plan;
}

export function requireExecutionStep(
  plan: Readonly<PlanRecord>,
  stepId: string,
): Readonly<PlanExecutionStep> {
  const step = plan.schemaVersion === 1
    ? plan.items.find((candidate) => candidate.itemId === stepId)
    : plan.executionSteps.find((candidate) => candidate.stepId === stepId);
  if (!step) throw new Error(`Plan execution step not found: ${stepId}`);
  return plan.schemaVersion === 1 ? legacyStep(step as PlanItem) : step as PlanExecutionStep;
}

export function requireExecutionStepState(
  plan: PlanRecord,
  stepId: string,
): PlanExecutionStepState {
  const mutable = requireMutablePlanV2(plan);
  const state = mutable.execution.steps.find((candidate) =>
    candidate.stepId === stepId
  );
  if (!state) throw new Error(`Plan execution state not found: ${stepId}`);
  return state;
}
