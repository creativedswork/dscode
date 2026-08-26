import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "@earendil-works/pi-ai";

import type { AgentSupervisor } from "../../agents/process/supervisor.js";
import type { Driver } from "../../drivers/types.js";
import { getExecutionContext } from "../../kernel/execution-context.js";
import { bindPlanItemToAgent } from "./execution-binding.js";
import { PlanExecutionService } from "./execution-service.js";

export const PLAN_EXECUTION_TOOL_NAMES = [
  "plan_start_item",
  "verify_item",
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

const verifyParams = Type.Object({
  ...itemParams.properties,
  commandId: Type.String({ minLength: 1 }),
  criteria: Type.Array(Type.Object({
    criterionId: Type.String({ minLength: 1 }),
    passed: Type.Boolean(),
    evidenceIds: Type.Array(Type.String({ minLength: 1 })),
    observedExitCode: Type.Optional(Type.Integer()),
    observed: Type.Optional(Type.Object({
      matched: Type.Boolean(),
      description: Type.String({ minLength: 1 }),
    }, { additionalProperties: false })),
    humanReceiptCommandId: Type.Optional(Type.String({ minLength: 1 })),
  }, { additionalProperties: false })),
}, { additionalProperties: false });

const conflictParams = Type.Object({
  planId: Type.String({ minLength: 1 }),
  expectedVersion: Type.Integer({ minimum: 1 }),
  commandId: Type.String({ minLength: 1 }),
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
      const outcome = await options.service().bindItem({
        ...params,
        agentId: main.agentId,
        role: "main",
      });
      if (!outcome.ok) throw new Error(outcome.message);
      const item = outcome.plan.items.find((candidate) =>
        candidate.itemId === params.itemId
      );
      const binding = item?.executionBindings?.find((candidate) =>
        candidate.agentId === main.agentId
      );
      if (!binding) throw new Error("Main execution binding was not persisted");
      bindPlanItemToAgent(main, binding);
      return resultText("Plan item started", outcome.plan);
    },
  };
  const verifyItem: AgentTool<typeof verifyParams> = {
    ...capability,
    name: PLAN_EXECUTION_TOOL_NAMES[1],
    label: "Verify Plan Item",
    description: "Verify acceptance criteria with recorded evidence.",
    parameters: verifyParams,
    execute: async (_id, params) => {
      const main = currentMain(options);
      const outcome = await options.service().verifyItem({
        ...params,
        callerAgentId: main.agentId,
      });
      if (!outcome.ok) throw new Error(outcome.message);
      return resultText(
        "Plan item verified",
        outcome.plan,
        outcome.plan.status === "completed",
      );
    },
  };
  const reportConflict: AgentTool<typeof conflictParams> = {
    ...capability,
    name: PLAN_EXECUTION_TOOL_NAMES[2],
    label: "Report Plan Conflict",
    description: "Stop new Plan item scheduling after a material conflict.",
    parameters: conflictParams,
    execute: async (_id, params) => {
      const main = currentMain(options);
      if (main.context.activePlan?.planId !== params.planId) {
        throw new Error("Main Agent is not attached to this Plan");
      }
      const outcome = await options.service().materialConflict(params);
      if (!outcome.ok) throw new Error(outcome.message);
      return resultText("Plan requires replanning", outcome.plan, true);
    },
  };
  return {
    name: "plan-execution",
    description: "Approved Plan execution controls",
    tools: [startItem, verifyItem, reportConflict],
    source: "builtin",
  };
}
