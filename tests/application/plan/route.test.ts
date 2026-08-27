import { describe, expect, it } from "vitest";

import {
  decidePlanRoute,
  makePlanRouteDriver,
  PLAN_ROUTE_ASSESSMENT_TOOL_NAME,
  PlanExecutionGuard,
  PlanRouteAssessmentError,
  validatePlanRouteAssessment,
} from "../../../src/application/plan/index.js";
import type {
  PlanRouteAssessment,
} from "../../../src/application/plan/index.js";
import type { ToolCapability } from "../../../src/drivers/types.js";

function assessment(
  overrides: Partial<PlanRouteAssessment> = {},
): PlanRouteAssessment {
  return {
    requestId: "request-1",
    intentUncertainty: 0,
    solutionDivergence: 0,
    impact: 0,
    risk: 0,
    coordination: 0,
    evidence: ["The requested change is local and reversible"],
    ...overrides,
  };
}

function tool(name: string, effect?: ToolCapability["effect"]): ToolCapability {
  return { name, effect };
}

describe("Plan request routing", () => {
  it("routes a low-complexity assessment directly", () => {
    expect(decidePlanRoute(assessment())).toMatchObject({
      route: "direct",
      totalScore: 0,
    });
  });

  it.each(["intentUncertainty", "impact", "risk", "coordination"] as const)(
    "forces Plan when %s is 2",
    (dimension) => {
      expect(decidePlanRoute(assessment({ [dimension]: 2 }))).toMatchObject({
        route: "plan",
        totalScore: 2,
      });
    },
  );

  it("keeps technical alternatives autonomous when user intent is clear", () => {
    expect(decidePlanRoute(assessment({
      solutionDivergence: 2,
    }))).toMatchObject({ route: "direct", totalScore: 2 });
  });

  it("routes to Plan when the total score reaches four", () => {
    expect(decidePlanRoute(assessment({
      intentUncertainty: 1,
      solutionDivergence: 1,
      impact: 1,
      risk: 1,
    }))).toMatchObject({ route: "plan", totalScore: 4 });
  });

  it("allows read-only investigation before assessment", () => {
    const guard = new PlanExecutionGuard();
    guard.beginRequest("request-1", "Inspect the repository", "auto");

    expect(guard.checkToolCall({
      tool: tool("read_file", "read"),
      batchToolNames: ["read_file"],
    })).toBeUndefined();
  });

  it("blocks mutation until an assessment is active", () => {
    const guard = new PlanExecutionGuard();
    guard.beginRequest("request-1", "Change a file", "auto");

    expect(guard.checkToolCall({
      tool: tool("write_file", "workspace_write"),
      batchToolNames: ["write_file"],
    })).toMatchObject({
      block: true,
      reason: expect.stringContaining(PLAN_ROUTE_ASSESSMENT_TOOL_NAME),
    });
  });

  it("blocks mutation in the assessment tool-call batch", () => {
    const guard = new PlanExecutionGuard();
    guard.beginRequest("request-1", "Change a file", "auto");
    guard.submitAssessment(assessment());

    expect(guard.checkToolCall({
      tool: tool("write_file", "workspace_write"),
      batchToolNames: [
        PLAN_ROUTE_ASSESSMENT_TOOL_NAME,
        "write_file",
      ],
    })).toMatchObject({
      block: true,
      reason: expect.stringContaining("same tool-call batch"),
    });
    expect(guard.checkToolCall({
      tool: tool("write_file", "workspace_write"),
      batchToolNames: ["write_file"],
    })).toBeUndefined();
  });

  it("keeps mutations gated after a Plan route", () => {
    const guard = new PlanExecutionGuard();
    guard.beginRequest("request-1", "Coordinate a migration", "auto");
    guard.submitAssessment(assessment({ coordination: 2 }));

    expect(guard.checkToolCall({
      tool: tool("bash", "process"),
      batchToolNames: ["bash"],
    })).toMatchObject({
      block: true,
      reason: expect.stringContaining("requires Planner execution"),
    });
  });

  it("rejects malformed and mismatched assessments", () => {
    expect(() => validatePlanRouteAssessment({
      ...assessment(),
      risk: 3,
    })).toThrow(PlanRouteAssessmentError);

    const guard = new PlanExecutionGuard();
    guard.beginRequest("request-1", "Change a file", "auto");
    expect(() => guard.submitAssessment(assessment({
      requestId: "request-other",
    }))).toThrow("does not match active request");
    expect(guard.checkToolCall({
      tool: tool("write_file", "workspace_write"),
      batchToolNames: ["write_file"],
    })).toMatchObject({ block: true });
  });

  it("exposes a structured Main Agent assessment tool", async () => {
    const guard = new PlanExecutionGuard();
    guard.beginRequest("request-1", "Change a file", "auto");
    const [routeTool] = makePlanRouteDriver(guard).tools;

    const result = await routeTool.execute("tool-1", assessment({
      impact: 2,
    }));

    expect(routeTool).toMatchObject({
      effect: "unknown",
      audience: "main",
      planOperation: { domain: "plan", sideEffectFree: true },
    });
    expect(result.details).toMatchObject({
      decision: { requestId: "request-1", route: "plan" },
      plannerRequest: { requestId: "request-1" },
    });
  });

  it("bypasses Auto assessment for explicit Plan submissions", () => {
    const guard = new PlanExecutionGuard();

    const started = guard.beginRequest(
      "request-1",
      "Plan this migration",
      "plan",
    );

    expect(started).toEqual({
      kind: "planner_requested",
      request: {
        requestId: "request-1",
        requestText: "Plan this migration",
        decision: {
          requestId: "request-1",
          route: "plan",
          source: "explicit",
        },
      },
    });
    expect(() => guard.submitAssessment(assessment())).toThrow(
      "No Auto request is awaiting assessment",
    );
  });
});
