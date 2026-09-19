import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "@earendil-works/pi-ai";

import type { ToolCapability } from "../../kernel/tool-effects.js";
import { PlanExecutionService } from "./execution-service.js";
import {
  Candidate,
  EffectGrant,
  EvidenceReference,
  PlanVerification,
} from "./schema-parts.js";
import { planExecutionUnits } from "./execution-model.js";
import { PlannerInteractionBroker } from "./planner-interactions.js";
import { PlannerService } from "./planner-service.js";
import type { PlanRecord } from "./types.js";

export const PLANNER_TOOL_NAMES = [
  "plan_initialize",
  "plan_append_decision",
  "plan_select_decision",
  "plan_record_fact",
  "plan_compile",
  "plan_request_decision",
  "plan_authorize",
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
  resolvesRequirementIds: Type.Array(Type.String({ minLength: 1 }), {
    maxItems: 1,
  }),
  candidates: Type.Array(Candidate),
}, { additionalProperties: false });

const selectDecisionParams = Type.Object({
  expectedVersion: Type.Integer({ minimum: 1 }),
  decisionNodeId: Type.String({ minLength: 1 }),
  optionId: Type.String({ minLength: 1 }),
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

const authorizeParams = Type.Object({
  expectedVersion: Type.Integer({ minimum: 1 }),
}, { additionalProperties: false });

const compileParams = Type.Object({
  expectedVersion: Type.Integer({ minimum: 1 }),
  executionSteps: Type.Array(Type.Object({
    stepId: Type.String({ minLength: 1 }),
    title: Type.String({ minLength: 1 }),
    description: Type.String({ minLength: 1 }),
    dependsOn: Type.Array(Type.String({ minLength: 1 })),
    verifications: Type.Array(PlanVerification, { minItems: 1 }),
    effectGrants: Type.Array(EffectGrant),
  }, { additionalProperties: false }), { minItems: 1 }),
  sideEffectSummary: Type.String({ minLength: 1 }),
}, { additionalProperties: false });

interface PlannerToolOptions {
  plannerAgentId: string;
  planId(): string;
  service: PlannerService;
  execution?: PlanExecutionService;
  interactions: PlannerInteractionBroker;
  availableExecutionToolNames?(): readonly string[];
}

function textResult(label: string, details: Readonly<PlanRecord>) {
  const summary = {
    planId: details.planId,
    status: details.status,
    version: details.version,
    revision: details.revision,
    digest: details.digest,
    alignmentRequirements: details.alignmentRequirements ?? [],
    decisions: details.decisions.map((decision) => ({
      decisionNodeId: decision.decisionNodeId,
      status: decision.status,
      selectedOptionId: decision.selectedOptionId,
    })),
    executionSteps: planExecutionUnits(details).map((step) => ({
      stepId: step.stepId,
      status: step.status,
    })),
    pendingInteraction: details.pendingInteraction,
  };
  return {
    content: [{
      type: "text" as const,
      text: `${label}\n${JSON.stringify(summary)}`,
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
    description:
      "Append one bounded decision node. Set resolvesRequirementIds to one pending alignment requirement for a user-value question, or [] for a technical decision.",
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
  const selectDecision: AgentTool<typeof selectDecisionParams> = {
    ...PLANNER_TOOL_CAPABILITIES[2],
    name: PLANNER_TOOL_NAMES[2],
    label: "Select Plan Decision",
    description: "Select a technical candidate that does not require user-value input.",
    parameters: selectDecisionParams,
    execute: async (id, params) => {
      const result = requireSuccess(await options.service.applyDecision({
        planId: options.planId(),
        plannerAgentId: options.plannerAgentId,
        expectedVersion: params.expectedVersion,
        commandId: id,
        action: {
          kind: "select",
          decisionNodeId: params.decisionNodeId,
          optionId: params.optionId,
        },
      }), "Decision selection");
      return textResult("Technical decision selected", result.plan);
    },
  };
  const recordFact: AgentTool<typeof recordFactParams> = {
    ...PLANNER_TOOL_CAPABILITIES[3],
    name: PLANNER_TOOL_NAMES[3],
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
  const compile: AgentTool<typeof compileParams> = {
    ...PLANNER_TOOL_CAPABILITIES[4],
    name: PLANNER_TOOL_NAMES[4],
    label: "Compile Execution Plan",
    description: "Compile selected public decisions into ordered executable Plan items.",
    parameters: compileParams,
    execute: async (_id, params) => {
      const execution = options.execution ?? new PlanExecutionService(options.service.store);
      const availableToolNames = options.availableExecutionToolNames?.();
      const result = requireSuccess(await execution.compile(
        options.planId(),
        options.plannerAgentId,
        params.expectedVersion,
        params,
        availableToolNames ? new Set(availableToolNames) : undefined,
      ), "Plan compilation");
      return textResult("Execution Plan compiled", result.plan);
    },
  };
  const requestDecision: AgentTool<typeof requestDecisionParams> = {
    ...PLANNER_TOOL_CAPABILITIES[5],
    name: PLANNER_TOOL_NAMES[5],
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
  const authorize: AgentTool<typeof authorizeParams> = {
    ...PLANNER_TOOL_CAPABILITIES[6],
    name: PLANNER_TOOL_NAMES[6],
    label: "Authorize Plan",
    description: "Validate and internally authorize the current revision and digest.",
    parameters: authorizeParams,
    execute: async (_id, params) => {
      const plan = await options.service.authorize(
        options.planId(),
        options.plannerAgentId,
        params.expectedVersion,
      );
      return textResult("Plan internally authorized", plan);
    },
  };
  return [
    initialize,
    appendDecision,
    selectDecision,
    recordFact,
    compile,
    requestDecision,
    authorize,
  ];
}
