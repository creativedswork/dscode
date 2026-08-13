import type { Component } from "@earendil-works/pi-tui";
import {
  Key,
  decodeKittyPrintable,
  matchesKey,
  truncateToWidth,
  visibleWidth,
  wrapTextWithAnsi,
} from "@earendil-works/pi-tui";

import { c } from "./theme.js";
import type {
  AgentActivity,
  AgentToolActivity,
  ToolCallEntry,
  ToolResultProjection,
  UIMessage,
} from "../shared/types.js";
import {
  resolveToolResultText,
  type ToolResultRefResolver,
} from "../shared/tool-result-projection.js";

export type TuiActivityId =
  | `thinking:${string}`
  | `main-tool:${string}`
  | `agent:${string}`
  | `agent-tool:${string}:${string}`;

export interface TuiInspectableActivity {
  id: TuiActivityId;
  kind: "thinking" | "main-tool" | "agent" | "agent-tool";
  label: string;
  status: string;
  content?: string;
  resultSummary?: string;
  resultDetail?: ToolResultProjection;
  tool?: ToolCallEntry | AgentToolActivity;
  agent?: AgentActivity;
  isStreaming?: boolean;
}

const OUTPUT_VIEWPORT_LINES = 12;
const ACTIVITY_VIEWPORT_LINES = 16;

export function buildTuiInspectableActivities(
  messages: readonly UIMessage[],
): TuiInspectableActivity[] {
  const activities: TuiInspectableActivity[] = [];
  for (const message of messages) {
    if (message.role === "assistant") {
      if (message.thinking) {
        activities.push({
          id: `thinking:${message.id}`,
          kind: "thinking",
          label: "Thinking",
          status: message.isStreaming ? "streaming" : "completed",
          content: message.thinking,
          isStreaming: message.isStreaming,
        });
      }
      for (const tool of message.tools ?? []) {
        if (!tool.toolCallId) continue;
        activities.push({
          id: `main-tool:${tool.toolCallId}`,
          kind: "main-tool",
          label: tool.name,
          status: tool.resultDetail !== undefined || tool.result !== ""
            ? (tool.isError ? "failed" : "completed")
            : "running",
          resultSummary: tool.result,
          resultDetail: tool.resultDetail,
          tool,
        });
      }
      continue;
    }
    if (message.role !== "agent" || !message.agentActivity) continue;
    const agent = message.agentActivity;
    const label = agent.label?.trim() || "SubAgent";
    activities.push({
      id: `agent:${agent.agentId}`,
      kind: "agent",
      label,
      status: agent.state,
      content: agent.output ?? agent.error ?? agent.progress?.message,
      agent,
    });
    for (const tool of agent.tools ?? []) {
      if (!tool.toolCallId) continue;
      activities.push({
        id: `agent-tool:${agent.agentId}:${tool.toolCallId}`,
        kind: "agent-tool",
        label: `${label} > ${tool.name}`,
        status: tool.status,
        resultSummary: tool.resultDetail?.summary,
        resultDetail: tool.resultDetail,
        tool,
        agent,
      });
    }
  }
  return activities;
}

export function selectCurrentActivity(
  activities: readonly TuiInspectableActivity[],
): TuiActivityId | undefined {
  const lastMatching = (
    predicate: (activity: TuiInspectableActivity) => boolean,
  ) => [...activities].reverse().find(predicate)?.id;
  return lastMatching((activity) =>
    activity.kind === "agent-tool" && activity.status === "permission"
  )
    ?? lastMatching((activity) =>
      (activity.kind === "main-tool" || activity.kind === "agent-tool")
      && activity.status === "running"
    )
    ?? lastMatching((activity) =>
      activity.kind === "agent"
      && ["created", "running", "waiting", "stopped"].includes(activity.status)
    )
    ?? lastMatching((activity) =>
      activity.kind === "thinking" && activity.isStreaming === true
    )
    ?? activities.at(-1)?.id;
}

export class TuiActivityInspector implements Component {
  private selectedId?: TuiActivityId;
  private readonly disclosure = new Map<TuiActivityId, boolean>();
  private readonly manualDisclosure = new Map<TuiActivityId, boolean>();
  private outputActivityId?: TuiActivityId;
  private lineOffset = 0;
  private outputWidth = 120;

  constructor(
    private readonly getMessages: () => readonly UIMessage[],
    private readonly resolveRef: ToolResultRefResolver,
    private readonly onClose: () => void,
    private readonly requestRender: () => void,
  ) {
    this.refresh();
  }

  invalidate(): void {}

  refresh(): void {
    const activities = this.activities();
    for (const activity of activities) {
      if (activity.kind === "thinking") {
        if (!this.disclosure.has(activity.id)) {
          this.disclosure.set(activity.id, false);
        }
        continue;
      }
      if (activity.kind === "agent") {
        this.disclosure.set(
          activity.id,
          ["created", "running", "waiting", "stopped"].includes(activity.status),
        );
      }
    }
    if (!this.selectedId || !activities.some((item) => item.id === this.selectedId)) {
      this.selectedId = selectCurrentActivity(this.navigableActivities());
      this.outputActivityId = undefined;
      this.lineOffset = 0;
    }
  }

  getSelection(): TuiActivityId | undefined {
    return this.selectedId;
  }

  restoreSelection(id: TuiActivityId | undefined): void {
    if (!id) return;
    if (this.activities().some((item) => item.id === id)) {
      this.selectedId = id;
    }
  }

  isOutputOpen(): boolean {
    return this.outputActivityId !== undefined;
  }

  handleInput(data: string): void {
    this.refresh();
    const printable = decodeKittyPrintable(data) ?? data;
    if (matchesKey(data, Key.ctrl("e"))) {
      this.onClose();
      return;
    }
    if (this.outputActivityId) {
      this.handleOutputInput(data);
      return;
    }
    if (matchesKey(data, Key.escape)) {
      this.onClose();
      return;
    }
    if (matchesKey(data, Key.tab) || matchesKey(data, Key.down) || printable.toLowerCase() === "j") {
      this.navigate(1);
      return;
    }
    if (matchesKey(data, Key.shift(Key.tab)) || matchesKey(data, Key.up) || printable.toLowerCase() === "k") {
      this.navigate(-1);
      return;
    }
    if (matchesKey(data, Key.enter) || matchesKey(data, Key.return) || matchesKey(data, Key.right)) {
      this.activate();
      return;
    }
    if (matchesKey(data, Key.left) && this.selectedId) {
      const activity = this.activities().find((item) => item.id === this.selectedId);
      if (activity?.kind === "agent-tool" && activity.agent) {
        const agentId = `agent:${activity.agent.agentId}` as TuiActivityId;
        this.selectedId = agentId;
        if (!activity.agent.permission) {
          this.manualDisclosure.set(agentId, false);
        }
      } else if (activity && !this.isPermissionLocked(activity)) {
        this.manualDisclosure.set(this.selectedId, false);
      }
      this.requestRender();
    }
  }

  render(width: number): string[] {
    this.refresh();
    const safeWidth = Math.max(12, width);
    const innerWidth = Math.max(1, safeWidth - 4);
    this.outputWidth = innerWidth;
    const body = this.outputActivityId
      ? this.renderOutput(innerWidth)
      : this.renderActivities(innerWidth);
    const horizontal = "─".repeat(Math.max(1, safeWidth - 2));
    return [
      c.cyan(`╭${horizontal}╮`),
      ...body.map((line) => {
        const bounded = truncateToWidth(line, innerWidth, "…");
        const padding = " ".repeat(Math.max(0, innerWidth - visibleWidth(bounded)));
        return `${c.cyan("│")} ${bounded}${padding} ${c.cyan("│")}`;
      }),
      c.cyan(`╰${horizontal}╯`),
    ];
  }

  private activities(): TuiInspectableActivity[] {
    return buildTuiInspectableActivities(this.getMessages());
  }

  private navigableActivities(): TuiInspectableActivity[] {
    return this.activities().filter((activity) => {
      if (activity.kind !== "agent-tool" || !activity.agent) return true;
      return this.isAgentExpanded(activity.agent);
    });
  }

  private navigate(direction: -1 | 1): void {
    const activities = this.navigableActivities();
    if (activities.length === 0) return;
    const current = activities.findIndex((item) => item.id === this.selectedId);
    const next = (current + direction + activities.length) % activities.length;
    this.selectedId = activities[next].id;
    this.requestRender();
  }

  private activate(): void {
    const activity = this.activities().find((item) => item.id === this.selectedId);
    if (!activity) return;
    if (activity.kind === "main-tool" || activity.kind === "agent-tool") {
      this.outputActivityId = activity.id;
      this.lineOffset = 0;
    } else if (!this.isPermissionLocked(activity)) {
      this.manualDisclosure.set(activity.id, !this.isExpanded(activity));
    }
    this.requestRender();
  }

  private handleOutputInput(data: string): void {
    const lines = this.outputLines(this.outputWidth);
    const maxOffset = Math.max(0, lines.length - OUTPUT_VIEWPORT_LINES);
    const printable = decodeKittyPrintable(data) ?? data;
    if (matchesKey(data, Key.left) || matchesKey(data, Key.escape)) {
      this.outputActivityId = undefined;
      this.lineOffset = 0;
    } else if (matchesKey(data, Key.down) || printable.toLowerCase() === "j") {
      this.lineOffset = Math.min(maxOffset, this.lineOffset + 1);
    } else if (matchesKey(data, Key.up) || printable.toLowerCase() === "k") {
      this.lineOffset = Math.max(0, this.lineOffset - 1);
    } else if (matchesKey(data, Key.pageDown)) {
      this.lineOffset = Math.min(maxOffset, this.lineOffset + OUTPUT_VIEWPORT_LINES);
    } else if (matchesKey(data, Key.pageUp)) {
      this.lineOffset = Math.max(0, this.lineOffset - OUTPUT_VIEWPORT_LINES);
    } else if (matchesKey(data, Key.home)) {
      this.lineOffset = 0;
    } else if (matchesKey(data, Key.end)) {
      this.lineOffset = maxOffset;
    }
    this.requestRender();
  }

  private renderActivities(width: number): string[] {
    const activities = this.navigableActivities();
    const lines = [
      c.bold(" Activity Inspector"),
      c.dim(" Tab/Shift+Tab navigate · Enter open · Ctrl+E/Esc close"),
      c.dim(" ─────────────────────────────────────────────────"),
    ];
    if (activities.length === 0) {
      lines.push(c.dim(" No inspectable activity"));
      return lines;
    }
    const selectedIndex = Math.max(
      0,
      activities.findIndex((item) => item.id === this.selectedId),
    );
    const start = Math.max(
      0,
      Math.min(
        selectedIndex - Math.floor(ACTIVITY_VIEWPORT_LINES / 2),
        activities.length - ACTIVITY_VIEWPORT_LINES,
      ),
    );
    const visible = activities.slice(start, start + ACTIVITY_VIEWPORT_LINES);
    if (start > 0) lines.push(c.dim(` ... ${start} earlier activities`));
    for (const activity of visible) {
      const selected = activity.id === this.selectedId;
      const prefix = selected ? c.cyan(" >") : "  ";
      const indent = activity.kind === "agent-tool" ? "  " : "";
      const marker = activity.kind === "thinking" || activity.kind === "agent"
        ? this.isExpanded(activity) ? "v" : ">"
        : "o";
      lines.push(
        `${prefix} ${indent}${marker} ${truncateToWidth(activity.label, Math.max(8, width - 24), "…")}  ${c.dim(activity.status)}`,
      );
      if (this.isExpanded(activity) && activity.content) {
        const detail = wrapTextWithAnsi(activity.content.replace(/\t/g, "   "), Math.max(1, width - 6));
        lines.push(...detail.slice(0, 8).map((line) => c.dim(`     ${line}`)));
        if (detail.length > 8) lines.push(c.dim(`     ... ${detail.length - 8} more lines`));
      }
    }
    const hiddenAfter = activities.length - start - visible.length;
    if (hiddenAfter > 0) lines.push(c.dim(` ... ${hiddenAfter} later activities`));
    return lines;
  }

  private renderOutput(width: number): string[] {
    const activity = this.activities().find((item) => item.id === this.outputActivityId);
    if (!activity) {
      this.outputActivityId = undefined;
      return [c.bold(" Activity Inspector"), c.dim(" Selected Tool is no longer available")];
    }
    const lines = this.outputLines(width);
    const maxOffset = Math.max(0, lines.length - OUTPUT_VIEWPORT_LINES);
    this.lineOffset = Math.max(0, Math.min(this.lineOffset, maxOffset));
    const visible = lines.slice(this.lineOffset, this.lineOffset + OUTPUT_VIEWPORT_LINES);
    const from = lines.length === 0 ? 0 : this.lineOffset + 1;
    const to = this.lineOffset + visible.length;
    return [
      c.bold(` ${activity.label} · ${activity.status}`),
      c.dim(` Lines ${from}-${to} of ${lines.length} · ↑↓/J/K scroll · PgUp/PgDn · Esc/Left back`),
      c.dim(" ─────────────────────────────────────────────────"),
      ...(visible.length > 0 ? visible : [c.dim(" Full result unavailable for this record")]),
    ];
  }

  private outputLines(width: number): string[] {
    const activity = this.activities().find((item) => item.id === this.outputActivityId);
    if (!activity) return [];
    const text = resolveToolResultText(activity.resultDetail, this.resolveRef);
    if (text === undefined) {
      return activity.resultSummary
        ? [activity.resultSummary, "", c.dim("Full result unavailable for this record")]
        : [];
    }
    return wrapTextWithAnsi(text.replace(/\t/g, "   "), Math.max(1, width));
  }

  private isExpanded(activity: TuiInspectableActivity): boolean {
    if (activity.kind === "agent" && activity.agent?.permission) return true;
    return this.manualDisclosure.get(activity.id)
      ?? this.disclosure.get(activity.id)
      ?? false;
  }

  private isAgentExpanded(agent: AgentActivity): boolean {
    if (agent.permission) return true;
    if (this.selectedId?.startsWith(`agent-tool:${agent.agentId}:`)) return true;
    const id = `agent:${agent.agentId}` as TuiActivityId;
    return this.manualDisclosure.get(id)
      ?? this.disclosure.get(id)
      ?? ["created", "running", "waiting", "stopped"].includes(agent.state);
  }

  private isPermissionLocked(activity: TuiInspectableActivity): boolean {
    return activity.kind === "agent" && Boolean(activity.agent?.permission);
  }
}
