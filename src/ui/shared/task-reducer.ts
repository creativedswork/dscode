import type { TaskState } from "../../application/task-state-port.js";
import type { ServerEvent } from "./types.js";

export interface TaskViewState {
  sessionId: string | null;
  taskState: Readonly<TaskState> | null;
}

export const EMPTY_TASK_VIEW_STATE: TaskViewState = {
  sessionId: null,
  taskState: null,
};

export function taskViewReducer(
  state: TaskViewState,
  event: ServerEvent,
): TaskViewState {
  if (event.type !== "task_state") return state;
  if (!event.taskState) {
    return {
      sessionId: event.sessionId || null,
      taskState: null,
    };
  }
  if (event.taskState.sessionId !== event.sessionId) return state;
  if (state.sessionId && state.sessionId !== event.sessionId) return state;
  if (
    state.taskState?.sessionId === event.sessionId
    && state.taskState.version > event.taskState.version
  ) {
    return state;
  }
  return { sessionId: event.sessionId, taskState: event.taskState };
}
