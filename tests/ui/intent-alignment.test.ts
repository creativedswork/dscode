import { createElement } from "../../web/node_modules/react/index.js";
import { renderToStaticMarkup } from "../../web/node_modules/react-dom/server.node.js";
import { describe, expect, it, vi } from "vitest";

import {
  EMPTY_PLAN_VIEW_STATE,
  planViewReducer,
} from "../../src/ui/shared/plan-reducer.js";
import type { PlanCandidate } from "../../src/application/plan/index.js";
import { ChatView } from "../../web/src/components/ChatView.js";
import { IntentAlignment } from "../../web/src/components/IntentAlignment.js";
import {
  buildIntentAlignmentCommand,
} from "../../web/src/utils/intentAlignment.js";
import { pendingPlan } from "./plan-protocol-fixture.js";

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

describe("Web Chat intent alignment", () => {
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
});
