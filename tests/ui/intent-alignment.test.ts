import { createElement } from "../../web/node_modules/react/index.js";
import { renderToStaticMarkup } from "../../web/node_modules/react-dom/server.node.js";
import { describe, expect, it, vi } from "vitest";

import {
  EMPTY_PLAN_VIEW_STATE,
  planViewReducer,
} from "../../src/ui/shared/plan-reducer.js";
import { projectPublicPlan } from "../../src/ui/shared/plan-projection.js";
import type { PlanCandidate } from "../../src/application/plan/index.js";
import {
  ChatView,
  ExecutionEpisodeStatus,
  PlanTodoList,
  PublicPlanDisclosure,
  waitingElapsedMs,
} from "../../web/src/components/ChatView.js";
import { IntentAlignment } from "../../web/src/components/IntentAlignment.js";
import {
  buildIntentAlignmentCommand,
  sendIntentAlignment,
} from "../../web/src/utils/intentAlignment.js";
import {
  makePlan,
  makeEpisode,
  makeTaskState,
  pendingPlan,
} from "./plan-protocol-fixture.js";

function candidate(
  optionId: string,
  summary: string,
  recommended = false,
): PlanCandidate {
  return {
    optionId,
    summary,
    affectedScopes: [],
    evidence: [],
    risks: [],
    cost: "low",
    reversibility: "reversible",
    constraintFit: "uncertain",
    recommended,
    rationale: summary,
  };
}

function alignmentState() {
  const plan = pendingPlan();
  const interaction = plan.pendingInteraction;
  if (interaction?.kind !== "decision") throw new Error("decision missing");
  interaction.payload.prompt = "你希望它看起来是什么风格？";
  plan.decisions[0].question = interaction.payload.prompt;
  plan.decisions[0].candidates = [
    candidate("retro", "复古街机像素风", true),
    candidate("minimal", "现代极简"),
    candidate("neon", "霓虹街机"),
  ];
  return planViewReducer(EMPTY_PLAN_VIEW_STATE, {
    type: "plan_state",
    plan,
  });
}

function authorizedPlan() {
  return makePlan({
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
}

describe("Web Chat intent alignment", () => {
  it("keeps the Planning wait timer advancing after Session time stops", () => {
    expect(waitingElapsedMs(40_000, 40_000, 1_000, 4_500)).toBe(43_500);
    expect(waitingElapsedMs(47_000, 40_000, 1_000, 4_500)).toBe(47_000);
  });

  it("renders one concise inline choice with recommendation and custom input", () => {
    const state = alignmentState();
    if (!state.interaction) throw new Error("alignment missing");
    const markup = renderToStaticMarkup(createElement(IntentAlignment, {
      request: state.interaction.request,
      connected: true,
      conflicted: false,
      onSubmit: vi.fn(() => true),
    }));

    expect(markup).toContain("你希望它看起来是什么风格？");
    expect(markup).toContain("复古街机像素风");
    expect(markup).toContain("现代极简");
    expect(markup).toContain("霓虹街机");
    expect(markup).toContain("推荐");
    expect(markup).toContain('aria-label="自定义方向"');
    expect(markup).toContain("采用此方向");
    expect(markup).not.toMatch(/revision|digest|PlanItem|候选树|执行清单|审批/);
  });

  it("builds typed selected and custom constraints without chat text", () => {
    const state = alignmentState();

    expect(buildIntentAlignmentCommand(
      state,
      "session-1",
      { kind: "select", optionId: "retro" },
      "select-1",
    )).toMatchObject({
      type: "plan_decision",
      sessionId: "session-1",
      planId: "plan-1",
      expectedVersion: 3,
      commandId: "select-1",
      interactionId: "interaction-1",
      action: {
        kind: "select",
        decisionNodeId: "decision-1",
        optionId: "retro",
      },
    });
    expect(buildIntentAlignmentCommand(
      state,
      "session-1",
      { kind: "custom", text: "  水墨留白风格  " },
      "custom-1",
    )).toMatchObject({
      type: "plan_decision",
      commandId: "custom-1",
      action: {
        kind: "update_constraints",
        constraints: [{
          kind: "set",
          constraint: {
            constraintId: "alignment:interaction-1",
            description: "水墨留白风格",
            source: "user",
          },
        }],
      },
    });
    expect(buildIntentAlignmentCommand(
      state,
      "session-2",
      { kind: "select", optionId: "retro" },
    )).toBeNull();
  });

  it("allows the same alignment to retry after transport rejection", () => {
    const state = alignmentState();
    const send = vi.fn()
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);
    const answer = { kind: "select", optionId: "retro" } as const;

    expect(sendIntentAlignment(state, "session-1", answer, send)).toBe(false);
    expect(sendIntentAlignment(state, "session-1", answer, send)).toBe(true);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("keeps alignment and existing permission UI in the Chat flow", () => {
    const state = alignmentState();
    if (!state.interaction) throw new Error("alignment missing");
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const markup = renderToStaticMarkup(createElement(ChatView, {
      messages: [],
      processing: true,
      hasStreaming: false,
      sessionActiveMs: 0,
      permissionPrompt: {
        toolName: "write_file",
        preview: "src/game.ts",
      },
      onPermission: vi.fn(),
      planInteraction: state.interaction,
      onIntentAlignment: vi.fn(() => true),
    }));
    consoleError.mockRestore();

    expect(markup).toContain("intent-alignment");
    expect(markup).toContain("Permission Required");
    expect(markup).not.toContain("Waiting...");
    expect(markup).not.toContain("规划工作台");
  });

  it("renders the Planning Mode handoff as a timeline marker", () => {
    const markup = renderToStaticMarkup(createElement(ChatView, {
      messages: [{
        id: "planning-mode-planner-1",
        role: "system",
        content: "进入 Planning Mode",
      }],
      processing: true,
      processingText: "正在规划下一步...",
      hasStreaming: false,
      sessionActiveMs: 0,
      permissionPrompt: null,
      onPermission: vi.fn(),
    }));

    expect(markup).toContain("进入 Planning Mode");
    expect(markup).toContain("正在规划下一步...");
    expect(markup).toContain('role="status"');
  });

  it("renders persisted TaskState as a live TODO list", () => {
    const taskState = makeTaskState({
      todoList: [{
        todoId: "outcome-1",
        title: "Playable result",
        status: "in_progress",
      }, {
        todoId: "outcome-2",
        title: "Accessible controls",
        status: "pending",
      }],
    });

    const markup = renderToStaticMarkup(createElement(PlanTodoList, {
      taskState,
    }));

    expect(markup).toContain("TODO");
    expect(markup).toContain("执行中 · 0/2");
    expect(markup).toContain("Playable result");
    expect(markup).toContain("Accessible controls");
    expect(markup).toContain("待执行");
    expect(markup).not.toContain("plan_start_item");
  });

  it("renders paused execution as unverified with explicit recovery actions", () => {
    const markup = renderToStaticMarkup(createElement(ExecutionEpisodeStatus, {
      episode: makeEpisode(),
      taskState: makeTaskState({
        todoList: [{
          todoId: "done",
          title: "Core result",
          status: "completed",
          result: "Verified",
        }, {
          todoId: "pending",
          title: "Mobile controls",
          status: "in_progress",
        }],
      }),
      connected: true,
      pending: false,
      onRecover: vi.fn(() => true),
    }));

    expect(markup).toContain("自动执行已暂停");
    expect(markup).toContain("未验证");
    expect(markup).toContain("已完成 1/2 项");
    expect(markup).toContain("调整方案");
    expect(markup).toContain("继续执行");
    expect(markup).toContain('aria-label="自动执行已暂停"');
    expect(markup).not.toMatch(/失败|已完成 2\/2/);
  });

  it("places the Plan result before the Act TODO", () => {
    const plan = authorizedPlan();
    const publicPlan = projectPublicPlan(plan);
    if (!publicPlan) throw new Error("public Plan missing");

    const markup = renderToStaticMarkup(createElement(ChatView, {
      messages: [{
        id: "planning-mode-planner-1",
        role: "system",
        content: "进入 Planning Mode",
      }, {
        id: `plan-ready-${plan.planId}`,
        role: "system",
        content: "计划已生成",
      }],
      processing: false,
      hasStreaming: false,
      sessionActiveMs: 0,
      permissionPrompt: null,
      onPermission: vi.fn(),
      presentationPlan: plan,
      publicPlan,
      taskState: makeTaskState(),
    }));

    expect(markup.indexOf("进入 Planning Mode"))
      .toBeLessThan(markup.indexOf("计划已生成"));
    expect(markup.indexOf("计划已生成"))
      .toBeLessThan(markup.indexOf('aria-label="执行计划"'));
    expect(markup.indexOf('aria-label="执行计划"'))
      .toBeLessThan(markup.indexOf('aria-label="TODO 执行清单"'));
    expect(markup).toContain("执行中 · 0/1");
  });

  it("renders one collapsed public Plan and one live TODO after later messages", () => {
    const plan = authorizedPlan();
    plan.status = "executing";
    const publicPlan = projectPublicPlan(plan);
    if (!publicPlan) throw new Error("public Plan missing");

    const markup = renderToStaticMarkup(createElement(ChatView, {
      messages: [{
        id: `plan-ready-${plan.planId}`,
        role: "system",
        content: "计划已生成",
      }, {
        id: "assistant-execution",
        role: "assistant",
        content: "正在实现第一个任务",
      }],
      processing: false,
      hasStreaming: false,
      sessionActiveMs: 0,
      permissionPrompt: null,
      onPermission: vi.fn(),
      presentationPlan: plan,
      publicPlan,
      taskState: makeTaskState({
        todoList: [{
          todoId: "outcome-1",
          title: "Playable result",
          status: "in_progress",
        }],
      }),
    }));

    expect(markup.indexOf("正在实现第一个任务"))
      .toBeLessThan(markup.indexOf('aria-label="执行计划"'));
    expect(markup.indexOf('aria-label="执行计划"'))
      .toBeLessThan(markup.indexOf('aria-label="TODO 执行清单"'));
    expect(markup.match(/aria-label="执行计划"/g)).toHaveLength(1);
    expect(markup.match(/aria-label="TODO 执行清单"/g)).toHaveLength(1);
    expect(markup).toContain("<details");
    expect(markup).not.toContain("<details open");
  });

  it("renders TaskState results and structured external blockers", () => {
    const taskState = makeTaskState({
      status: "blocked",
      todoList: [{
        todoId: "outcome-1",
        title: "Playable result",
        status: "completed",
        result: "Game launches and accepts keyboard input",
      }, {
        todoId: "outcome-2",
        title: "Published demo",
        status: "blocked",
        blocker: {
          kind: "permission",
          reason: "Deployment permission is required",
          recovery: "Grant publish access",
        },
      }],
    });
    const markup = renderToStaticMarkup(createElement(PlanTodoList, {
      taskState,
    }));

    expect(markup).toContain("Game launches and accepts keyboard input");
    expect(markup).toContain("Deployment permission is required");
    expect(markup).toContain("Grant publish access");
    expect(markup).toContain("受阻 · 1/2");
  });

  it("renders Direct TaskState without a Plan", () => {
    const markup = renderToStaticMarkup(createElement(ChatView, {
      messages: [],
      processing: false,
      hasStreaming: false,
      sessionActiveMs: 0,
      permissionPrompt: null,
      onPermission: vi.fn(),
      taskState: makeTaskState(),
    }));

    expect(markup).toContain('aria-label="TODO 执行清单"');
    expect(markup).not.toContain('aria-label="执行计划"');
  });

  it("renders the expanded Plan sections without internal fields", () => {
    const plan = authorizedPlan();
    plan.goal = "交付公开执行计划";
    plan.constraints.push({
      constraintId: "constraint-secret",
      kind: "hard",
      description: "保持兼容",
      source: "user",
    });
    plan.decisions[0].status = "selected";
    plan.decisions[0].selectedOptionId = plan.decisions[0].candidates[0].optionId;
    plan.sideEffectSummary = "仅修改 Web Chat";
    const publicPlan = projectPublicPlan(plan);
    if (!publicPlan) throw new Error("public Plan missing");

    const markup = renderToStaticMarkup(createElement(PublicPlanDisclosure, {
      plan: publicPlan,
    }));

    for (const text of [
      "目标",
      "约束",
      "确定方案",
      "范围",
      "执行步骤",
      "验证",
      "交付公开执行计划",
      "保持兼容",
      "仅修改 Web Chat",
    ]) {
      expect(markup).toContain(text);
    }
    expect(markup).toContain("min-width:0");
    expect(markup).toContain("overflow-wrap:anywhere");
    expect(markup).not.toMatch(
      /constraint-secret|revision|digest|effectGrants|evidence|rationale/,
    );
  });

  it("shows Waiting between a completed visible response and Planner spawn", () => {
    const markup = renderToStaticMarkup(createElement(ChatView, {
      messages: [{
        id: "assistant-1",
        role: "assistant",
        content: "",
        thinking: "Routing is complete.",
        isStreaming: true,
      }],
      processing: true,
      processingText: "Waiting...",
      hasStreaming: true,
      sessionActiveMs: 40_000,
      permissionPrompt: null,
      onPermission: vi.fn(),
    }));

    expect(markup).toContain("Waiting...");
    expect(markup).not.toContain('<span class="phase-text">Response</span>');
  });
});
