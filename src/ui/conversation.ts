import type { TUI, Component } from "@earendil-works/pi-tui";
import {
  Text,
  Box,
  Image,
  getCapabilities,
  hyperlink,
  truncateToWidth,
  visibleWidth,
  wrapTextWithAnsi,
} from "@earendil-works/pi-tui";
import type { ImageTheme } from "@earendil-works/pi-tui";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { c } from "./theme.js";
import { convertJpegToPng, detectImageFormat } from "../utils/image-convert.js";
import type { AgentActivity, PermissionPrompt } from "./shared/types.js";
import { formatAgentDisplayId } from "./shared/agent-id.js";
import { formatToolArgsForDisplay } from "./shared/tool-args-formatter.js";

interface ToolEntry {
  toolCallId: string;
  name: string;
  args: unknown;
  result: unknown;
  isError: boolean;
  suppressOnSuccess?: boolean;
}

interface AgentActivityBlock {
  type: "agent";
  agentId: string;
  activity: AgentActivity;
  toolsExpanded: boolean;
  manualToolsExpanded?: boolean;
}

type ContentBlock =
  | { type: "text"; content: string }
  | { type: "thinking"; content: string; expanded: boolean }
  | AgentActivityBlock
  | { type: "image"; img: Image };

interface AgentCardOptions {
  toolsExpanded?: boolean;
  selected?: boolean;
  permissionLines?: string[];
  contentWidth?: number;
}

export class TuiAgentActivityCard implements Component {
  constructor(
    private readonly source: string | AgentActivity,
    private readonly options: AgentCardOptions = {},
  ) {}

  invalidate(): void {}

  render(width: number): string[] {
    const contentWidth = Math.max(1, width - 4);
    const content = typeof this.source === "string"
      ? this.source
      : formatAgentActivityForTui(this.source, Date.now(), {
          ...this.options,
          contentWidth,
        });
    if (width < 6) {
      return wrapTextWithAnsi(content, Math.max(1, width));
    }
    const lines = wrapTextWithAnsi(
      content.replace(/\t/g, "   "),
      contentWidth,
    );
    const horizontal = "─".repeat(width - 2);
    return [
      c.dim(`╭${horizontal}╮`),
      ...lines.map((line) => {
        const padding = " ".repeat(Math.max(0, contentWidth - visibleWidth(line)));
        return `${c.dim("│")} ${line}${padding} ${c.dim("│")}`;
      }),
      c.dim(`╰${horizontal}╯`),
    ];
  }
}

export class TuiThinkingBlock implements Component {
  constructor(
    private readonly content: string,
    private readonly expanded: boolean,
  ) {}

  invalidate(): void {}

  render(width: number): string[] {
    const safeWidth = Math.max(1, width);
    if (!this.expanded) {
      const label = "› Thinking";
      const hint = safeWidth >= visibleWidth(label) + 10 ? "  [Ctrl+R]" : "";
      const summaryWidth = Math.max(
        0,
        safeWidth - visibleWidth(label) - visibleWidth(hint) - 2,
      );
      const summary = truncateSummary(this.content, summaryWidth);
      const separator = summary ? "  " : "";
      return [c.dim(`${label}${separator}${summary}${hint}`)];
    }
    const contentWidth = Math.max(1, safeWidth - 2);
    const allLines = wrapTextWithAnsi(
      this.content.replace(/\t/g, "   "),
      contentWidth,
    );
    const visibleLines = allLines.slice(0, MAX_TUI_DETAIL_LINES);
    const hidden = allLines.length - visibleLines.length;
    const header = safeWidth >= 20 ? "⌄ Thinking  [Ctrl+R]" : "⌄ Thinking";
    const detail = [
      c.dim(header),
      ...visibleLines.map((line) => c.dim(`  ${line}`)),
      ...(hidden > 0
        ? [c.dim(`  … ${hidden} more lines · full thinking retained in Session`)]
        : []),
    ];
    return detail.flatMap((line) => wrapTextWithAnsi(line, safeWidth));
  }
}

function truncateSummary(text: string, length: number): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (length <= 0) return "";
  if (normalized.length > length && length <= 3) return ".".repeat(length);
  return normalized.length <= length
    ? normalized
    : `${normalized.slice(0, Math.max(0, length - 3)).trimEnd()}...`;
}

const MAX_TUI_AGENT_OUTPUT = 2_000;
const MAX_TUI_DETAIL_LINES = 16;

function formatAgentOutput(text: string, contentWidth = 120): {
  lines: string[];
  truncated: boolean;
} {
  const value = text.trim();
  const characterBounded = value.slice(0, MAX_TUI_AGENT_OUTPUT);
  const allVisibleLines = wrapTextWithAnsi(
    characterBounded.replace(/\t/g, "   "),
    Math.max(1, contentWidth - 4),
  );
  const visibleLines = allVisibleLines.slice(0, MAX_TUI_DETAIL_LINES);
  const truncated = value.length > MAX_TUI_AGENT_OUTPUT
    || allVisibleLines.length > visibleLines.length;
  const [first = "", ...rest] = visibleLines;
  return {
    lines: [
      `  ↳ ${first}`,
      ...rest.map((line) => `    ${line}`),
      ...(truncated ? ["    …"] : []),
    ],
    truncated,
  };
}

function formatActivityDuration(activity: AgentActivity, now = Date.now()): string {
  const start = activity.startedAt ?? activity.createdAt;
  const end = activity.endedAt ?? now;
  const seconds = Math.max(0, Math.floor((end - start) / 1000));
  return seconds < 60
    ? `${seconds}s`
    : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

function formatAgentLabel(activity: AgentActivity): string {
  return activity.label?.trim() || "SubAgent";
}

function activitySymbol(activity: AgentActivity): string {
  if (activity.state === "completed") return "✓";
  if (
    activity.state === "failed"
    || activity.state === "terminated"
    || activity.state === "killed"
  ) return "✗";
  if (activity.state === "waiting" || activity.state === "stopped") return "◇";
  return "◆";
}

function defaultToolsExpanded(activity: AgentActivity): boolean {
  return activity.state !== "completed";
}

export function formatAgentActivityForTui(
  activity: AgentActivity,
  now = Date.now(),
  options: AgentCardOptions = {},
): string {
  const label = formatAgentLabel(activity);
  const selection = options.selected ? "› " : "";
  const lines = [
    `${selection}${activitySymbol(activity)} ${label}  ${activity.state} · ${activity.attachment} · ${formatActivityDuration(activity, now)}`,
    `  ${truncateSummary(activity.input, 100) || "(no input)"}`,
  ];
  if (activity.tools?.length) {
    const completed = activity.tools.filter((tool) => tool.status === "completed").length;
    const failed = activity.tools.filter((tool) => tool.status === "failed").length;
    const active = activity.tools.length - completed - failed;
    const summary = [
      `${activity.tools.length} total`,
      completed > 0 ? `${completed} done` : "",
      failed > 0 ? `${failed} failed` : "",
      active > 0 ? `${active} active` : "",
    ].filter(Boolean).join(" · ");
    const expanded = activity.permission ? true : options.toolsExpanded ?? false;
    lines.push(`  ${expanded ? "⌄" : "›"} Tools · ${summary}`);
    if (expanded) {
      const visibleTools = activity.tools.slice(-MAX_TUI_DETAIL_LINES);
      const hidden = activity.tools.length - visibleTools.length;
      if (hidden > 0) {
        lines.push(`    … ${hidden} earlier tools retained`);
      }
      for (const tool of visibleTools) {
        const symbol = tool.status === "completed"
          ? "✓"
          : tool.status === "failed"
            ? "✗"
            : tool.status === "permission"
              ? "◇"
              : "◌";
        const prefix = `    ${symbol} `;
        const suffix = `  ${tool.status}`;
        const detail = tool.summary ? `  ${tool.summary}` : "";
        const toolWidth = Math.max(
          1,
          (options.contentWidth ?? 120)
            - visibleWidth(prefix)
            - visibleWidth(suffix),
        );
        lines.push(
          `${prefix}${truncateToWidth(`${tool.name}${detail}`, toolWidth, "…")}${suffix}`,
        );
      }
      if (activity.permission) {
        lines.push(`    Permission required · ${activity.permission.toolName}`);
        if (activity.permission.preview) {
          lines.push(`      ${truncateSummary(activity.permission.preview, 100)}`);
        }
        for (const line of options.permissionLines ?? []) {
          lines.push(`    ${line}`);
        }
      }
    }
  }
  let outputTruncated = false;
  if (activity.error) {
    lines.push(`  ↳ ${truncateSummary(activity.error, 120)}`);
  } else if (activity.output) {
    const output = formatAgentOutput(activity.output, options.contentWidth);
    lines.push(...output.lines);
    outputTruncated = output.truncated;
  } else if (activity.progress) {
    const count = activity.progress.current != null
      ? `${activity.progress.current}${activity.progress.total != null ? `/${activity.progress.total}` : ""} · `
      : "";
    const detail = activity.progress.message ?? activity.progress.phase ?? "working";
    lines.push(`  ↳ ${count}${truncateSummary(detail, 120)}`);
  }
  const terminalNote = outputTruncated
    ? " · output truncated; full output retained in Agent Process Store"
    : "";
  const controlHint = options.selected ? " · Ctrl+O tools · Ctrl+N next" : "";
  lines.push(
    `  agent id: ${formatAgentDisplayId(activity.agentId)}${controlHint}${terminalNote}`,
  );
  return lines.join("\n");
}

function compactJsonSummary(obj: unknown): string {
  if (typeof obj === "string") return obj.length > 60 ? obj.slice(0, 57) + "..." : obj;
  if (typeof obj === "number" || typeof obj === "boolean") return String(obj);
  if (obj === null) return "null";
  if (Array.isArray(obj)) {
    if (obj.length === 0) return "[]";
    const sample = obj.slice(0, 3).map((v) => compactJsonSummary(v)).join(", ");
    return obj.length > 3 ? `[${sample}, …${obj.length - 3} more]` : `[${sample}]`;
  }
  if (typeof obj === "object") {
    const keys = Object.keys(obj as Record<string, unknown>);
    // MCP-style envelope: { data, meta } → unwrap to data
    if (keys.length === 2 && keys.includes("data") && keys.includes("meta")) {
      return compactJsonSummary((obj as any).data);
    }
    // status-only: { ok: true } or { error: "..." }
    if (keys.length === 1 && (keys[0] === "ok" || keys[0] === "error")) {
      const v = (obj as any)[keys[0]];
      return keys[0] === "ok" ? (v ? "✓ ok" : "✗ failed") : `error: ${String(v).slice(0, 40)}`;
    }
    if (keys.length <= 3) {
      const entries = keys.map((k) => {
        const v = (obj as any)[k];
        const vs = compactJsonSummary(v);
        return `${k}: ${vs}`;
      });
      return `{${entries.join(", ")}}`;
    }
    return `{${keys.length} keys}`;
  }
  return String(obj).slice(0, 60);
}

function tryParseJson(text: string): unknown | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return null;
  try { return JSON.parse(trimmed); } catch { return null; }
}

function toolArgsPreview(name: string, args: unknown): string {
  return formatToolArgsForDisplay(name, args, 160);
}

function toolResultPreview(result: unknown): string {
  if (typeof result === "string") {
    const parsed = tryParseJson(result);
    return parsed ? compactJsonSummary(parsed) : result.slice(0, 120);
  }
  if (result && typeof result === "object") {
    const r = result as Record<string, unknown>;
    if (Array.isArray(r.content)) {
      const first = r.content[0];
      if (first && typeof first === "object" && "text" in first) {
        const parsed = tryParseJson(String(first.text));
        return parsed ? compactJsonSummary(parsed) : String(first.text).slice(0, 120);
      }
    }
  }
  try {
    return compactJsonSummary(JSON.parse(JSON.stringify(result)));
  } catch {
    return String(result).slice(0, 120);
  }
}

function extractTextFromBlocks(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((b: any) => b.type === "text")
      .map((b: any) => b.text)
      .join("");
  }
  return "";
}

export type PermOptionValue = "allow" | "always_allow" | "always_allow_save" | "explain" | "deny";

export interface PermOption {
  value: PermOptionValue;
  label: string;
  key: string;
  color: (s: string) => string;
}

export const PERM_OPTIONS: PermOption[] = [
  { value: "allow", label: "Allow", key: "enter", color: c.green },
  { value: "always_allow", label: "Always Allow", key: "a", color: c.cyan },
  { value: "always_allow_save", label: "Save to Settings", key: "s", color: c.magenta },
  { value: "explain", label: "Input Idea", key: "i", color: c.yellow },
  { value: "deny", label: "Deny", key: "esc", color: c.red },
];

export function navigatePermSelection(current: number, direction: -1 | 1): number {
  return (current + direction + PERM_OPTIONS.length) % PERM_OPTIONS.length;
}

export function findPermOptionByKey(input: string): PermOption | undefined {
  return PERM_OPTIONS.find((option) => option.key.length === 1 && option.key.toLowerCase() === input.toLowerCase());
}

export class ConversationView {
  private box: Box;
  private blocks: ContentBlock[] = [];
  private renderedBlockCount = 0;
  private thinkingBuffer = "";
  private currentAssistantText = "";
  private toolEntries: ToolEntry[] = [];
  private assistantTurnActive = false;
  private pendingAgentBlocks = new Map<string, AgentActivityBlock>();
  private selectedAgentId: string | null = null;
  private liveThinkingExpanded = false;
  private tui: TUI;
  private draftBlocks = new Map<number, { startIndex: number; count: number }>();

  private _activePermission: PermissionPrompt | null = null;
  private permSelected = 0;
  private permSubMode = false;
  private _permSubModeType: "save" | "session" | "allow" = "save";
  private permSubSelected = 0;
  private lastSubNavAt = 0;
  private lastCancelSubAt = 0;

  private imageTheme: ImageTheme = {
    fallbackColor: c.dim,
  };

  constructor(tui: TUI) {
    this.tui = tui;
    this.box = new Box(1, 0);
  }

  get component(): Box {
    return this.box;
  }

  clear(): void {
    this.blocks = [];
    this.renderedBlockCount = 0;
    this.thinkingBuffer = "";
    this.currentAssistantText = "";
    this.toolEntries = [];
    this.assistantTurnActive = false;
    this.pendingAgentBlocks.clear();
    this.selectedAgentId = null;
    this.liveThinkingExpanded = false;
    this._activePermission = null;
    this.permSelected = 0;
    this.permSubMode = false;
    this._permSubModeType = "save";
    this.permSubSelected = 0;
    this.lastSubNavAt = 0;
    this.draftBlocks.clear();
    while (this.box.children.length > 0) { this.box.removeChild(this.box.children[0]); }
    this.tui.requestRender(true);
  }

  replayMessages(messages: unknown[]): void {
    const lines: string[] = [];
    const flushLines = () => {
      if (lines.length === 0) return;
      this.pushText(lines.join("\n"));
      lines.length = 0;
    };
    for (const msg of messages) {
      const m = msg as any;
      if (m.role === "user") {
        const text = extractTextFromBlocks(m.content);
        if (text) {
          lines.push(c.green.bold("you › ") + text);
        }
        // Render image blocks from content (restored by restoreImagesFromCache)
        if (Array.isArray(m.content)) {
          for (const block of m.content) {
            if (block.type === "image" && block.data) {
              flushLines();
              this.addInlineImage(block.data, block.mimeType ?? "image/png");
            }
          }
        }
        // Also render images from msg.images (non-restored inline format)
        if (m.images && Array.isArray(m.images)) {
          for (const img of m.images) {
            if (img && typeof img === "object" && img.data) {
              flushLines();
              this.addInlineImage(img.data, img.mimeType ?? "image/png");
            }
          }
        }
      } else if (m.role === "assistant") {
        if (m.thinking) {
          flushLines();
          this.pushThinking(String(m.thinking));
        }
        if (Array.isArray(m.tools)) {
          for (const tool of m.tools) {
            const icon = tool.isError ? c.red("✗") : c.cyan("✓");
            const result = tool.result ? c.dim(" → ") + toolResultPreview(tool.result) : "";
            lines.push(`${icon} ${c.cyan(tool.name)} ${c.dim(tool.args ?? "")}${result}`);
          }
        }
        const content = m.content;
        if (Array.isArray(content)) {
          for (const block of content) {
            if (block.type === "thinking" && block.thinking) {
              flushLines();
              this.pushThinking(String(block.thinking));
            } else if (block.type === "text" && block.text) {
              lines.push(c.magenta.bold("agent ›") + "\n" + block.text);
            } else if (block.type === "toolCall") {
              lines.push(` ${c.cyan("⚙")} ${c.cyan(block.name)} ${c.dim(toolArgsPreview(block.name, block.arguments))}`);
            } else if (block.type === "image" && block.data) {
              flushLines();
              this.addInlineImage(block.data, block.mimeType ?? "image/png");
            }
          }
        } else if (typeof content === "string") {
          if (content) lines.push(c.magenta.bold("agent ›") + "\n" + content);
        }
        if (Array.isArray(m.images)) {
          for (const img of m.images) {
            if (img && typeof img === "object" && img.data) {
              flushLines();
              this.addInlineImage(img.data, img.mimeType ?? "image/png");
            }
          }
        }
      } else if (m.role === "agent" && m.agentActivity) {
        flushLines();
        this.upsertAgentActivity(m.agentActivity);
      }
    }
    flushLines();
    this.render();
  }

  addUserMessage(text: string): void {
    this.pushText(c.green.bold("you › ") + text);
    this.render();
  }

  startAssistantMessage(): void {
    this.assistantTurnActive = true;
    this.currentAssistantText = "";
    this.thinkingBuffer = "";
    this.toolEntries = [];
    this.liveThinkingExpanded = false;
    this.tui.requestRender(true);
  }

  thinkingDelta(delta: string): void {
    this.thinkingBuffer += delta;
    this.renderLive();
  }

  textDelta(delta: string): void {
    this.currentAssistantText += delta;
    this.renderLive();
  }

  toolStart(name: string, args: unknown, toolCallId = `${name}-${this.toolEntries.length}`): void {
    this.toolEntries.push({
      toolCallId,
      name,
      args,
      result: "" as unknown,
      isError: false,
      suppressOnSuccess: name === "spawn_agent",
    });
    this.renderLive();
  }

  toolEnd(name: string, result: unknown, isError: boolean, toolCallId?: string): void {
    const entry = toolCallId
      ? this.toolEntries.find((tool) => tool.toolCallId === toolCallId)
      : [...this.toolEntries].reverse().find(
          (tool) => tool.name === name && tool.result === ("" as unknown),
        );
    if (entry) {
      entry.result = result;
      entry.isError = isError;

      // Extract and render images from tool result
      if (result && typeof result === "object") {
        const r = result as Record<string, unknown>;
        if (Array.isArray(r.content)) {
          for (const item of r.content) {
            if (item && typeof item === "object" && (item as any).type === "image" && (item as any).data) {
              this.addInlineImage((item as any).data, (item as any).mimeType ?? "image/png");
            }
          }
        }
      }
    }
    this.renderLive();
  }

  finishAssistantMessage(): void {
    const lines: string[] = [];
    if (this.thinkingBuffer) {
      this.pushThinking(this.thinkingBuffer, this.liveThinkingExpanded);
    }
    if (this.currentAssistantText) {
      lines.push(c.magenta.bold("agent ›") + "\n" + this.currentAssistantText);
    }
    const visibleTools = this.visibleMainTools();
    if (visibleTools.length > 0) {
      for (const t of visibleTools) {
        const icon = t.isError ? c.red("✗") : c.cyan("✓");
        const preview = toolResultPreview(t.result);
        const argsStr = toolArgsPreview(t.name, t.args);
        const previewPart = preview ? c.dim(" → ") + preview : "";
        lines.push(`${icon} ${c.cyan(t.name)} ${c.dim(argsStr)}${previewPart}`);
      }
    }
    if (lines.length > 0) {
      this.pushText(lines.join("\n"));
    }
    for (const block of this.pendingAgentBlocks.values()) {
      this.blocks.push(block);
    }
    this.pendingAgentBlocks.clear();
    this.assistantTurnActive = false;
    this.currentAssistantText = "";
    this.thinkingBuffer = "";
    this.toolEntries = [];
    this.liveThinkingExpanded = false;
    this.render();
  }

  addInfo(text: string): void {
    this.pushText(c.dim(text));
    this.render();
  }

  upsertAgentActivity(activity: AgentActivity): void {
    const index = this.blocks.findIndex(
      (block) => block.type === "agent" && block.agentId === activity.agentId,
    );
    const existing = index >= 0 && this.blocks[index].type === "agent"
      ? this.blocks[index] as AgentActivityBlock
      : this.pendingAgentBlocks.get(activity.agentId);
    const toolsExpanded = activity.permission
      ? true
      : existing?.manualToolsExpanded !== undefined
        ? existing.manualToolsExpanded
        : defaultToolsExpanded(activity);
    const block: AgentActivityBlock = {
      type: "agent",
      agentId: activity.agentId,
      activity,
      toolsExpanded,
      manualToolsExpanded: existing?.manualToolsExpanded,
    };
    this.selectedAgentId ??= activity.agentId;
    if (index >= 0) {
      this.blocks[index] = block;
      this.rerenderStaticBlocks();
    } else if (this.assistantTurnActive) {
      this.pendingAgentBlocks.set(activity.agentId, block);
      this.renderLive();
    } else {
      this.blocks.push(block);
      this.render();
    }
  }

  toggleThinking(): boolean {
    if (this.assistantTurnActive && this.thinkingBuffer) {
      this.liveThinkingExpanded = !this.liveThinkingExpanded;
      this.renderLive();
      return this.liveThinkingExpanded;
    }
    const block = [...this.blocks].reverse().find(
      (item): item is Extract<ContentBlock, { type: "thinking" }> =>
        item.type === "thinking",
    );
    if (!block) return false;
    block.expanded = !block.expanded;
    this.rerenderStaticBlocks();
    return block.expanded;
  }

  selectNextAgent(): string | undefined {
    const blocks = this.allAgentBlocks();
    if (blocks.length === 0) return undefined;
    const currentIndex = blocks.findIndex((block) => block.agentId === this.selectedAgentId);
    const next = blocks[(currentIndex + 1 + blocks.length) % blocks.length];
    this.selectedAgentId = next.agentId;
    this.rerenderStaticBlocks();
    return next.agentId;
  }

  toggleSelectedAgentTools(): boolean | undefined {
    const blocks = this.allAgentBlocks();
    const selected = blocks.find((block) => block.agentId === this.selectedAgentId)
      ?? blocks.at(-1);
    if (!selected) return undefined;
    this.selectedAgentId = selected.agentId;
    if (selected.activity.permission) return selected.toolsExpanded;
    selected.toolsExpanded = !selected.toolsExpanded;
    selected.manualToolsExpanded = selected.toolsExpanded;
    this.rerenderStaticBlocks();
    return selected.toolsExpanded;
  }

  getActiveExecutionStatus(): string | undefined {
    const activity = [...this.allAgentBlocks()]
      .reverse()
      .map((block) => block.activity)
      .find((item) =>
        item.permission
        || item.state === "running"
        || item.state === "waiting"
        || item.state === "stopped",
      );
    if (!activity) return undefined;
    const label = formatAgentLabel(activity);
    if (activity.permission) {
      return `${label} · ${activity.permission.toolName} · permission required`;
    }
    const activeTool = [...(activity.tools ?? [])].reverse().find(
      (tool) => tool.status === "running" || tool.status === "permission",
    );
    if (activeTool) return `${label} · ${activeTool.name} · ${activeTool.status}`;
    return `${label} · ${activity.progress?.message ?? activity.state}`;
  }

  addWarning(text: string): void {
    this.pushText(c.yellow("\u26a0 " + text));
    this.render();
  }

  addNotice(text: string): void {
    this.pushText(text);
    this.render();
  }

  addDraftImage(id: number, base64Data: string, mimeType: string, infoText: string): void {
    const blocksBefore = this.blocks.length;
    this.addInlineImage(base64Data, mimeType);
    this.pushText(c.dim(infoText));
    const blocksAdded = this.blocks.length - blocksBefore;
    this.draftBlocks.set(id, { startIndex: blocksBefore, count: blocksAdded });
  }

  removeDraftImageById(id: number): void {
    const entry = this.draftBlocks.get(id);
    if (!entry) return;

    const { startIndex, count } = entry;
    this.draftBlocks.delete(id);

    // Remove blocks from the array
    this.blocks.splice(startIndex, count);

    // Remove corresponding box children
    const childrenToRemove = this.box.children.slice(startIndex, startIndex + count);
    for (const child of childrenToRemove) {
      this.box.removeChild(child);
    }

    this.renderedBlockCount = Math.max(0, this.renderedBlockCount - count);

    // Adjust startIndex of all drafts that come after the removed one
    for (const [otherId, other] of this.draftBlocks) {
      if (other.startIndex > startIndex) {
        other.startIndex -= count;
      }
    }

    this.tui.requestRender(true);
  }

  /** Remove all draft image blocks (called before addInlineImage re-adds them on submit). */
  clearDrafts(): void {
    const ids = [...this.draftBlocks.keys()];
    for (const id of ids.reverse()) {
      this.removeDraftImageById(id);
    }
  }

  addInlineImage(base64Data: string, mimeType: string): void {
    // Detect actual format from magic bytes, not file extension.
    // A WebP named .png will be correctly identified as webp.
    const format = detectImageFormat(base64Data);
    let displayData = base64Data;
    let displayMimeType = mimeType;
    let needsConversion = false;

    if (format === "jpeg") {
      const pngData = convertJpegToPng(base64Data);
      if (pngData) {
        displayData = pngData;
        displayMimeType = "image/png";
        needsConversion = true;
      }
    } else if (format === "webp") {
      // WebP requires sharp for conversion (async). Skip terminal render
      // but still save to disk with correct format info.
      displayMimeType = "image/webp";
    }

    // Always save to file — reliable across all terminals
    const cacheDir = join(homedir(), ".dscode", "image-cache");
    mkdirSync(cacheDir, { recursive: true });
    const ext = displayMimeType.split("/")[1] || "png";
    const filename = `${Date.now()}.${ext}`;
    const filePath = join(cacheDir, filename);
    writeFileSync(filePath, Buffer.from(displayData, "base64"));
    this.pushText(c.dim(`[image: ${filePath}]`));

    // Attempt terminal-native image rendering (Kitty, iTerm2, Ghostty, etc.)
    // Skip WebP — requires async sharp conversion, not yet implemented.
    if (format !== "webp") {
      try {
        const img = new Image(displayData, displayMimeType, this.imageTheme, {
          maxHeightCells: 12,
          maxWidthCells: 40,
        });
        this.blocks.push({ type: "image", img });
      } catch {
        // Image creation failed — fallback to file path only
      }
    } else if (needsConversion || format !== mimeType.split("/")[1]) {
      this.pushText(c.yellow(`  (image is ${format}, not ${mimeType.split("/")[1]} — terminal render skipped)`));
    }
    this.render();
  }

  addError(text: string): void {
    this.pushText(c.red("[error] " + text));
    this.render();
  }

  addRetry(info: { attempt: number; maxRetries: number; delayMs: number; error: string; level: "stream" | "turn" }): void {
    const exhausted = info.attempt > info.maxRetries;
    const delaySec = Math.round(info.delayMs / 100) / 10;
    if (exhausted) {
      const reason = info.error ? `: ${info.error}` : "";
      this.pushText(c.red(`✗ All retries exhausted${reason}`));
    } else if (info.delayMs > 0) {
      const errHint = info.error ? ` (${info.error})` : "";
      this.pushText(c.yellow(`↻ Retry ${info.attempt}/${info.maxRetries} in ${delaySec}s...${errHint} [${info.level}]`));
    } else {
      this.pushText(c.red(`✗ Retry failed: ${info.error}`));
    }
    this.render();
  }

  showPermissionPrompt(
    toolName: string,
    preview: string,
    fuzzyPattern?: string | null,
    fuzzyArgDesc?: string | null,
    context?: { agentId?: string; toolCallId?: string },
  ): void {
    this._activePermission = {
      toolName,
      preview,
      agentId: context?.agentId,
      toolCallId: context?.toolCallId,
      fuzzyPattern: fuzzyPattern ?? null,
      fuzzyArgDesc: fuzzyArgDesc ?? null,
    };
    this.permSelected = 0;
    this.permSubMode = false;
    this._permSubModeType = "save";
    this.permSubSelected = 0;
    this.rerenderStaticBlocks();
  }

  permNavigate(direction: -1 | 1): void {
    this.permSelected = navigatePermSelection(this.permSelected, direction);
    this.rerenderStaticBlocks();
  }

  permSelect(): PermOption | null {
    return this._activePermission ? PERM_OPTIONS[this.permSelected] : null;
  }

  isInSubMode(): boolean {
    return this.permSubMode;
  }

  get activePermission(): PermissionPrompt | null {
    return this._activePermission;
  }

  get permSubModeType(): "save" | "session" | "allow" {
    return this._permSubModeType;
  }

  enterSubMode(type: "save" | "session" | "allow" = "save", _fuzzy?: string | null): void {
    this.permSubMode = true;
    this._permSubModeType = type;
    this.permSubSelected = 0;
    this.lastSubNavAt = 0;
    this.rerenderStaticBlocks();
  }

  cancelSubMode(): void {
    this.permSubMode = false;
    this.permSubSelected = 0;
    this.lastCancelSubAt = Date.now();
    this.rerenderStaticBlocks();
  }

  /** True if sub-mode was cancelled within the last 200ms — used to debounce double-firing Escape. */
  get justCancelledSubMode(): boolean {
    return Date.now() - this.lastCancelSubAt < 200;
  }

  permSubNavigate(direction: -1 | 1): void {
    const now = Date.now();
    if (now - this.lastSubNavAt < 120) return;
    this.lastSubNavAt = now;
    const fa = this._activePermission?.fuzzyArgDesc;
    const llm = this._activePermission?.llmSuggestions;
    const count = (fa ? 3 : 2) + (llm ? llm.length : 0);
    this.permSubSelected = (this.permSubSelected + direction + count) % count;
    this.rerenderStaticBlocks();
  }

  permSubSelect(): number {
    return this.permSubSelected;
  }

  clearPermissionPrompt(): void {
    this._activePermission = null;
    this.permSelected = 0;
    this.permSubMode = false;
    this.permSubSelected = 0;
    this.rerenderStaticBlocks();
  }

  private pushText(content: string): void {
    this.blocks.push({ type: "text", content });
  }

  private pushThinking(content: string, expanded = false): void {
    this.blocks.push({ type: "thinking", content, expanded });
  }

  private allAgentBlocks(): AgentActivityBlock[] {
    return [
      ...this.blocks.filter(
        (block): block is AgentActivityBlock => block.type === "agent",
      ),
      ...this.pendingAgentBlocks.values(),
    ];
  }

  private visibleMainTools(): ToolEntry[] {
    return this.toolEntries.filter(
      (tool) => !tool.suppressOnSuccess || tool.isError,
    );
  }

  private rerenderStaticBlocks(): void {
    for (const component of this.liveComponents) {
      this.box.removeChild(component);
    }
    this.liveComponents = [];
    while (this.box.children.length > 0) {
      this.box.removeChild(this.box.children[0]);
    }
    this.renderedBlockCount = 0;
    this.render();
  }

  private renderPermPrompt(): string[] {
    const lines: string[] = [];
    const maxLineLen = 60;

    if (!this._activePermission) return lines;

    if (this.permSubMode) {
      return this.renderPermSubOptions(lines);
    }

    lines.push(c.yellow.bold(" Permissions ────────────────────────────────────"));
    lines.push(c.yellow(` Tool: ${this._activePermission.toolName}`));
    if (this._activePermission.preview) {
      for (const pl of this._activePermission.preview.split("\n").slice(0, 6)) {
        lines.push(c.dim(`   ${pl.slice(0, maxLineLen)}`));
      }
    }
    lines.push(c.dim(" ──────────────────────────────────────────────────"));
    for (let i = 0; i < PERM_OPTIONS.length; i++) {
      const opt = PERM_OPTIONS[i];
      const selected = i === this.permSelected;
      const prefix = selected ? c.cyan(" ▶") : "  ";
      const label = selected ? c.bold(opt.color(opt.label)) : c.dim(opt.label);
      const hint = c.dim(`[${opt.key}]`);
      lines.push(`${prefix} ${label}  ${hint}`);
    }
    lines.push(c.dim(" ──────────────────────────────────────────────────"));
    lines.push(c.dim(" ↑↓ to navigate  Enter to confirm  A/I/S shortcuts  Esc to deny"));
    return lines;
  }

  private renderPermSubOptions(lines: string[]): string[] {
    const fp = this._activePermission?.fuzzyPattern;
    const tn = this._activePermission?.toolName ?? "";
    const fa = this._activePermission?.fuzzyArgDesc;
    const isMcp = tn.startsWith("mcp__");
    const isSession = this._permSubModeType === "session" || this._permSubModeType === "allow";

    if (isSession) {
      const fuzzyLabel = isMcp ? `fuzzy: ${fp}` : `fuzzy: ${tn} (all calls)`;
      const subOptions = [
        { label: `exact: ${tn}`, key: "1" },
        { label: fuzzyLabel, key: "2" },
      ];
      lines.push(c.yellow.bold(" Always Allow ──────────────────────────────────────"));
      lines.push(c.dim(" Choose exact or fuzzy pattern:"));
      for (let i = 0; i < subOptions.length; i++) {
        const opt = subOptions[i];
        const selected = i === this.permSubSelected;
        const prefix = selected ? c.cyan(" ▶") : "  ";
        const label = selected ? c.bold(c.magenta(opt.label)) : c.dim(opt.label);
        lines.push(`${prefix} ${label}`);
      }
      lines.push(c.dim(" ──────────────────────────────────────────────────────"));
      lines.push(c.dim(" ↑↓ to choose  Enter to confirm  Esc to cancel"));
      return lines;
    }

    const exactLabel = isMcp ? `exact: ${tn}` : `exact: ${tn} (this call)`;
    const fuzzyLabel = isMcp ? `fuzzy: ${fp ?? ""}` : `fuzzy: ${tn} (all calls)`;
    const subOptions = [
      { label: exactLabel, key: "1" },
      { label: fuzzyLabel, key: "2" },
    ];
    if (fa) {
      subOptions.push({ label: `fuzzy args: ${tn} ${fa}`, key: "3" });
    }
    // LLM suggestions
    const llm = this._activePermission?.llmSuggestions;
    if (llm && llm.length > 0) {
      for (let i = 0; i < llm.length; i++) {
        subOptions.push({ label: `[AI] ${llm[i].label}`, key: `${3 + i}` });
      }
    }

    lines.push(c.yellow.bold(" Save Rule ──────────────────────────────────────────────────────"));
    lines.push(c.dim(" Choose exact or fuzzy pattern:"));
    for (let i = 0; i < subOptions.length; i++) {
      const opt = subOptions[i];
      const selected = i === this.permSubSelected;
      const prefix = selected ? c.cyan(" ▶") : "  ";
      const label = selected ? c.bold(c.magenta(opt.label)) : c.dim(opt.label);
      lines.push(`${prefix} ${label}`);
    }
    lines.push(c.dim(" ──────────────────────────────────────────────────────"));
    lines.push(c.dim(" ↑↓ to choose  Enter to confirm  Esc to cancel"));
    return lines;
  }

  private render(): void {
    const totalBlocks = this.blocks.length;

    for (let i = this.renderedBlockCount; i < totalBlocks; i++) {
      const block = this.blocks[i];
      if (block.type === "text") {
        this.box.addChild(new Text(block.content));
      } else if (block.type === "thinking") {
        this.box.addChild(new TuiThinkingBlock(block.content, block.expanded));
      } else if (block.type === "agent") {
        this.box.addChild(this.makeAgentCard(block));
      } else {
        this.box.addChild(block.img);
      }
    }
    this.renderedBlockCount = totalBlocks;

    this.renderLive();
  }

  private liveComponents: Component[] = [];

  private renderLive(): void {
    for (const comp of this.liveComponents) {
      this.box.removeChild(comp);
    }
    this.liveComponents = [];

    if (this.thinkingBuffer) {
      const thinking = new TuiThinkingBlock(
        this.thinkingBuffer,
        this.liveThinkingExpanded,
      );
      this.box.addChild(thinking);
      this.liveComponents.push(thinking);
    }

    const liveLines: string[] = [];
    if (this.currentAssistantText) {
      liveLines.push(c.magenta.bold("agent ›") + "\n" + this.currentAssistantText);
    }
    const visibleTools = this.visibleMainTools();
    if (visibleTools.length > 0) {
      liveLines.push("");
      liveLines.push(c.dim("──── ⚙ Main Tools ───────────────────"));
      for (const t of visibleTools) {
        const hasResult = t.result !== ("" as unknown);
        if (hasResult) {
          const icon = t.isError ? c.red("✗") : c.cyan("✓");
          const preview = toolResultPreview(t.result);
          const argsStr = toolArgsPreview(t.name, t.args);
          liveLines.push(
            ` ${icon} ${c.cyan(t.name)} ${c.dim(argsStr)}${preview ? c.dim(" → ") + preview : ""}`,
          );
        } else {
          liveLines.push(
            ` ${c.yellow("⟳")} ${c.cyan(t.name)} ${c.dim(toolArgsPreview(t.name, t.args))} ${c.dim("...")}`,
          );
        }
      }
    }

    if (liveLines.length > 0) {
      const liveText = new Text(liveLines.join("\n"));
      this.box.addChild(liveText);
      this.liveComponents.push(liveText);
    }

    for (const block of this.pendingAgentBlocks.values()) {
      const card = this.makeAgentCard(block);
      this.box.addChild(card);
      this.liveComponents.push(card);
    }

    const permissionHasAgentCard = this._activePermission
      ? this.allAgentBlocks().some((block) => this.permissionMatchesAgentBlock(block))
      : false;
    if (this._activePermission && !permissionHasAgentCard) {
      const permText = new Text(this.renderPermPrompt().join("\n"));
      this.box.addChild(permText);
      this.liveComponents.push(permText);
    }

    this.tui.requestRender(false);
  }

  private makeAgentCard(block: AgentActivityBlock): TuiAgentActivityCard {
    const permissionLines = this.permissionMatchesAgentBlock(block)
      ? this.renderPermPrompt()
      : undefined;
    return new TuiAgentActivityCard(block.activity, {
      toolsExpanded: block.toolsExpanded,
      selected: block.agentId === this.selectedAgentId,
      permissionLines,
    });
  }

  private permissionMatchesAgentBlock(block: AgentActivityBlock): boolean {
    const active = this._activePermission;
    if (!active) return false;
    if (active.agentId === block.agentId) return true;
    return Boolean(
      active.toolCallId
      && block.activity.permission?.toolCallId === active.toolCallId,
    );
  }
}
