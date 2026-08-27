import { Type } from "@earendil-works/pi-ai";
import { Value } from "typebox/value";

export const PLAN_ROUTE_ASSESSMENT_TOOL_NAME = "submit_plan_route_assessment";

export type PlanSubmissionMode = "auto" | "plan";
export type PlanRoute = "direct" | "plan";
export type PlanRouteScore = 0 | 1 | 2;

export interface PlanRouteAssessment {
  requestId: string;
  intentUncertainty: PlanRouteScore;
  solutionDivergence: PlanRouteScore;
  impact: PlanRouteScore;
  risk: PlanRouteScore;
  coordination: PlanRouteScore;
  evidence: string[];
}

export interface PlanRouteDecision {
  requestId: string;
  route: PlanRoute;
  source: "assessment" | "explicit";
  totalScore?: number;
  assessment?: Readonly<PlanRouteAssessment>;
}

export interface PlannerRouteRequest {
  requestId: string;
  requestText: string;
  decision: Readonly<PlanRouteDecision>;
}

export type PlanSubmissionResult =
  | {
      kind: "main";
      requestId: string;
      decision?: Readonly<PlanRouteDecision>;
    }
  | {
      kind: "planner_requested";
      request: Readonly<PlannerRouteRequest>;
    };

const SCORE = Type.Integer({ minimum: 0, maximum: 2 });
const INTENT_UNCERTAINTY_SCORE = Type.Integer({
  minimum: 0,
  maximum: 2,
  description:
    "0 only when user-visible intent is explicit or fixed by established project context; 1 when a user-visible preference may remain unresolved; 2 when a missing user-value judgment such as visual style, scope, compatibility, cost, or reversibility clearly requires alignment before side effects. Never treat genre conventions or a plausible default as user intent",
});

export const PlanRouteAssessmentSchema = Type.Object({
  requestId: Type.String({ minLength: 1, maxLength: 200 }),
  intentUncertainty: INTENT_UNCERTAINTY_SCORE,
  solutionDivergence: SCORE,
  impact: SCORE,
  risk: SCORE,
  coordination: SCORE,
  evidence: Type.Array(Type.String({ minLength: 1, maxLength: 500 }), {
    minItems: 1,
    maxItems: 10,
  }),
}, { additionalProperties: false });

export class PlanRouteAssessmentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlanRouteAssessmentError";
  }
}

export function validatePlanRouteAssessment(
  value: unknown,
): PlanRouteAssessment {
  if (!Value.Check(PlanRouteAssessmentSchema, value)) {
    throw new PlanRouteAssessmentError(
      "Plan route assessment must contain the active request ID, five scores from 0 to 2, and evidence",
    );
  }
  return structuredClone(value) as PlanRouteAssessment;
}

export function decidePlanRoute(
  assessment: PlanRouteAssessment,
): Readonly<PlanRouteDecision> {
  const totalScore = assessment.intentUncertainty
    + assessment.solutionDivergence
    + assessment.impact
    + assessment.risk
    + assessment.coordination;
  const route = assessment.intentUncertainty >= 1
    || assessment.impact === 2
    || assessment.risk === 2
    || assessment.coordination === 2
    || totalScore >= 4
    ? "plan"
    : "direct";
  return Object.freeze({
    requestId: assessment.requestId,
    route,
    source: "assessment",
    totalScore,
    assessment: Object.freeze({
      ...assessment,
      evidence: Object.freeze([...assessment.evidence]) as string[],
    }),
  });
}
