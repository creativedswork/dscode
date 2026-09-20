import { describe, expect, it } from "vitest";

import {
  applyTaskStateMutation,
  immutableTaskState,
  type TaskState,
  type TaskStateMutationCommand,
} from "../../../src/agents/process/task-state.js";
import {
  makeTaskStateDriver,
} from "../../../src/agents/tools/task-state-tools.js";

const callerAgentId = "main-1";

type TaskStateMutationInput<T = TaskStateMutationCommand> = T extends unknown
  ? Omit<T, "callerAgentId" | "expectedVersion">
  : never;

function initialize(todoIds = ["playable", "mobile"]): TaskState {
  return applyTaskStateMutation(undefined, {
    operation: "initialize",
    callerAgentId,
    expectedVersion: 0,
    taskId: "task-1",
    requestId: "request-1",
    sessionId: "session-1",
    todoList: todoIds.map((todoId) => ({
      todoId,
      title: `Outcome ${todoId}`,
    })),
  }, 10);
}

function mutate(
  state: TaskState,
  command: TaskStateMutationInput,
  now = state.updatedAt + 1,
): TaskState {
  return applyTaskStateMutation(state, {
    ...command,
    callerAgentId,
    expectedVersion: state.version,
  } as TaskStateMutationCommand, now);
}

describe("applyTaskStateMutation", () => {
  it("publishes task_update with an object-rooted function schema", () => {
    const [tool] = makeTaskStateDriver(() => {
      throw new Error("not used");
    }).tools;

    expect(tool.parameters).toMatchObject({
      type: "object",
      anyOf: expect.any(Array),
    });
  });

  it("supports the complete outcome mutation lifecycle with stable identities", () => {
    let state = initialize();
    state = mutate(state, {
      operation: "append",
      items: [{ todoId: "offline", title: "Offline delivery works" }],
    });
    state = mutate(state, {
      operation: "revise",
      todoId: "mobile",
      title: "Desktop and mobile controls work",
    });
    state = mutate(state, {
      operation: "reorder",
      todoIds: ["mobile", "playable", "offline"],
    });
    state = mutate(state, {
      operation: "transition",
      todoId: "mobile",
      status: "in_progress",
    });
    state = mutate(state, {
      operation: "split",
      todoId: "mobile",
      items: [
        { todoId: "mobile", title: "Desktop controls work" },
        { todoId: "touch", title: "Touch controls work" },
      ],
    });

    expect(state.todoList.map((item) => item.todoId)).toEqual([
      "mobile",
      "touch",
      "playable",
      "offline",
    ]);
    expect(state.todoList[0]).toMatchObject({
      todoId: "mobile",
      status: "in_progress",
    });

    state = mutate(state, {
      operation: "transition",
      todoId: "mobile",
      status: "completed",
      result: "Keyboard controls are playable",
    });
    state = mutate(state, {
      operation: "merge",
      todoIds: ["touch", "offline"],
      targetTodoId: "touch",
      title: "Mobile and offline delivery work",
    });
    state = mutate(state, {
      operation: "skip",
      todoId: "playable",
      reason: "Covered by the completed controls outcome",
    });
    state = mutate(state, {
      operation: "reopen",
      todoId: "playable",
      reason: "A separate gameplay outcome is still useful",
    });

    expect(state.todoList.find((item) => item.todoId === "offline"))
      .toMatchObject({ status: "skipped", result: "Merged into touch" });
    expect(state.todoList.find((item) => item.todoId === "playable"))
      .toMatchObject({ status: "pending" });
    expect(state.history.at(-1)?.operation).toBe("reopen");
  });

  it("requires structured external blockers and one active outcome", () => {
    let state = initialize();
    state = mutate(state, {
      operation: "transition",
      todoId: "playable",
      status: "in_progress",
    });
    expect(() => mutate(state, {
      operation: "transition",
      todoId: "mobile",
      status: "in_progress",
    })).toThrow("At most one TodoItem");
    expect(() => mutate(state, {
      operation: "transition",
      todoId: "playable",
      status: "blocked",
    })).toThrow("requires an external blocker");
    expect(() => mutate(state, {
      operation: "transition",
      todoId: "playable",
      status: "blocked",
      blocker: {
        kind: "retryable_tool_failure" as "environment",
        reason: "Command failed",
        recovery: "Retry",
      },
    })).toThrow("Unsupported blocker kind");
  });

  it("requires completion results and explicit reopen transitions", () => {
    let state = initialize(["playable"]);
    state = mutate(state, {
      operation: "transition",
      todoId: "playable",
      status: "in_progress",
    });
    expect(() => mutate(state, {
      operation: "transition",
      todoId: "playable",
      status: "completed",
    })).toThrow("result must not be empty");
    state = mutate(state, {
      operation: "transition",
      todoId: "playable",
      status: "completed",
      result: "The game is playable",
    });
    expect(state.status).toBe("completed");
    expect(() => mutate(state, {
      operation: "transition",
      todoId: "playable",
      status: "in_progress",
    })).toThrow("Illegal TodoItem transition");
    state = mutate(state, {
      operation: "reopen",
      todoId: "playable",
      reason: "Regression found",
    });
    expect(state).toMatchObject({
      status: "active",
      todoList: [{ todoId: "playable", status: "pending" }],
    });
  });

  it("initializes a later request through CAS after the prior task completes", () => {
    let state = initialize(["first"]);
    state = mutate(state, {
      operation: "transition",
      todoId: "first",
      status: "in_progress",
    });
    state = mutate(state, {
      operation: "transition",
      todoId: "first",
      status: "completed",
      result: "First request delivered",
    });

    const next = applyTaskStateMutation(state, {
      operation: "initialize",
      callerAgentId,
      expectedVersion: state.version,
      taskId: "task-2",
      requestId: "request-2",
      sessionId: "session-1",
      todoList: [{ todoId: "second", title: "Second outcome" }],
    }, 20);

    expect(next).toMatchObject({
      taskId: "task-2",
      requestId: "request-2",
      version: state.version + 1,
      status: "active",
    });
  });

  it("returns a deeply immutable public snapshot", () => {
    const snapshot = immutableTaskState(initialize());
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.todoList)).toBe(true);
    expect(Object.isFrozen(snapshot.todoList[0])).toBe(true);
    expect(Object.isFrozen(snapshot.history)).toBe(true);
  });
});
