import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "@earendil-works/pi-ai";

import type { ToolCapability } from "../../kernel/tool-effects.js";
import { Candidate, EvidenceReference } from "./schema-parts.js";
import { PlannerInteractionBroker } from "./planner-interactions.js";
import { PlannerService } from "./planner-service.js";

export const PLANNER_TOOL_NAMES = [
  "plan_initialize",
  "plan_append_decision",
  "plan_record_fact",
  "plan_request_decision",
  "plan_request_approval",
] as const;

export const PLANNER_TOOL_CAPABILITIES: readonly ToolCapability[] =
  Object.freeze(PLANNER_TOOL_NAMES.map((name) => ({
    name,
    effect: "unknown" as const,
    planOperation: { domain: "plan" as const, sideEffectFree: true as const },
    audience: "planner" as const,
  })));

const Constraint = Type.Object({
  constraintId: Type.String({ minLength: 1 }),
  kind: Type.Union([Type.Literal("hard"), Type.Literal("preference")]),
  description: Type.String(),
  source: Type.Union([
    Type.Literal("user"),
    Type.Literal("system"),
    Type.Literal("evidence"),
  ]),
}, { additionalProperties: false });

const initializeParams = Type.Object({
  expectedVersion: Type.Integer({ minimum: 1 }),
  goal: Type.String(),
  constraints: Type.Array(Constraint),
}, { additionalProperties: false });

const appendDecisionParams = Type.Object({
  expectedVersion: Type.Integer({ minimum: 1 }),
  decisionNodeId: Type.String({ minLength: 1 }),
  question: Type.String(),
  candidates: Type.Array(Candidate),
}, { additionalProperties: false });

const recordFactParams = Type.Object({
  expectedVersion: Type.Integer({ minimum: 1 }),
  summary: Type.String(),
  references: Type.Array(EvidenceReference),
}, { additionalProperties: false });

const requestDecisionParams = Type.Object({
  expectedVersion: Type.Integer({ minimum: 1 }),
  interactionId: Type.String({ minLength: 1 }),
  decisionNodeId: Type.String({ minLength: 1 }),
}, { additionalProperties: false });

const requestApprovalParams = Type.Object({
  expectedVersion: Type.Integer({ minimum: 1 }),
  interactionId: Type.String({ minLength: 1 }),
}, { additionalProperties: false });

interface PlannerToolOptions {
  plannerAgentId: string;
  planId(): string;
  service: PlannerService;
  interactions: PlannerInteractionBroker;
}

function textResult(label: string, details: unknown) {
  return {
    content: [{
      type: "text" as const,
      text: `${label}\n${JSON.stringify(details, null, 2)}`,
    }],
    details,
  };
}

function requireSuccess<T extends { ok: boolean }>(
  result: T,
  operation: string,
): Extract<T, { ok: true }> {
  if (!result.ok) throw new Error(`${operation} failed: ${JSON.stringify(result)}`);
  return result as Extract<T, { ok: true }>;
}

export function makePlannerTools(options: PlannerToolOptions): AgentTool<any>[] {
  const initialize: AgentTool<typeof initializeParams> = {
    ...PLANNER_TOOL_CAPABILITIES[0],
    name: PLANNER_TOOL_NAMES[0],
    label: "Initialize Plan",
    description: "Set the public goal and explicit constraints for this Plan.",
    parameters: initializeParams,
    execute: async (_id, params) => {
      const result = requireSuccess(await options.service.initialize(
        options.planId(),
        options.plannerAgentId,
        params.expectedVersion,
        params.goal,
        params.constraints,
      ), "Plan initialization");
      return textResult("Plan initialized", result.plan);
    },
  };
  const appendDecision: AgentTool<typeof appendDecisionParams> = {
    ...PLANNER_TOOL_CAPABILITIES[1],
    name: PLANNER_TOOL_NAMES[1],
    label: "Append Plan Decision",
    description: "Append one bounded decision node with public candidate evaluations.",
    parameters: appendDecisionParams,
    execute: async (_id, params) => {
      const result = requireSuccess(await options.service.appendDecision(
        options.planId(),
        options.plannerAgentId,
        params.expectedVersion,
        params,
      ), "Decision append");
      return textResult("Decision appended", result.plan);
    },
  };
  const recordFact: AgentTool<typeof recordFactParams> = {
    ...PLANNER_TOOL_CAPABILITIES[2],
    name: PLANNER_TOOL_NAMES[2],
    label: "Record Plan Fact",
    description: "Persist a concise public fact and its evidence references.",
    parameters: recordFactParams,
    execute: async (_id, params) => {
      const result = requireSuccess(await options.service.recordFact(
        options.planId(),
        options.plannerAgentId,
        params.expectedVersion,
        params,
      ), "Fact recording");
      return textResult("Fact recorded", result.plan);
    },
  };
  const requestDecision: AgentTool<typeof requestDecisionParams> = {
    ...PLANNER_TOOL_CAPABILITIES[3],
    name: PLANNER_TOOL_NAMES[3],
    label: "Request Plan Decision",
    description: "Persist a required human decision and wait for its durable resolution.",
    parameters: requestDecisionParams,
    execute: async (_id, params, signal) => {
      const waiting = options.interactions.wait(params.interactionId, signal);
      void waiting.catch(() => {});
      try {
        const plan = await options.service.requestDecision(
          options.planId(),
          options.plannerAgentId,
          params.expectedVersion,
          params.interactionId,
          params.decisionNodeId,
        );
        if (!plan.pendingInteraction) {
          options.interactions.reject(
            params.interactionId,
            new Error("Human decision is not required"),
          );
          return textResult("No human decision required", plan);
        }
        const resolved = await waiting;
        return textResult("Human decision recorded", resolved);
      } catch (error) {
        options.interactions.reject(
          params.interactionId,
          error instanceof Error ? error : new Error(String(error)),
        );
        await waiting.catch(() => {});
        throw error;
      }
    },
  };
  const requestApproval: AgentTool<typeof requestApprovalParams> = {
    ...PLANNER_TOOL_CAPABILITIES[4],
    name: PLANNER_TOOL_NAMES[4],
    label: "Request Plan Approval",
    description: "Persist final approval as required and wait for the approved revision.",
    parameters: requestApprovalParams,
    execute: async (_id, params, signal) => {
      const waiting = options.interactions.wait(params.interactionId, signal);
      void waiting.catch(() => {});
      try {
        await options.service.requestApproval(
          options.planId(),
          options.plannerAgentId,
          params.expectedVersion,
          params.interactionId,
        );
        const resolved = await waiting;
        return textResult("Plan approval recorded", resolved);
      } catch (error) {
        options.interactions.reject(
          params.interactionId,
          error instanceof Error ? error : new Error(String(error)),
        );
        await waiting.catch(() => {});
        throw error;
      }
    },
  };
  return [initialize, appendDecision, recordFact, requestDecision, requestApproval];
}
