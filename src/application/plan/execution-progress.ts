import type { TaskState } from "../../agents/process/task-state.js";
import { verificationPassed } from "./execution-acceptance.js";
import { planExecutionUnits } from "./execution-model.js";
import type {
  ExecutionProgressSnapshot,
} from "./execution-episode-types.js";
import type { PlanRecord } from "./types.js";

export function captureExecutionProgress(
  plan: Readonly<PlanRecord>,
  taskState?: Readonly<TaskState>,
): ExecutionProgressSnapshot {
  const units = planExecutionUnits(plan);
  const passedVerificationIds = units.flatMap((unit) => {
    const evidence = unit.evidence.filter((candidate) =>
      candidate.planId === plan.planId
      && candidate.revision === plan.revision
      && candidate.itemId === unit.stepId
    );
    return unit.verifications.flatMap((verification) =>
      verificationPassed(verification, evidence)
        ? [verification.verificationId]
        : []
    );
  }).sort();
  return {
    passedVerificationIds,
    planSteps: units
      .map(({ stepId, status }) => ({ stepId, status }))
      .sort((left, right) => left.stepId.localeCompare(right.stepId)),
    ...(taskState
      ? {
        task: {
          status: taskState.status,
          todos: taskState.todoList
            .map(({ todoId, status, result, blocker }) => ({
              todoId,
              status,
              ...(result === undefined ? {} : { result }),
              ...(blocker === undefined
                ? {}
                : {
                  blocker: {
                    kind: blocker.kind,
                    reason: blocker.reason,
                    recovery: blocker.recovery,
                  },
                }),
            }))
            .sort((left, right) => left.todoId.localeCompare(right.todoId)),
        },
      }
      : {}),
  };
}

export function hasExecutionProgress(
  previous: Readonly<ExecutionProgressSnapshot>,
  next: Readonly<ExecutionProgressSnapshot>,
): boolean {
  const previousPassed = new Set(previous.passedVerificationIds);
  if (next.passedVerificationIds.some((id) => !previousPassed.has(id))) return true;
  const previousSteps = new Map(previous.planSteps.map((step) => [
    step.stepId,
    step.status,
  ]));
  if (next.planSteps.some((step) =>
    previousSteps.has(step.stepId)
    && previousSteps.get(step.stepId) !== step.status
  )) return true;
  if (!previous.task || !next.task) return previous.task !== next.task;
  if (previous.task.status !== next.task.status) return true;
  const previousTodos = new Map(previous.task.todos.map((todo) => [
    todo.todoId,
    todo,
  ]));
  return next.task.todos.some((todo) => {
    const prior = previousTodos.get(todo.todoId);
    return !prior
      || prior.status !== todo.status
      || prior.result !== todo.result
      || JSON.stringify(prior.blocker) !== JSON.stringify(todo.blocker);
  });
}
