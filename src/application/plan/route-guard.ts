import type { AgentTool } from "@earendil-works/pi-agent-core";

import type { Driver } from "../../drivers/types.js";
import { isPlanToolAllowed } from "../../kernel/tool-effects.js";
import type { ToolCapability } from "../../kernel/tool-effects.js";
import {
  decidePlanRoute,
  PLAN_ROUTE_ASSESSMENT_TOOL_NAME,
  PlanRouteAssessmentError,
  PlanRouteAssessmentSchema,
  validatePlanRouteAssessment,
} from "./route.js";
import type {
  PlannerRouteRequest,
  PlanRouteAssessment,
  PlanRouteDecision,
  PlanSubmissionMode,
  PlanSubmissionResult,
} from "./route.js";

interface ActivePlanRequest {
  requestId: string;
  requestText: string;
  mode: PlanSubmissionMode;
  decision?: Readonly<PlanRouteDecision>;
  assessmentBatchInProgress: boolean;
}

export interface PlanToolCallCheck {
  tool: ToolCapability | undefined;
  batchToolNames: readonly string[];
}

export interface BlockedPlanToolCall {
  block: true;
  reason: string;
  terminateBatch?: true;
}

const CREATIVE_ARTIFACT =
  /(?:game|website|web\s?page|app|application|dashboard|interface|ui|logo|poster|illustration|游戏|网站|网页|页面|应用|小程序|看板|仪表盘|界面|徽标|海报|插画)/i;
const CREATION_VERB =
  /(?:create|build|make|design|implement|generate|write|创建|制作|实现|设计|生成|开发|写|做(?:一个|个)?)/i;
const EXISTING_ARTIFACT_CHANGE =
  /(?:fix|repair|modify|update|adjust|improve|optimi[sz]e|refactor|修复|修改|更新|调整|改进|优化|重构)/i;
const EXPLICIT_VISUAL_DIRECTION =
  /(?:visual|style|theme|palette|colou?r|retro|pixel|minimal|neon|brutalist|editorial|match (?:the )?existing|follow (?:the )?(?:existing|current) design|风格|视觉|主题|配色|色彩|复古|像素|极简|霓虹|粗野|编辑感|沿用现有|保持现有|遵循现有|跟随现有|参考图|按照原型)/i;

function isCreativeCreationRequest(requestText: string): boolean {
  if (!CREATIVE_ARTIFACT.test(requestText)) return false;
  if (CREATION_VERB.test(requestText)) return true;
  return requestText.trim().length <= 80
    && !EXISTING_ARTIFACT_CHANGE.test(requestText);
}

function enforceCreativeIntentFloor(
  requestText: string,
  assessment: PlanRouteAssessment,
): PlanRouteAssessment {
  if (
    assessment.intentUncertainty !== 0
    || !isCreativeCreationRequest(requestText)
    || EXPLICIT_VISUAL_DIRECTION.test(requestText)
  ) {
    return assessment;
  }
  return {
    ...assessment,
    intentUncertainty: 1,
    evidence: [
      ...assessment.evidence,
      "Host policy: a user-visible creation request has no explicit visual direction",
    ],
  };
}

function plannerRequest(active: ActivePlanRequest): PlannerRouteRequest {
  if (active.decision?.route !== "plan") {
    throw new Error(`Request ${active.requestId} has not selected Plan Mode`);
  }
  return {
    requestId: active.requestId,
    requestText: active.requestText,
    decision: active.decision,
  };
}

export class PlanExecutionGuard {
  private activeRequest: ActivePlanRequest | undefined;

  get hasActiveRequest(): boolean {
    return this.activeRequest !== undefined;
  }

  get activeRequestId(): string | undefined {
    return this.activeRequest?.requestId;
  }

  get activeDecision(): Readonly<PlanRouteDecision> | undefined {
    return this.activeRequest?.decision;
  }

  beginRequest(
    requestId: string,
    requestText: string,
    mode: PlanSubmissionMode = "auto",
  ): PlanSubmissionResult {
    if (this.activeRequest) {
      throw new Error(`Plan routing is already active for ${this.activeRequest.requestId}`);
    }
    const active: ActivePlanRequest = {
      requestId,
      requestText,
      mode,
      assessmentBatchInProgress: false,
    };
    if (mode === "plan") {
      active.decision = Object.freeze({
        requestId,
        route: "plan",
        source: "explicit",
      });
    }
    this.activeRequest = active;
    return this.result(active);
  }

  submitAssessment(value: unknown): Readonly<PlanRouteDecision> {
    let assessment = validatePlanRouteAssessment(value);
    const active = this.activeRequest;
    if (!active || active.mode !== "auto") {
      throw new PlanRouteAssessmentError("No Auto request is awaiting assessment");
    }
    if (assessment.requestId !== active.requestId) {
      throw new PlanRouteAssessmentError(
        `Assessment request ${assessment.requestId} does not match active request ${active.requestId}`,
      );
    }
    if (active.decision) {
      throw new PlanRouteAssessmentError(
        `Request ${active.requestId} already has a route decision`,
      );
    }
    assessment = enforceCreativeIntentFloor(active.requestText, assessment);
    active.decision = decidePlanRoute(assessment);
    return active.decision;
  }

  checkToolCall(check: PlanToolCallCheck): BlockedPlanToolCall | undefined {
    if (isPlanToolAllowed(check.tool)) return undefined;
    const active = this.activeRequest;
    if (!active) {
      return {
        block: true,
        reason: "Side effect blocked: no active request route assessment",
      };
    }
    if (check.batchToolNames.includes(PLAN_ROUTE_ASSESSMENT_TOOL_NAME)) {
      return {
        block: true,
        reason:
          "Side effect blocked: route assessment and mutation cannot execute in the same tool-call batch; retry in a later turn",
        terminateBatch: true,
      };
    }
    if (active.decision?.route === "direct") return undefined;
    if (active.decision?.route === "plan") {
      return {
        block: true,
        reason: `Side effect blocked: request ${active.requestId} requires Planner execution`,
      };
    }
    return {
      block: true,
      reason:
        `Side effect blocked: submit ${PLAN_ROUTE_ASSESSMENT_TOOL_NAME} for active request ${active.requestId} before retrying`,
    };
  }

  instructions(): string {
    const active = this.activeRequest;
    if (!active || active.mode !== "auto" || active.decision) return "";
    return [
      "# Active Request Routing",
      `Request ID: ${active.requestId}`,
      "Read-only investigation is allowed before routing.",
      `Before the first non-read tool call, call \`${PLAN_ROUTE_ASSESSMENT_TOOL_NAME}\``,
      "with this request ID, all five 0..2 scores, and concise public evidence.",
      "Set intentUncertainty to 1 when a user-visible preference may remain unresolved and to 2 when it clearly changes the user-visible result (for example visual style, scope, compatibility, cost, or reversibility). For creation requests, do not substitute genre conventions or a plausible default for unstated visual direction. Use 0 only when intent is explicit or fixed by established project context.",
      "Do not batch that assessment with a non-read tool call.",
    ].join("\n");
  }

  beginToolBatch(toolNames: readonly string[]): void {
    if (
      this.activeRequest
      && toolNames.includes(PLAN_ROUTE_ASSESSMENT_TOOL_NAME)
    ) {
      this.activeRequest.assessmentBatchInProgress = true;
    }
  }

  completeToolBatch(toolNames: readonly string[]): void {
    if (
      this.activeRequest
      && toolNames.includes(PLAN_ROUTE_ASSESSMENT_TOOL_NAME)
    ) {
      this.activeRequest.assessmentBatchInProgress = false;
    }
  }

  canRunSideEffects(): boolean {
    return this.activeRequest?.decision?.route === "direct"
      && !this.activeRequest.assessmentBatchInProgress;
  }

  endRequest(requestId: string): PlanSubmissionResult {
    const active = this.requireActive(requestId);
    const result = this.result(active);
    this.activeRequest = undefined;
    return result;
  }

  cancelRequest(requestId: string): void {
    if (this.activeRequest?.requestId === requestId) {
      this.activeRequest = undefined;
    }
  }

  cancelActiveRequest(): void {
    this.activeRequest = undefined;
  }

  private result(active: ActivePlanRequest): PlanSubmissionResult {
    return active.decision?.route === "plan"
      ? { kind: "planner_requested", request: plannerRequest(active) }
      : {
          kind: "main",
          requestId: active.requestId,
          decision: active.decision,
        };
  }

  private requireActive(requestId: string): ActivePlanRequest {
    if (this.activeRequest?.requestId !== requestId) {
      throw new Error(`Request ${requestId} is not the active routed request`);
    }
    return this.activeRequest;
  }
}

export function makePlanRouteDriver(guard: PlanExecutionGuard): Driver {
  const tool: AgentTool<typeof PlanRouteAssessmentSchema> = {
    name: PLAN_ROUTE_ASSESSMENT_TOOL_NAME,
    label: "Submit plan route assessment",
    description:
      "Submit the active request's five-dimensional complexity assessment before its first side effect.",
    effect: "unknown",
    planOperation: { domain: "plan", sideEffectFree: true },
    audience: "main",
    executionMode: "sequential",
    parameters: PlanRouteAssessmentSchema,
    execute: async (_id, assessment) => {
      const decision = guard.submitAssessment(assessment);
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            requestId: decision.requestId,
            route: decision.route,
            totalScore: decision.totalScore,
            evidence: decision.assessment?.evidence,
          }),
        }],
        details: {
          decision,
          plannerRequest: decision.route === "plan"
            ? { requestId: decision.requestId, decision }
            : undefined,
        },
        terminate: decision.route === "plan",
      };
    },
  };
  return {
    name: "plan-route",
    description: "Main Agent request routing",
    tools: [tool],
    source: "builtin",
  };
}
