export type PlanCoordinationOperation =
  | "attach_main"
  | "complete_approved"
  | "publish_event"
  | "resolve_approval"
  | "resolve_decision"
  | "start_replan"
  | "terminal_cleanup";

export interface PlanCoordinationFailure {
  planId: string;
  operation: PlanCoordinationOperation;
  error: unknown;
}

export interface PlanCoordinationTask {
  operation: PlanCoordinationOperation;
  run(): Promise<void> | void;
}

export async function coordinateAfterCommit(
  planId: string,
  tasks: readonly PlanCoordinationTask[],
  onFailure?: (failure: PlanCoordinationFailure) => void,
): Promise<void> {
  for (const task of tasks) {
    try {
      await task.run();
    } catch (error) {
      onFailure?.({ planId, operation: task.operation, error });
    }
  }
}
