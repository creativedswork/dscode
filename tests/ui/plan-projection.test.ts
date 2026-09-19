import { describe, expect, it } from "vitest";

import { projectPublicPlan } from "../../src/ui/shared/plan-projection.js";
import { makePlan } from "./plan-protocol-fixture.js";

function authorizedPlan() {
  const plan = makePlan({
    status: "approved",
    approval: {
      revision: 2,
      digest: "a".repeat(64),
      approvedEffects: ["workspace_write"],
      acknowledgedSideEffects: [],
      interactionId: "internal:planner-1",
      approvedAt: 10,
    },
  });
  plan.constraints.push(
    {
      constraintId: "user-constraint",
      kind: "hard",
      description: "  保持现有接口兼容  ",
      source: "user",
    },
    {
      constraintId: "evidence-constraint",
      kind: "hard",
      description: "内部证据约束",
      source: "evidence",
    },
  );
  plan.decisions = [{
    decisionNodeId: "decision-secret",
    question: "内部问题",
    status: "selected",
    selectedOptionId: "selected-secret",
    candidates: [{
      optionId: "selected-secret",
      summary: "复用现有共享投影",
      affectedScopes: ["Web Chat", "共享状态"],
      evidence: [{
        kind: "file",
        referenceId: "evidence-secret",
        path: "secret.ts",
        description: "内部证据",
      }],
      risks: ["内部风险"],
      cost: "low",
      reversibility: "reversible",
      constraintFit: "satisfies",
      recommended: true,
      rationale: "隐藏理由",
    }, {
      optionId: "alternative-secret",
      summary: "不应展示的备选方案",
      affectedScopes: ["隐藏范围"],
      evidence: [],
      risks: [],
      cost: "high",
      reversibility: "partial",
      constraintFit: "satisfies",
      recommended: false,
      rationale: "隐藏备选理由",
    }],
  }];
  if (plan.schemaVersion !== 2) throw new Error("Expected schema v2");
  plan.executionSteps = [{
    ...plan.executionSteps[0],
    stepId: "item-secret-2",
    order: 2,
    title: "第二步",
    description: "完成验证",
    verifications: [{
      kind: "observable",
      verificationId: "criterion-secret-2",
      description: "页面只显示一个计划和一个 TODO",
      toolName: "read_file",
    }],
  }, {
    ...plan.executionSteps[0],
    stepId: "item-secret-1",
    order: 1,
    title: "第一步",
    description: "生成公开投影",
    verifications: [{
      kind: "command",
      verificationId: "criterion-secret-1",
      description: "类型检查通过",
      command: "npm run typecheck",
      expect: {
        exitCode: 0,
        stdout: { matcher: "contains", value: "Done" },
      },
    }],
  }];
  plan.execution.steps = plan.executionSteps.map((step) => ({
    stepId: step.stepId,
    status: "pending",
    evidence: [],
  }));
  plan.sideEffectSummary = "仅修改共享投影和 Web Chat";
  return plan;
}

describe("public Plan projection", () => {
  it("projects only authorized user-readable fields in item order", () => {
    const projection = projectPublicPlan(authorizedPlan());

    expect(projection).toEqual({
      status: "approved",
      goal: "Implement a durable Plan store",
      committedConstraints: [
        "Do not lose committed records",
        "保持现有接口兼容",
      ],
      selectedDecisionSummaries: ["复用现有共享投影"],
      scope: ["Web Chat", "共享状态"],
      sideEffectSummary: "仅修改共享投影和 Web Chat",
      steps: [
        { title: "第一步", description: "生成公开投影" },
        { title: "第二步", description: "完成验证" },
      ],
      verificationApproach: [
        "类型检查通过，运行 npm run typecheck，预期退出码 0，输出包含 Done",
        "页面只显示一个计划和一个 TODO",
      ],
    });

    expect(JSON.stringify(projection)).not.toMatch(
      /secret|revision|digest|grant|evidence|rationale|备选方案|内部风险/,
    );
  });

  it("rejects missing, stale, or drafting authorization", () => {
    const plan = authorizedPlan();

    expect(projectPublicPlan({ ...plan, approval: undefined })).toBeNull();
    expect(projectPublicPlan({
      ...plan,
      approval: { ...plan.approval!, revision: plan.revision - 1 },
    })).toBeNull();
    expect(projectPublicPlan({
      ...plan,
      approval: { ...plan.approval!, digest: "b".repeat(64) },
    })).toBeNull();
    expect(projectPublicPlan({ ...plan, status: "drafting" })).toBeNull();
  });

  it("scrubs internal identifiers and schema terms embedded in public summaries", () => {
    const plan = authorizedPlan();
    plan.decisions[0].candidates[0].summary =
      "option-secret 使用 effectGrants 和 sideEffectSummary";
    plan.decisions[0].candidates[0].optionId = "option-secret";
    plan.decisions[0].selectedOptionId = "option-secret";
    plan.decisions[0].candidates[0].affectedScopes = [
      "criterion-secret-1",
      "Web Chat",
    ];
    if (plan.schemaVersion !== 2) throw new Error("Expected schema v2");
    plan.executionSteps[1].description =
      `${plan.planId} revision 通过 evidence 验证`;

    const projection = projectPublicPlan(plan);

    expect(projection?.selectedDecisionSummaries).toEqual([
      "使用 授权范围 和 影响说明",
    ]);
    expect(projection?.scope).toEqual(["Web Chat"]);
    expect(projection?.steps[0].description).toBe(
      "版本 通过 验证依据 验证",
    );
    const visibleText = projection && [
      projection.goal,
      ...projection.committedConstraints,
      ...projection.selectedDecisionSummaries,
      ...projection.scope,
      projection.sideEffectSummary,
      ...projection.steps.flatMap((step) => [step.title, step.description]),
      ...projection.verificationApproach,
    ].join(" ");
    expect(visibleText).not.toMatch(
      /option-secret|criterion-secret-1|plan-1|effectGrants|sideEffectSummary|revision|digest|evidence/,
    );
  });

  it("preserves user-readable values that also serve as semantic references", () => {
    const plan = authorizedPlan();
    plan.decisions[0].candidates[0].optionId = "neon-cyberpunk";
    plan.decisions[0].selectedOptionId = "neon-cyberpunk";
    plan.decisions[0].candidates[0].summary = "采用 neon-cyberpunk 风格";
    plan.decisions[0].candidates[0].affectedScopes = ["tetris.html"];
    plan.decisions[0].candidates[0].evidence = [{
      kind: "file",
      referenceId: "tetris.html",
      path: "tetris.html",
      description: "交付文件",
    }];

    const projection = projectPublicPlan(plan);

    expect(projection?.selectedDecisionSummaries).toEqual([
      "采用 neon-cyberpunk 风格",
    ]);
    expect(projection?.scope).toEqual(["tetris.html"]);
  });
});
