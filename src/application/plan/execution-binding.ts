import type { AgentProcess } from "../../agents/process/types.js";
import type { PlanExecutionBinding } from "./types.js";

export function attachPlanToAgent(
  process: AgentProcess,
  plan: Pick<PlanExecutionBinding, "planId" | "revision" | "digest">,
): void {
  process.context = Object.freeze({
    ...process.context,
    activePlan: Object.freeze({ ...plan }),
    planBinding: undefined,
  });
}

export function bindPlanItemToAgent(
  process: AgentProcess,
  binding: PlanExecutionBinding,
): void {
  if (binding.agentId !== process.agentId) {
    throw new Error(`Plan binding does not match Agent ${process.agentId}`);
  }
  process.context = Object.freeze({
    ...process.context,
    activePlan: Object.freeze({
      planId: binding.planId,
      revision: binding.revision,
      digest: binding.digest,
    }),
    planBinding: Object.freeze({ ...binding }),
  });
}

export function clearAgentPlan(process: AgentProcess): void {
  process.context = Object.freeze({
    ...process.context,
    activePlan: undefined,
    planBinding: undefined,
  });
}
