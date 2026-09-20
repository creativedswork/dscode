import { visibleWidth } from "@earendil-works/pi-tui";
import { describe, expect, it, vi } from "vitest";
import type { TaskState } from "../../src/agents/process/task-state.js";
import type { PlanCandidate, PlanRecord } from "../../src/application/plan/index.js";
import { EMPTY_PLAN_VIEW_STATE } from "../../src/ui/shared/plan-reducer.js";
import { TuiApp } from "../../src/ui/tui/app.js";
import { ConversationView } from "../../src/ui/tui/conversation.js";
import { buildTuiPlanDecisionCommand } from "../../src/ui/tui/plan-decision.js";
import {
  EMPTY_TUI_PLAN_STATE,
  reduceTuiPlanState,
  TuiPlanView,
  type TuiPlanState,
} from "../../src/ui/tui/plan-view.js";
import {
  makePlan,
  makeEpisode,
  makeTaskState,
  pendingPlan,
} from "./plan-protocol-fixture.js";

function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, "");
}
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

function alignmentPlan(): PlanRecord {
  const plan = pendingPlan();
  if (plan.pendingInteraction?.kind !== "decision") {
    throw new Error("decision interaction missing");
  }
  plan.pendingInteraction.payload.candidateIds = ["retro", "minimal", "neon"];
  plan.decisions[0].candidates = [
    candidate("retro", "复古街机"),
    candidate("minimal", "现代极简", true),
    candidate("neon", "霓虹夜景"),
  ];
  return plan;
}

function authorizedPlan(overrides: Partial<PlanRecord> = {}): PlanRecord {
  return makePlan({
    status: "approved",
    approval: {
      revision: 2,
      digest: "a".repeat(64),
      approvedEffects: [],
      acknowledgedSideEffects: [],
      interactionId: "internal:planner-1",
      approvedAt: 10,
    },
    ...overrides,
  });
}

function stateFor(
  plan: PlanRecord,
  taskState?: TaskState,
): TuiPlanState {
  const planned = reduceTuiPlanState(EMPTY_TUI_PLAN_STATE, {
    type: "server",
    event: { type: "plan_state", plan },
  });
  return taskState
    ? reduceTuiPlanState(planned, {
      type: "server",
      event: {
        type: "task_state",
        sessionId: taskState.sessionId,
        taskState,
      },
    })
    : planned;
}

describe("TUI Plan interaction", () => {
  it("selects the recommendation and builds typed select/custom commands", () => {
    const state = stateFor(alignmentPlan());

    expect(state).toMatchObject({
      focus: "alignment",
      selectedIndex: 1,
    });
    expect(buildTuiPlanDecisionCommand(
      state,
      "session-1",
      { kind: "select", optionId: "minimal" },
      "command-select",
    )).toMatchObject({
      planId: "plan-1",
      expectedVersion: 3,
      commandId: "command-select",
      interactionId: "interaction-1",
      action: {
        kind: "select",
        decisionNodeId: "decision-1",
        optionId: "minimal",
      },
    });
    expect(buildTuiPlanDecisionCommand(
      state,
      "session-1",
      { kind: "custom", text: "  水墨留白  " },
      "command-custom",
    )).toMatchObject({
      action: {
        kind: "update_constraints",
        constraints: [{
          constraint: {
            constraintId: "alignment:interaction-1",
            description: "水墨留白",
            source: "user",
          },
        }],
      },
    });
    expect(buildTuiPlanDecisionCommand(
      state,
      "session-2",
      { kind: "select", optionId: "minimal" },
      "stale-session",
    )).toBeNull();
  });

  it("handles arrows, Enter, custom focus, and Escape through TUI key bytes", () => {
    const handleInput = TuiApp.prototype["handleInput"] as (
      this: any,
      data: string,
    ) => boolean;
    const applyPlanAction = TuiApp.prototype["applyPlanAction"];
    const syncEditorSubmitState = TuiApp.prototype["syncEditorSubmitState"];
    const submitPlanAnswer = vi.fn().mockResolvedValue(true);
    const focusEditor = vi.fn();
    const state: any = {
      planState: stateFor(alignmentPlan()),
      handlePlanInput: TuiApp.prototype["handlePlanInput"],
      processing: true,
      permissionExplainMode: false,
      editor: { disableSubmit: true },
      conversation: { setPlanState: vi.fn() },
      applyPlanAction,
      syncEditorSubmitState,
      submitPlanAnswer,
      focusEditor,
      resolvePermission: null,
      mcpPanelVisible: false,
      activityInspectorOverlay: null,
    };

    expect(handleInput.call(state, "\x1b[B")).toBe(true);
    expect(state.planState.selectedIndex).toBe(2);
    expect(handleInput.call(state, "\r")).toBe(true);
    expect(submitPlanAnswer).toHaveBeenCalledWith({
      kind: "select",
      optionId: "neon",
    });

    state.planState = {
      ...state.planState,
      selectedIndex: 3,
      submitting: false,
    };
    expect(handleInput.call(state, "\r")).toBe(true);
    expect(state.planState.focus).toBe("custom");
    expect(state.editor.disableSubmit).toBe(false);

    expect(handleInput.call(state, "\x1b")).toBe(true);
    expect(state.planState.focus).toBe("alignment");
    expect(handleInput.call(state, "\x1b")).toBe(true);
    expect(state.planState.focus).toBeNull();
    expect(focusEditor).toHaveBeenCalledOnce();

    state.planState = stateFor(authorizedPlan());
    expect(handleInput.call(state, "\r")).toBe(true);
    expect(state.planState.expanded).toBe(true);
    expect(handleInput.call(state, "\x1b")).toBe(true);
    expect(state.planState.focus).toBeNull();
  });

  it("routes task_state through the application Plan/Task projection", () => {
    const taskState = makeTaskState();
    const setPlanState = vi.fn();
    const state: any = {
      planState: EMPTY_TUI_PLAN_STATE,
      conversation: {
        setPlanState,
        applyConversationEvent: vi.fn(),
      },
      applyPlanAction: TuiApp.prototype["applyPlanAction"],
      syncEditorSubmitState: vi.fn(),
    };

    TuiApp.prototype.applyConversationEvent.call(state, {
      type: "task_state",
      sessionId: taskState.sessionId,
      taskState,
    });

    expect(state.planState.task).toEqual({
      sessionId: taskState.sessionId,
      taskState,
    });
    expect(setPlanState).toHaveBeenCalledWith(state.planState);
    expect(state.conversation.applyConversationEvent).not.toHaveBeenCalled();
  });

  it("submits free text as a Plan decision instead of a Chat message", async () => {
    const handleSubmit = TuiApp.prototype["handleSubmit"] as (
      this: any,
      text: string,
    ) => Promise<void>;
    const submitPlanAnswer = vi.fn().mockResolvedValue(true);
    const state = {
      planState: {
        ...stateFor(alignmentPlan()),
        focus: "custom",
      },
      editor: {
        addToHistory: vi.fn(),
        setText: vi.fn(),
      },
      submitPlanAnswer,
    };

    await handleSubmit.call(state, "  使用低饱和纸张质感  ");

    expect(submitPlanAnswer).toHaveBeenCalledWith({
      kind: "custom",
      text: "使用低饱和纸张质感",
    });
    expect(state.editor.setText).toHaveBeenCalledWith("");
  });

  it("renders one collapsed Plan before one TODO and expands within narrow widths", () => {
    const plan = authorizedPlan();
    plan.goal = "交付一个可验证的终端交互";
    if (plan.schemaVersion !== 2) throw new Error("Expected schema v2");
    plan.executionSteps.push({
      ...plan.executionSteps[0],
      stepId: "item-2",
      order: 1,
      title: "验证终端在很窄窗口中不会溢出",
    });
    plan.execution.steps.push({
      stepId: "item-2",
      status: "pending",
      evidence: [],
    });
    const taskState = makeTaskState({
      todoList: [{
        todoId: "outcome-1",
        title: "可操作的终端体验",
        status: "in_progress",
      }],
    });
    let state = stateFor(plan, taskState);
    const view = new TuiPlanView(state);
    const collapsed = view.render(24);
    const plain = stripAnsi(collapsed.join("\n"));

    expect(plain.indexOf("执行计划")).toBeLessThan(plain.indexOf("TODO"));
    expect(plain.match(/执行计划/g)).toHaveLength(1);
    expect(plain.match(/TODO/g)).toHaveLength(1);
    expect(plain).not.toContain(plan.digest);
    expect(collapsed.every((line) => visibleWidth(line) <= 24)).toBe(true);

    state = reduceTuiPlanState(state, { type: "toggle_plan" });
    view.setState(state);
    const expanded = stripAnsi(view.render(32).join("\n"));
    expect(expanded).toContain("目标");
    expect(expanded).toContain("步骤");
    expect(expanded).toContain("验证");
  });

  it("renders paused execution and exposes keyboard recovery", () => {
    const plan = authorizedPlan({ status: "executing" });
    let state = stateFor(plan, makeTaskState({
      todoList: [{
        todoId: "outcome-1",
        title: "Playable result",
        status: "in_progress",
      }],
    }));
    state = reduceTuiPlanState(state, {
      type: "server",
      event: {
        type: "plan_episode",
        planId: plan.planId,
        episode: makeEpisode(),
      },
    });
    const output = stripAnsi(new TuiPlanView(state).render(34).join("\n"));
    expect(output).toContain("自动执行已暂停");
    expect(output).toContain("未验证 0/1");
    expect(output).toContain("[A] 调整方案");
    expect(output).toContain("[C] 继续执行");

    const submitEpisodeRecovery = vi.fn();
    const inputState = {
      planState: state,
      submitEpisodeRecovery,
    };
    const handlePlanInput = TuiApp.prototype["handlePlanInput"] as (
      this: typeof inputState,
      data: string,
    ) => boolean;
    expect(handlePlanInput.call(inputState, "c")).toBe(true);
    expect(submitEpisodeRecovery).toHaveBeenCalledWith("continue_execution");
  });

  it("submits a typed paused recovery command and applies conflicts", async () => {
    const plan = authorizedPlan({ status: "executing" });
    const episode = makeEpisode();
    let planState = reduceTuiPlanState(stateFor(plan), {
      type: "server",
      event: { type: "plan_episode", planId: plan.planId, episode },
    });
    const continueExecution = vi.fn(async (command) => ({
      ok: false as const,
      reason: "conflict" as const,
      episode: { ...episode, updatedAt: 30 },
    }));
    const state: any = {
      planState,
      deps: {
        sessions: { currentId: () => plan.sessionId },
        plans: { continueExecution, adjustPlan: vi.fn() },
      },
      applyPlanAction(action: TuiPlanAction) {
        planState = reduceTuiPlanState(planState, action);
        this.planState = planState;
      },
      addError: vi.fn(),
    };

    const accepted = await TuiApp.prototype["submitEpisodeRecovery"].call(
      state,
      "continue_execution",
    );

    expect(accepted).toBe(false);
    expect(continueExecution).toHaveBeenCalledWith(expect.objectContaining({
      planId: plan.planId,
      expectedVersion: plan.version,
      revision: episode.planRevision,
      digest: episode.planDigest,
      operation: "continue_execution",
    }));
    expect(state.addError).toHaveBeenCalledOnce();
    expect(state.planState.submitting).toBe(false);
  });

  it("renders independent Plan and Task events consistently in either order", () => {
    const plan = authorizedPlan();
    const taskState = makeTaskState({
      status: "blocked",
      todoList: [{
        todoId: "outcome-1",
        title: "Playable result",
        status: "completed",
        result: "Game launches",
      }, {
        todoId: "outcome-2",
        title: "Published demo",
        status: "blocked",
        blocker: {
          kind: "permission",
          reason: "Publish access required",
          recovery: "Grant access",
        },
      }],
    });
    const planEvent = {
      type: "server" as const,
      event: { type: "plan_state" as const, plan },
    };
    const taskEvent = {
      type: "server" as const,
      event: {
        type: "task_state" as const,
        sessionId: taskState.sessionId,
        taskState,
      },
    };
    const planFirst = reduceTuiPlanState(
      reduceTuiPlanState(EMPTY_TUI_PLAN_STATE, planEvent),
      taskEvent,
    );
    const taskFirst = reduceTuiPlanState(
      reduceTuiPlanState(EMPTY_TUI_PLAN_STATE, taskEvent),
      planEvent,
    );
    const render = (state: TuiPlanState) =>
      stripAnsi(new TuiPlanView(state).render(80).join("\n"));

    expect(render(taskFirst)).toBe(render(planFirst));
    expect(render(planFirst).indexOf("执行计划"))
      .toBeLessThan(render(planFirst).indexOf("TODO"));
    expect(render(planFirst)).toContain("Game launches");
    expect(render(planFirst)).toContain("Publish access required · Grant access");

    const direct = reduceTuiPlanState(EMPTY_TUI_PLAN_STATE, taskEvent);
    expect(render(direct)).toContain("TODO");
    expect(render(direct)).not.toContain("执行计划");
  });

  it("replaces the single Plan/TODO projection and clears it by Session", () => {
    const view = new ConversationView({ requestRender: vi.fn() } as never);
    const taskState = makeTaskState();
    const first = stateFor(authorizedPlan({ goal: "旧目标" }), taskState);
    view.setPlanState(first);

    const revised = authorizedPlan({
      version: 4,
      revision: 3,
      digest: "c".repeat(64),
      goal: "新目标",
      approval: {
        ...authorizedPlan().approval!,
        revision: 3,
        digest: "c".repeat(64),
      },
    });
    view.setPlanState(stateFor(revised, taskState));
    let output = stripAnsi(view.component.render(80).join("\n"));
    expect(output.match(/执行计划/g)).toHaveLength(1);
    expect(output.match(/TODO/g)).toHaveLength(1);

    view.setPlanState({
      ...EMPTY_TUI_PLAN_STATE,
      view: EMPTY_PLAN_VIEW_STATE,
    });
    output = stripAnsi(view.component.render(80).join("\n"));
    expect(output).not.toContain("执行计划");
    expect(output).not.toContain("TODO");
  });

  it("ignores an obsolete async Session restore", async () => {
    let currentSession = "session-a";
    let resolveOld!: (plan: Readonly<PlanRecord> | undefined) => void;
    const oldLookup = new Promise<Readonly<PlanRecord> | undefined>((resolve) => {
      resolveOld = resolve;
    });
    const currentPlan = authorizedPlan({ sessionId: "session-b" });
    const currentTask = makeTaskState({ sessionId: "session-b" });
    const applyConversationEvent = vi.fn();
    const state: any = {
      planSyncGeneration: 0,
      deps: {
        sessions: { currentId: () => currentSession },
        plans: {
          getActivePlan: vi.fn((sessionId: string) =>
            sessionId === "session-a"
              ? oldLookup
              : Promise.resolve(currentPlan)
          ),
          getLatestPlan: vi.fn(async () => undefined),
          getEpisode: vi.fn(async () => undefined),
        },
        tasks: {
          getTaskState: vi.fn(async (sessionId: string) =>
            sessionId === "session-b" ? currentTask : undefined
          ),
        },
      },
      applyConversationEvent,
    };
    const syncPlanState = TuiApp.prototype.syncPlanState;

    const oldSync = syncPlanState.call(state);
    currentSession = "session-b";
    await syncPlanState.call(state);
    resolveOld(authorizedPlan({ sessionId: "session-a" }));
    await oldSync;

    expect(applyConversationEvent).toHaveBeenCalledTimes(5);
    expect(applyConversationEvent).toHaveBeenCalledWith({
      type: "plan_state",
      plan: currentPlan,
    });
    expect(applyConversationEvent).toHaveBeenCalledWith({
      type: "task_state",
      sessionId: "session-b",
      taskState: currentTask,
    });
    expect(applyConversationEvent).toHaveBeenCalledWith({
      type: "plan_episode",
      planId: currentPlan.planId,
      episode: null,
    });
    expect(applyConversationEvent).not.toHaveBeenCalledWith({
      type: "plan_state",
      plan: expect.objectContaining({ sessionId: "session-a" }),
    });
  });
});
