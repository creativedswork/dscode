export type TodoStatus =
  | "pending"
  | "in_progress"
  | "completed"
  | "blocked"
  | "skipped";

export type TaskStatus =
  | "active"
  | "completed"
  | "blocked"
  | "cancelled"
  | "failed";

export interface TodoBlocker {
  kind:
    | "user_decision"
    | "permission"
    | "external_dependency"
    | "environment";
  reason: string;
  recovery: string;
}

export interface TodoItem {
  todoId: string;
  title: string;
  status: TodoStatus;
  result?: string;
  blocker?: TodoBlocker;
}

export interface TaskStateHistoryEntry {
  version: number;
  operation: TaskStateMutationCommand["operation"];
  summary: string;
  committedAt: number;
}

export interface TaskState {
  taskId: string;
  requestId: string;
  sessionId: string;
  version: number;
  status: TaskStatus;
  sourcePlan?: {
    planId: string;
    revision: number;
    digest: string;
  };
  todoList: TodoItem[];
  history: TaskStateHistoryEntry[];
  updatedAt: number;
}

interface TaskMutationBase {
  callerAgentId: string;
  expectedVersion: number;
}

export type TaskStateMutationCommand =
  | TaskMutationBase & {
      operation: "initialize";
      taskId: string;
      requestId: string;
      sessionId: string;
      sourcePlan?: TaskState["sourcePlan"];
      todoList: Array<Pick<TodoItem, "todoId" | "title">>;
    }
  | TaskMutationBase & {
      operation: "append";
      items: Array<Pick<TodoItem, "todoId" | "title">>;
    }
  | TaskMutationBase & {
      operation: "revise";
      todoId: string;
      title: string;
    }
  | TaskMutationBase & {
      operation: "split";
      todoId: string;
      items: Array<Pick<TodoItem, "todoId" | "title">>;
    }
  | TaskMutationBase & {
      operation: "merge";
      todoIds: string[];
      targetTodoId: string;
      title: string;
    }
  | TaskMutationBase & {
      operation: "reorder";
      todoIds: string[];
    }
  | TaskMutationBase & {
      operation: "transition";
      todoId: string;
      status: "pending" | "in_progress" | "completed" | "blocked";
      result?: string;
      blocker?: TodoBlocker;
    }
  | TaskMutationBase & {
      operation: "skip";
      todoId: string;
      reason: string;
    }
  | TaskMutationBase & {
      operation: "reopen";
      todoId: string;
      reason: string;
    };

export type TaskStateMutationResult =
  | { ok: true; taskState: Readonly<TaskState> }
  | {
      ok: false;
      reason: "conflict";
      expectedVersion: number;
      currentVersion: number;
      current?: Readonly<TaskState>;
    }
  | {
      ok: false;
      reason: "invalid_command" | "not_main";
      message: string;
      current?: Readonly<TaskState>;
    };

function text(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} must not be empty`);
  return normalized;
}

function validateBlocker(blocker: TodoBlocker | undefined): TodoBlocker {
  if (!blocker) throw new Error("Blocked TodoItem requires an external blocker");
  if (![
    "user_decision",
    "permission",
    "external_dependency",
    "environment",
  ].includes(blocker.kind)) {
    throw new Error(`Unsupported blocker kind: ${String(blocker.kind)}`);
  }
  return {
    kind: blocker.kind,
    reason: text(blocker.reason, "Blocker reason"),
    recovery: text(blocker.recovery, "Blocker recovery"),
  };
}

function validateItems(items: readonly TodoItem[]): void {
  if (new Set(items.map((item) => item.todoId)).size !== items.length) {
    throw new Error("TodoItem IDs must be unique");
  }
  if (items.filter((item) => item.status === "in_progress").length > 1) {
    throw new Error("At most one TodoItem may be in progress");
  }
  for (const item of items) {
    text(item.todoId, "TodoItem ID");
    text(item.title, `TodoItem ${item.todoId} title`);
    if (item.status === "completed" && !item.result?.trim()) {
      throw new Error(`Completed TodoItem ${item.todoId} requires a result`);
    }
    if (item.status === "blocked") validateBlocker(item.blocker);
    if (item.status !== "blocked" && item.blocker) {
      throw new Error(`TodoItem ${item.todoId} has a blocker while ${item.status}`);
    }
  }
}

function taskStatus(items: readonly TodoItem[]): TaskStatus {
  if (items.every((item) =>
    item.status === "completed" || item.status === "skipped"
  )) return "completed";
  if (items.some((item) =>
    item.status === "pending" || item.status === "in_progress"
  )) return "active";
  return "blocked";
}

function requireItem(items: TodoItem[], todoId: string): TodoItem {
  const item = items.find((candidate) => candidate.todoId === todoId);
  if (!item) throw new Error(`TodoItem not found: ${todoId}`);
  return item;
}

function newItem(input: Pick<TodoItem, "todoId" | "title">): TodoItem {
  return {
    todoId: text(input.todoId, "TodoItem ID"),
    title: text(input.title, `TodoItem ${input.todoId} title`),
    status: "pending",
  };
}

export function immutableTaskState(state: TaskState): Readonly<TaskState> {
  const snapshot = structuredClone(state);
  Object.freeze(snapshot.sourcePlan);
  for (const item of snapshot.todoList) {
    Object.freeze(item.blocker);
    Object.freeze(item);
  }
  for (const entry of snapshot.history) Object.freeze(entry);
  Object.freeze(snapshot.todoList);
  Object.freeze(snapshot.history);
  return Object.freeze(snapshot);
}

export function applyTaskStateMutation(
  current: Readonly<TaskState> | undefined,
  command: TaskStateMutationCommand,
  now: number,
): TaskState {
  if (command.operation === "initialize") {
    const currentVersion = current?.version ?? 0;
    if (
      command.expectedVersion !== currentVersion
      || (current && !["completed", "cancelled", "failed"].includes(current.status))
    ) {
      throw new Error(
        "TaskState initialization requires the current terminal version",
      );
    }
    const next: TaskState = {
      taskId: text(command.taskId, "Task ID"),
      requestId: text(command.requestId, "Request ID"),
      sessionId: text(command.sessionId, "Session ID"),
      version: currentVersion + 1,
      status: command.todoList.length === 0 ? "completed" : "active",
      sourcePlan: command.sourcePlan
        ? structuredClone(command.sourcePlan)
        : undefined,
      todoList: command.todoList.map(newItem),
      history: [{
        version: currentVersion + 1,
        operation: "initialize",
        summary: "Initialized task outcomes",
        committedAt: now,
      }],
      updatedAt: now,
    };
    validateItems(next.todoList);
    return next;
  }
  if (!current) throw new Error("TaskState is not initialized");
  if (current.version !== command.expectedVersion) {
    throw new Error("TaskState version conflict");
  }
  if (["cancelled", "failed"].includes(current.status)) {
    throw new Error(`Terminal TaskState cannot be mutated from ${current.status}`);
  }

  const next = structuredClone(current) as TaskState;
  let summary: string;
  switch (command.operation) {
    case "append":
      next.todoList.push(...command.items.map(newItem));
      summary = `Appended ${command.items.length} outcome(s)`;
      break;
    case "revise": {
      const item = requireItem(next.todoList, command.todoId);
      item.title = text(command.title, `TodoItem ${command.todoId} title`);
      summary = `Revised ${command.todoId}`;
      break;
    }
    case "split": {
      if (command.items.length < 2) {
        throw new Error("Split requires at least two outcomes");
      }
      const index = next.todoList.findIndex((item) =>
        item.todoId === command.todoId
      );
      if (index < 0) throw new Error(`TodoItem not found: ${command.todoId}`);
      const source = next.todoList[index];
      if (source.status === "completed") {
        throw new Error("Completed TodoItem must be reopened before splitting");
      }
      if (command.items[0].todoId !== source.todoId) {
        throw new Error("The first split outcome must retain the source todoId");
      }
      const replacements = command.items.map(newItem);
      replacements[0] = {
        ...replacements[0],
        status: source.status,
        result: source.result,
        blocker: source.blocker,
      };
      next.todoList.splice(index, 1, ...replacements);
      summary = `Split ${command.todoId} into ${command.items.length} outcomes`;
      break;
    }
    case "merge": {
      if (command.todoIds.length < 2) {
        throw new Error("Merge requires at least two TodoItems");
      }
      if (!command.todoIds.includes(command.targetTodoId)) {
        throw new Error("Merged target must retain one source todoId");
      }
      const sources = command.todoIds.map((todoId) =>
        requireItem(next.todoList, todoId)
      );
      if (sources.some((item) => item.status === "completed")) {
        throw new Error("Completed TodoItem must be reopened before merging");
      }
      const target = requireItem(next.todoList, command.targetTodoId);
      const priorTitles = sources.map((item) => item.title);
      target.title = text(command.title, `TodoItem ${target.todoId} title`);
      target.status = sources.some((item) => item.status === "in_progress")
        ? "in_progress"
        : "pending";
      target.result = undefined;
      target.blocker = undefined;
      for (const source of sources) {
        if (source.todoId === target.todoId) continue;
        source.status = "skipped";
        source.result = `Merged into ${target.todoId}`;
        source.blocker = undefined;
      }
      summary = `Merged outcomes: ${priorTitles.join(" | ")}`;
      break;
    }
    case "reorder": {
      if (
        command.todoIds.length !== next.todoList.length
        || new Set(command.todoIds).size !== command.todoIds.length
        || command.todoIds.some((todoId) =>
          !next.todoList.some((item) => item.todoId === todoId)
        )
      ) {
        throw new Error("Reorder must contain every TodoItem exactly once");
      }
      const byId = new Map(next.todoList.map((item) => [item.todoId, item]));
      next.todoList = command.todoIds.map((todoId) => byId.get(todoId)!);
      summary = "Reordered task outcomes";
      break;
    }
    case "transition": {
      const item = requireItem(next.todoList, command.todoId);
      const allowed = new Set<TodoStatus>(
        item.status === "pending"
          ? ["in_progress", "blocked"]
          : item.status === "in_progress"
          ? ["pending", "completed", "blocked"]
          : item.status === "blocked"
          ? ["in_progress"]
          : [],
      );
      if (!allowed.has(command.status)) {
        throw new Error(
          `Illegal TodoItem transition: ${item.status} -> ${command.status}`,
        );
      }
      if (command.status === "completed") {
        item.result = text(command.result ?? "", "Completed TodoItem result");
        item.blocker = undefined;
      } else if (command.status === "blocked") {
        item.blocker = validateBlocker(command.blocker);
        item.result = undefined;
      } else {
        item.result = undefined;
        item.blocker = undefined;
      }
      item.status = command.status;
      summary = `Transitioned ${command.todoId} to ${command.status}`;
      break;
    }
    case "skip": {
      const item = requireItem(next.todoList, command.todoId);
      item.status = "skipped";
      item.result = text(command.reason, "Skip reason");
      item.blocker = undefined;
      summary = `Skipped ${command.todoId}: ${item.result}`;
      break;
    }
    case "reopen": {
      const item = requireItem(next.todoList, command.todoId);
      if (item.status !== "completed" && item.status !== "skipped"
        && item.status !== "blocked") {
        throw new Error(`TodoItem ${command.todoId} cannot be reopened`);
      }
      text(command.reason, "Reopen reason");
      item.status = "pending";
      item.result = undefined;
      item.blocker = undefined;
      summary = `Reopened ${command.todoId}: ${command.reason.trim()}`;
      break;
    }
  }
  validateItems(next.todoList);
  next.version++;
  next.status = taskStatus(next.todoList);
  next.updatedAt = now;
  next.history.push({
    version: next.version,
    operation: command.operation,
    summary,
    committedAt: now,
  });
  return next;
}
