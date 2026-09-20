import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "@earendil-works/pi-ai";
import type { Static } from "@earendil-works/pi-ai";

import type { AgentSupervisor } from "../process/supervisor.js";
import { getExecutionContext } from "../../kernel/execution-context.js";
import type { Driver } from "../../drivers/types.js";

export const TASK_STATE_TOOL_NAME = "task_update";

const TodoInput = Type.Object({
  todoId: Type.String({ minLength: 1 }),
  title: Type.String({ minLength: 1 }),
}, { additionalProperties: false });

const Blocker = Type.Object({
  kind: Type.Union([
    Type.Literal("user_decision"),
    Type.Literal("permission"),
    Type.Literal("external_dependency"),
    Type.Literal("environment"),
  ]),
  reason: Type.String({ minLength: 1 }),
  recovery: Type.String({ minLength: 1 }),
}, { additionalProperties: false });

const Common = {
  expectedVersion: Type.Integer({ minimum: 0 }),
};

const taskUpdateVariants = Type.Union([
  Type.Object({
    ...Common,
    operation: Type.Literal("initialize"),
    taskId: Type.String({ minLength: 1 }),
    requestId: Type.String({ minLength: 1 }),
    sessionId: Type.String({ minLength: 1 }),
    sourcePlan: Type.Optional(Type.Object({
      planId: Type.String({ minLength: 1 }),
      revision: Type.Integer({ minimum: 1 }),
      digest: Type.String({ pattern: "^[a-f0-9]{64}$" }),
    }, { additionalProperties: false })),
    todoList: Type.Array(TodoInput),
  }, { additionalProperties: false }),
  Type.Object({
    ...Common,
    operation: Type.Literal("append"),
    items: Type.Array(TodoInput, { minItems: 1 }),
  }, { additionalProperties: false }),
  Type.Object({
    ...Common,
    operation: Type.Literal("revise"),
    todoId: Type.String({ minLength: 1 }),
    title: Type.String({ minLength: 1 }),
  }, { additionalProperties: false }),
  Type.Object({
    ...Common,
    operation: Type.Literal("split"),
    todoId: Type.String({ minLength: 1 }),
    items: Type.Array(TodoInput, { minItems: 2 }),
  }, { additionalProperties: false }),
  Type.Object({
    ...Common,
    operation: Type.Literal("merge"),
    todoIds: Type.Array(Type.String({ minLength: 1 }), { minItems: 2 }),
    targetTodoId: Type.String({ minLength: 1 }),
    title: Type.String({ minLength: 1 }),
  }, { additionalProperties: false }),
  Type.Object({
    ...Common,
    operation: Type.Literal("reorder"),
    todoIds: Type.Array(Type.String({ minLength: 1 })),
  }, { additionalProperties: false }),
  Type.Object({
    ...Common,
    operation: Type.Literal("transition"),
    todoId: Type.String({ minLength: 1 }),
    status: Type.Union([
      Type.Literal("pending"),
      Type.Literal("in_progress"),
      Type.Literal("completed"),
      Type.Literal("blocked"),
    ]),
    result: Type.Optional(Type.String()),
    blocker: Type.Optional(Blocker),
  }, { additionalProperties: false }),
  Type.Object({
    ...Common,
    operation: Type.Literal("skip"),
    todoId: Type.String({ minLength: 1 }),
    reason: Type.String({ minLength: 1 }),
  }, { additionalProperties: false }),
  Type.Object({
    ...Common,
    operation: Type.Literal("reopen"),
    todoId: Type.String({ minLength: 1 }),
    reason: Type.String({ minLength: 1 }),
  }, { additionalProperties: false }),
]);

const taskUpdateParams = Type.Unsafe<Static<typeof taskUpdateVariants>>({
  ...taskUpdateVariants,
  type: "object",
});

export function makeTaskStateDriver(
  supervisor: () => AgentSupervisor,
): Driver {
  const tool: AgentTool<typeof taskUpdateParams> = {
    name: TASK_STATE_TOOL_NAME,
    label: "Update Task Outcomes",
    description: "Maintain Main's outcome-oriented TODO state. Track user-visible results, not files, implementation phases, commands, tests, or manual checks. Block only on an external dependency that Main cannot resolve.",
    effect: "unknown",
    planOperation: { domain: "task", sideEffectFree: true },
    audience: "main",
    parameters: taskUpdateParams,
    execute: async (_id, params) => {
      const context = getExecutionContext();
      if (!context) throw new Error("TaskState update requires execution context");
      const main = supervisor().require(context.processId);
      const result = await supervisor().mutateTaskState({
        ...params,
        callerAgentId: main.agentId,
      });
      if (!result.ok) {
        throw new Error(
          result.reason === "conflict"
            ? `TaskState version conflict: current ${result.currentVersion}`
            : result.message,
        );
      }
      return {
        content: [{
          type: "text",
          text: `TaskState updated\n${JSON.stringify(result.taskState)}`,
        }],
        details: result.taskState,
      };
    },
  };
  return {
    name: "task-state",
    description: "Main Agent task outcome state",
    tools: [tool],
    source: "builtin",
  };
}
