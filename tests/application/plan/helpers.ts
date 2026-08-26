import type {
  NewPlanRecord,
  PlanRecord,
} from "../../../src/application/plan/index.js";

export function makePlanInput(planId = "plan-1"): NewPlanRecord {
  return {
    planId,
    sessionId: "session-1",
    mainAgentId: "main-1",
    plannerAgentId: "planner-1",
    request: {
      requestId: "request-1",
      text: "Implement the approved change",
      submittedAt: 10,
    },
    status: "drafting",
    goal: "Implement a durable Plan store",
    constraints: [{
      constraintId: "constraint-1",
      kind: "hard",
      description: "Do not lose committed records",
      source: "user",
    }],
    decisions: [{
      decisionNodeId: "decision-1",
      question: "Which persistence format should be used?",
      status: "selected",
      selectedOptionId: "json",
      candidates: [{
        optionId: "json",
        summary: "Use atomic JSON snapshots",
        affectedScopes: ["plan-store"],
        evidence: [{
          kind: "file",
          referenceId: "evidence-1",
          path: "src/agents/process/store.ts",
          description: "Existing project-scoped snapshot pattern",
        }],
        risks: ["Concurrent writers"],
        cost: "low",
        reversibility: "reversible",
        constraintFit: "satisfies",
        recommended: true,
        rationale: "Uses the existing runtime storage model",
      }],
    }],
    items: [{
      itemId: "item-1",
      order: 0,
      title: "Write snapshot",
      description: "Persist the Plan atomically",
      dependsOn: [],
      status: "pending",
      acceptanceCriteria: [{
        kind: "command",
        criterionId: "criterion-1",
        command: "npm test",
        expectedExitCode: 0,
        expectedOutput: "passed",
      }],
      effectGrants: [{
        effect: "workspace_write",
        resourceScopes: [{
          kind: "workspace_path",
          pattern: "src/application/plan/**",
        }],
      }],
      evidence: [],
    }],
    sideEffectSummary: "Writes Plan snapshots inside the dscode data directory",
    trajectoryEvents: [],
  };
}

export function expectCreated(
  result: Awaited<ReturnType<import(
    "../../../src/application/plan/store.js"
  ).PlanStore["create"]>>,
): Readonly<PlanRecord> {
  if (!result.ok) throw new Error("Expected Plan creation to succeed");
  return result.plan;
}
