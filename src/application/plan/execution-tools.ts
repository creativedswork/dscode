import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "@earendil-works/pi-ai";

import type { AgentSupervisor } from "../../agents/process/supervisor.js";
import type { Driver } from "../../drivers/types.js";
import { getExecutionContext } from "../../kernel/execution-context.js";
import { bindPlanItemToAgent } from "./execution-binding.js";
import { planExecutionUnits } from "./execution-model.js";
import { PlanExecutionService } from "./execution-service.js";

export const PLAN_EXECUTION_TOOL_NAMES = [
  "plan_start_item",
  "plan_report_conflict",
] as const;

const capability = {
  effect: "unknown" as const,
  planOperation: { domain: "plan" as const, sideEffectFree: true as const },
  audience: "main" as const,
};

const itemParams = Type.Object({
  planId: Type.String({ minLength: 1 }),
  expectedVersion: Type.Integer({ minimum: 1 }),
  revision: Type.Integer({ minimum: 1 }),
  digest: Type.String({ pattern: "^[a-f0-9]{64}$" }),
  itemId: Type.String({ minLength: 1 }),
}, { additionalProperties: false });

const conflictParams = Type.Object({
  ...itemParams.properties,
  commandId: Type.Optional(Type.String({
    minLength: 1,
    description: "Optional idempotency hint. The Host uses the Tool Call ID.",
  })),
  conflictTarget: Type.Union([
    Type.Object({
      kind: Type.Literal("hard_constraint"),
      constraintId: Type.String({ minLength: 1 }),
    }, { additionalProperties: false }),
    Type.Object({
      kind: Type.Literal("selected_decision"),
      decisionNodeId: Type.String({ minLength: 1 }),
      optionId: Type.String({ minLength: 1 }),
    }, { additionalProperties: false }),
  ]),
  evidenceIds: Type.Array(Type.String({ minLength: 1 }), {
    minItems: 1,
    description: "Successful persisted tool evidence from the current item.",
  }),
  summary: Type.String({ minLength: 1 }),
}, { additionalProperties: false });

interface ExecutionToolOptions {
  service(): PlanExecutionService;
  supervisor(): AgentSupervisor;
}

function currentMain(options: ExecutionToolOptions) {
  const context = getExecutionContext();
  if (!context) throw new Error("Plan operation requires an execution context");
  const process = options.supervisor().require(context.processId);
  if (process.role !== "main") throw new Error("Plan operation requires Main Agent");
  return process;
}

function requireTaskStateForPlanStart(
  main: ReturnType<typeof currentMain>,
  params: {
    planId: string;
    revision: number;
    digest: string;
  },
): void {
  const taskState = main.context.taskState;
  if (
    !taskState
    || taskState.status !== "active"
    || taskState.sessionId !== main.parentSessionId
    || taskState.sourcePlan?.planId !== params.planId
    || taskState.sourcePlan.revision !== params.revision
    || taskState.sourcePlan.digest !== params.digest
  ) {
    throw new Error(
      "plan_start_item requires task_update initialize first with an active "
      + "TaskState for the owning Main Session and the exact Plan "
      + "planId, revision, and digest",
    );
  }
}

function resultText(label: string, details: unknown, terminate = false) {
  return {
    content: [{ type: "text" as const, text: `${label}\n${JSON.stringify(details)}` }],
    details,
    terminate,
  };
}

export function makePlanExecutionDriver(options: ExecutionToolOptions): Driver {
  const startItem: AgentTool<typeof itemParams> = {
    ...capability,
    name: PLAN_EXECUTION_TOOL_NAMES[0],
    label: "Start Plan Item",
    description: "Bind Main execution to one approved Plan item.",
    parameters: itemParams,
    execute: async (_id, params) => {
      const main = currentMain(options);
      requireTaskStateForPlanStart(main, params);
      const outcome = await options.service().bindItem({
        ...params,
        agentId: main.agentId,
        role: "main",
      });
      if (!outcome.ok) throw new Error(outcome.message);
      const item = planExecutionUnits(outcome.plan).find((candidate) =>
        candidate.stepId === params.itemId
      );
      const binding = item?.executionBindings?.find((candidate) =>
        candidate.agentId === main.agentId
      );
      if (!binding) throw new Error("Main execution binding was not persisted");
      bindPlanItemToAgent(main, binding);
      return resultText("Plan item started", outcome.plan);
    },
  };
  const reportConflict: AgentTool<typeof conflictParams> = {
    ...capability,
    name: PLAN_EXECUTION_TOOL_NAMES[1],
    label: "Report Plan Conflict",
    description: "Report a material conflict only when successful objective tool evidence from the current bound item invalidates an actual hard constraint or selected decision. Tool failures, permission denials, unknown outcomes, and agent summaries are not material-conflict evidence.",
    parameters: conflictParams,
    execute: async (id, params) => {
      const main = currentMain(options);
      if (main.context.activePlan?.planId !== params.planId) {
        throw new Error("Main Agent is not attached to this Plan");
      }
      const loaded = await options.service().load(params.planId);
      if (!loaded.ok || !loaded.plan) throw new Error("Plan not found");
      const outcome = await options.service().materialConflict({
        ...params,
        expectedVersion: loaded.plan.version,
        commandId: id,
        callerAgentId: main.agentId,
      });
      if (!outcome.ok) throw new Error(outcome.message);
      return resultText("Plan requires replanning", outcome.plan, true);
    },
  };
  return {
    name: "plan-execution",
    description: "Approved Plan execution controls",
    tools: [startItem, reportConflict],
    source: "builtin",
  };
}
