import { describe, expect, it } from "vitest";

import type { TaskState } from "../../src/agents/process/task-state.js";
import {
  EMPTY_TASK_VIEW_STATE,
  taskViewReducer,
} from "../../src/ui/shared/task-reducer.js";

function taskState(
  sessionId: string,
  version: number,
  status: TaskState["status"] = "active",
): TaskState {
  return {
    taskId: `task-${sessionId}`,
    requestId: `request-${sessionId}`,
    sessionId,
    version,
    status,
    todoList: [{
      todoId: "outcome-1",
      title: "Playable result",
      status: status === "completed" ? "completed" : "in_progress",
      ...(status === "completed" ? { result: "Delivered" } : {}),
    }],
    history: [],
    updatedAt: version,
  };
}

describe("taskViewReducer", () => {
  it("accepts Direct TaskState without any Plan state", () => {
    const task = taskState("session-1", 1);
    expect(taskViewReducer(EMPTY_TASK_VIEW_STATE, {
      type: "task_state",
      sessionId: "session-1",
      taskState: task,
    })).toEqual({ sessionId: "session-1", taskState: task });
  });

  it("ignores stale versions for the selected Session", () => {
    const current = taskViewReducer(EMPTY_TASK_VIEW_STATE, {
      type: "task_state",
      sessionId: "session-1",
      taskState: taskState("session-1", 2),
    });
    expect(taskViewReducer(current, {
      type: "task_state",
      sessionId: "session-1",
      taskState: taskState("session-1", 1),
    })).toBe(current);
  });

  it("rejects a delayed snapshot from the previous Session after switching", () => {
    const first = taskViewReducer(EMPTY_TASK_VIEW_STATE, {
      type: "task_state",
      sessionId: "session-1",
      taskState: taskState("session-1", 3),
    });
    const cleared = taskViewReducer(first, {
      type: "task_state",
      sessionId: "session-2",
      taskState: null,
    });
    const delayed = taskViewReducer(cleared, {
      type: "task_state",
      sessionId: "session-1",
      taskState: taskState("session-1", 4),
    });

    expect(delayed).toEqual({ sessionId: "session-2", taskState: null });
  });

  it("restores terminal TaskState and clears it explicitly", () => {
    const completed = taskState("session-1", 5, "completed");
    const restored = taskViewReducer(EMPTY_TASK_VIEW_STATE, {
      type: "task_state",
      sessionId: "session-1",
      taskState: completed,
    });
    expect(restored.taskState?.status).toBe("completed");
    expect(taskViewReducer(restored, {
      type: "task_state",
      sessionId: "session-1",
      taskState: null,
    })).toEqual({ sessionId: "session-1", taskState: null });
  });
});
