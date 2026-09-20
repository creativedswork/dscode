import type {
  TaskState,
  TaskStateMutationCommand,
  TaskStateMutationResult,
} from "../agents/process/task-state.js";

export type {
  TaskState,
  TaskStateMutationCommand,
  TaskStateMutationResult,
  TodoBlocker,
  TodoItem,
  TodoStatus,
} from "../agents/process/task-state.js";

export interface TaskStatePort {
  getTaskState(sessionId: string): Promise<Readonly<TaskState> | undefined>;
  mutateTaskState(
    command: TaskStateMutationCommand,
  ): Promise<TaskStateMutationResult>;
}
