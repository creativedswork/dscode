import type { Component } from "@earendil-works/pi-tui";
import {
  truncateToWidth,
  visibleWidth,
  wrapTextWithAnsi,
} from "@earendil-works/pi-tui";

import type { TodoStatus } from "../../application/task-state-port.js";
import type { PlanStatus } from "../../application/plan/types.js";
import {
  EMPTY_PLAN_VIEW_STATE,
  planViewReducer,
  type PlanViewState,
} from "../shared/plan-reducer.js";
import {
  EMPTY_TASK_VIEW_STATE,
  taskViewReducer,
  type TaskViewState,
} from "../shared/task-reducer.js";
import type { ServerEvent } from "../shared/types.js";
import { c } from "./theme.js";

export type TuiPlanFocus = "alignment" | "custom" | "plan" | null;

export interface TuiPlanState {
  view: PlanViewState;
  task: TaskViewState;
  expanded: boolean;
  focus: TuiPlanFocus;
  selectedIndex: number;
  submitting: boolean;
}

export type TuiPlanAction =
  | { type: "server"; event: ServerEvent }
  | { type: "navigate"; direction: -1 | 1 }
  | { type: "custom" }
  | { type: "focus_alignment" }
  | { type: "focus_plan" }
  | { type: "focus_editor" }
  | { type: "toggle_plan" }
  | { type: "submit_start" }
  | { type: "submit_failed" };

export const EMPTY_TUI_PLAN_STATE: TuiPlanState = {
  view: EMPTY_PLAN_VIEW_STATE,
  task: EMPTY_TASK_VIEW_STATE,
  expanded: false,
  focus: null,
  selectedIndex: 0,
  submitting: false,
};

function initialSelection(view: PlanViewState): number {
  const candidates = view.interaction?.request.candidates.slice(0, 3) ?? [];
  const recommended = candidates.findIndex((candidate) => candidate.recommended);
  return recommended >= 0 ? recommended : 0;
}

function presentationKey(view: PlanViewState): string | null {
  const plan = view.presentationPlan;
  return plan ? `${plan.planId}:${plan.revision}` : null;
}

export function reduceTuiPlanState(
  state: TuiPlanState,
  action: TuiPlanAction,
): TuiPlanState {
  switch (action.type) {
    case "server": {
      const view = planViewReducer(state.view, action.event);
      const task = taskViewReducer(state.task, action.event);
      if (view === state.view && task === state.task) return state;
      const priorInteraction = state.view.interaction?.interaction.interactionId;
      const nextInteraction = view.interaction?.interaction.interactionId;
      const planChanged = presentationKey(view) !== presentationKey(state.view);
      if (nextInteraction && nextInteraction !== priorInteraction) {
        return {
          view,
          task,
          expanded: planChanged ? false : state.expanded,
          focus: "alignment",
          selectedIndex: initialSelection(view),
          submitting: false,
        };
      }
      if (!nextInteraction && priorInteraction) {
        return {
          view,
          task,
          expanded: planChanged ? false : state.expanded,
          focus: view.publicPlan ? "plan" : null,
          selectedIndex: 0,
          submitting: false,
        };
      }
      return {
        ...state,
        view,
        task,
        expanded: planChanged ? false : state.expanded,
        focus: action.event.type === "plan_episode"
          && action.event.episode?.phase === "paused_inconclusive"
          ? "plan"
          : planChanged && view.publicPlan
          ? "plan"
          : state.focus,
        submitting: action.event.type === "plan_conflict"
          || action.event.type === "plan_episode"
          || action.event.type === "plan_recovery_result"
          ? false
          : state.submitting,
      };
    }
    case "navigate": {
      const count = Math.min(
        3,
        state.view.interaction?.request.candidates.length ?? 0,
      ) + 1;
      if (state.focus !== "alignment" || count <= 1) return state;
      return {
        ...state,
        selectedIndex: (state.selectedIndex + action.direction + count) % count,
      };
    }
    case "custom":
      return state.view.interaction
        ? { ...state, focus: "custom", submitting: false }
        : state;
    case "focus_alignment":
      return state.view.interaction
        ? { ...state, focus: "alignment", submitting: false }
        : state;
    case "focus_plan":
      return state.view.publicPlan ? { ...state, focus: "plan" } : state;
    case "focus_editor":
      return { ...state, focus: null };
    case "toggle_plan":
      return state.focus === "plan" && state.view.publicPlan
        ? { ...state, expanded: !state.expanded }
        : state;
    case "submit_start":
      return state.view.interaction
        || state.view.episode?.phase === "paused_inconclusive"
        ? { ...state, submitting: true }
        : state;
    case "submit_failed":
      return { ...state, submitting: false };
  }
}

function statusLabel(status: PlanStatus): string {
  switch (status) {
    case "drafting":
    case "awaiting_decision":
    case "awaiting_approval":
      return "规划中";
    case "approved":
      return "待执行";
    case "executing":
      return "执行中";
    case "needs_replan":
      return "正在调整";
    case "completed":
      return "已完成";
    case "cancelled":
      return "已取消";
    case "failed":
      return "失败";
  }
}

function itemSymbol(status: TodoStatus): string {
  switch (status) {
    case "pending":
      return "○";
    case "in_progress":
      return "◐";
    case "blocked":
      return "!";
    case "completed":
      return "✓";
    case "skipped":
      return "−";
  }
}

function appendSection(lines: string[], title: string, values: readonly string[]): void {
  if (values.length === 0) return;
  lines.push(c.bold(title));
  lines.push(...values.map((value) => `  ${value}`));
}

function wrapLines(lines: readonly string[], width: number): string[] {
  return lines.flatMap((line) => wrapTextWithAnsi(line, Math.max(1, width)));
}

export class TuiPlanView implements Component {
  constructor(private state: TuiPlanState = EMPTY_TUI_PLAN_STATE) {}

  setState(state: TuiPlanState): void {
    this.state = state;
  }

  invalidate(): void {}

  render(width: number): string[] {
    const safeWidth = Math.max(1, width);
    const lines: string[] = [];
    const interaction = this.state.view.interaction;
    if (interaction) {
      const candidates = interaction.request.candidates.slice(0, 3);
      lines.push(c.cyan.bold("意图对齐"));
      lines.push(interaction.request.prompt);
      const recommendation = candidates.find((candidate) => candidate.recommended);
      if (recommendation) {
        lines.push(c.dim(`建议：${recommendation.summary}`));
      }
      candidates.forEach((candidate, index) => {
        const selected = this.state.focus === "alignment"
          && this.state.selectedIndex === index;
        lines.push(`${selected ? c.cyan("▶") : " "} ${candidate.summary}${candidate.recommended ? c.dim(" · 推荐") : ""}`);
      });
      const customIndex = candidates.length;
      const customSelected = this.state.focus === "alignment"
        && this.state.selectedIndex === customIndex;
      lines.push(`${customSelected ? c.cyan("▶") : " "} 自定义方向`);
      if (this.state.focus === "custom") {
        lines.push(c.dim("请在下方 Chat 输入补充要求；Enter 提交，Esc 返回选项"));
      } else if (this.state.focus === null) {
        lines.push(c.dim("直接输入补充要求并按 Enter · Tab 返回选项"));
      } else {
        lines.push(c.dim(
          this.state.submitting
            ? "正在提交..."
            : "↑/↓ 选择 · Enter 确认 · Esc 返回 Chat 输入",
        ));
      }
    }

    const plan = this.state.view.publicPlan;
    if (plan) {
      if (lines.length > 0) lines.push("");
      const current = this.state.view.plan;
      const source = this.state.view.presentationPlan;
      const status = current?.planId === source?.planId
        ? current?.status ?? plan.status
        : plan.status;
      const marker = this.state.focus === "plan" ? c.cyan("▶") : " ";
      const fold = this.state.expanded ? "⌄" : "›";
      const hint = this.state.focus === "plan" ? c.dim(" · Enter") : "";
      const title = `${marker} ${fold} 执行计划 · ${statusLabel(status)}${hint}`;
      lines.push(truncateToWidth(title, safeWidth, "…"));
      if (this.state.expanded) {
        appendSection(lines, "目标", [plan.goal]);
        appendSection(lines, "已确认约束", plan.committedConstraints);
        appendSection(lines, "方案", plan.selectedDecisionSummaries);
        appendSection(lines, "范围", [
          ...plan.scope,
          ...(plan.sideEffectSummary ? [plan.sideEffectSummary] : []),
        ]);
        appendSection(
          lines,
          "步骤",
          plan.steps.map((step, index) =>
            `${index + 1}. ${step.title}${step.description ? `：${step.description}` : ""}`
          ),
        );
        appendSection(lines, "验证", plan.verificationApproach);
      }
    }

    const task = this.state.task.taskState;
    if (task && task.todoList.length > 0) {
      if (lines.length > 0) lines.push("");
      const completed = task.todoList.filter((item) =>
        item.status === "completed" || item.status === "skipped"
      ).length;
      lines.push(c.bold(`TODO · ${completed}/${task.todoList.length}`));
      for (const item of task.todoList) {
        lines.push(`${itemSymbol(item.status)} ${item.title}`);
        if (item.result) lines.push(c.dim(`  ${item.result}`));
        if (item.blocker) {
          lines.push(c.dim(`  ${item.blocker.reason} · ${item.blocker.recovery}`));
        }
      }
    }

    const episode = this.state.view.episode;
    if (episode) {
      if (lines.length > 0) lines.push("");
      const completed = task?.todoList.filter((item) =>
        item.status === "completed" || item.status === "skipped"
      ).length ?? 0;
      const total = task?.todoList.length ?? 0;
      if (episode.phase === "running") {
        lines.push(c.cyan.bold(`◐ 执行中  ${completed}/${total}`));
        lines.push(c.dim(
          `  本轮 ${episode.turnCount}/${episode.policy.maxTurns} 次循环，`
          + `${episode.toolCallCount}/${episode.policy.maxToolCalls} 次工具调用`,
        ));
      } else if (episode.phase === "reflecting") {
        lines.push(c.yellow.bold("◇ 正在反思"));
        lines.push(c.dim("  系统正在根据未变化的验收结果调整执行策略。"));
      } else if (episode.phase === "paused_inconclusive") {
        lines.push(c.yellow.bold(`! 自动执行已暂停  未验证 ${completed}/${total}`));
        lines.push(c.dim(`  ${episodeIncidentLabel(episode.incident?.rule)}`));
        lines.push(c.dim(
          this.state.submitting
            ? "  正在提交恢复操作..."
            : "  [A] 调整方案  [C] 继续执行",
        ));
      } else {
        lines.push(c.green.bold(`✓ 任务已完成  ${completed}/${total}`));
      }
    }

    return wrapLines(lines, safeWidth).map((line) => {
      const overflow = visibleWidth(line) - safeWidth;
      return overflow > 0 ? truncateToWidth(line, safeWidth, "…") : line;
    });
  }
}

function episodeIncidentLabel(rule: string | undefined): string {
  switch (rule) {
    case "max_equivalent_actions":
      return "相同操作重复出现，但验收结果没有变化。";
    case "max_no_progress_actions":
      return "连续操作没有产生新的验收结果。";
    case "max_tool_calls":
      return "本轮已达到工具调用上限。";
    case "max_turns":
      return "本轮已达到执行轮次上限。";
    default:
      return "当前结果仍需验证。";
  }
}
