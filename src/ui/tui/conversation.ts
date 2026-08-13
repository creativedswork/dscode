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
import {
  convertJpegToPng,
  detectImageFormat,
} from "../shared/image-convert.js";
import type {
  AgentActivity,
  PermissionPrompt,
  ServerEvent,
  ToolCallEntry,
  UIMessage,
} from "../shared/types.js";
import { formatAgentDisplayId } from "../shared/agent-id.js";
import { conversationReducer } from "../shared/reducer.js";
import { createToolResultProjection } from "../shared/tool-result-projection.js";

interface AgentActivityBlock {
  type: "agent";
  agentId: string;
  activity: AgentActivity;
  toolsExpanded: boolean;
}

type ContentBlock =
  | { type: "text"; content: string }
  | { type: "thinking"; content: string; expanded: boolean }
  | AgentActivityBlock
  | { type: "image"; img: Image };

interface AgentCardOptions {
  toolsExpanded?: boolean;
  selected?: boolean;
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
      const hint = safeWidth >= visibleWidth(label) + 18 ? "  [Ctrl+E inspect]" : "";
      const summaryWidth = Math.max(
        0,
        safeWidth - visibleWidth(label) - visibleWidth(hint) - 2,
      );
      const summary = truncateToWidth(
        this.content.replace(/\s+/g, " ").trim(),
        summaryWidth,
        "...",
      );
      const separator = summary ? "  " : "";
      const rendered = `${label}${separator}${summary}${hint}`;
      return [c.dim(rendered)];
    }
    const contentWidth = Math.max(1, safeWidth - 2);
    const allLines = wrapTextWithAnsi(
      this.content.replace(/\t/g, "   "),
      contentWidth,
    );
    const visibleLines = allLines.slice(0, MAX_TUI_DETAIL_LINES);
    const hidden = allLines.length - visibleLines.length;
    const header = safeWidth >= 28 ? "⌄ Thinking  [Ctrl+E inspect]" : "⌄ Thinking";
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

const TUI_LONG_USER_MESSAGE_CHAR_THRESHOLD = 1_000;
const TUI_LONG_USER_MESSAGE_LINE_THRESHOLD = 10;
const TUI_USER_MESSAGE_PREVIEW_CHARS = 120;
const MAX_TUI_AGENT_OUTPUT = 2_000;
const MAX_TUI_DETAIL_LINES = 16;

function isMainToolCompleted(tool: ToolCallEntry): boolean {
  return tool.resultDetail !== undefined || tool.result !== "";
}

export function formatUserMessageForTui(content: string): string {
  const normalized = content.trim();
  const lines = normalized.split(/\r?\n/);
  if (
    normalized.length <= TUI_LONG_USER_MESSAGE_CHAR_THRESHOLD
    && lines.length <= TUI_LONG_USER_MESSAGE_LINE_THRESHOLD
  ) {
    return normalized;
  }

  const firstLine = lines.find((line) => line.trim().length > 0) ?? "";
  const preview = truncateSummary(
    firstLine,
    TUI_USER_MESSAGE_PREVIEW_CHARS,
  );
  const detail = `${normalized.length.toLocaleString()} chars · ${lines.length} lines · full prompt retained in Session`;
  return `${preview}\n${c.dim(`… ${detail}`)}`;
}

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

function defaultAgentToolsExpanded(activity: AgentActivity): boolean {
  return ["created", "running", "waiting", "stopped"].includes(activity.state);
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
    const expanded = options.toolsExpanded ?? defaultAgentToolsExpanded(activity);
    lines.push(`  ${expanded ? "⌄" : "›"} Tools · ${summary}`);
    if (!expanded) {
      const activeTool = [...activity.tools].reverse().find(
        (tool) => tool.status === "running" || tool.status === "permission",
      );
      if (activeTool) {
        lines.push(`    ↳ ${activeTool.name}  ${activeTool.status}`);
      }
    }
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
    ? " · output summarized; Ctrl+E opens Inspector"
    : "";
  lines.push(
    `  agent id: ${formatAgentDisplayId(activity.agentId)}${terminalNote}`,
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

function toolResultPreview(tool: ToolCallEntry): string {
  const result = tool.result;
  let preview: string;
  if (typeof result === "string") {
    const parsed = tryParseJson(result);
    preview = parsed ? compactJsonSummary(parsed) : result;
  } else if (result && typeof result === "object") {
    const r = result as Record<string, unknown>;
    if (Array.isArray(r.content)) {
      const first = r.content[0];
      if (first && typeof first === "object" && "text" in first) {
        const parsed = tryParseJson(String(first.text));
        preview = parsed ? compactJsonSummary(parsed) : String(first.text);
      } else {
        preview = compactJsonSummary(result);
      }
    } else {
      preview = compactJsonSummary(result);
    }
  } else {
    preview = String(result ?? "");
  }

  const normalized = preview
    .replace(/^```[^\n]*\n?/, "")
    .replace(/\n?```\s*$/, "")
    .replace(/\s+/g, " ")
    .trim();
  const detail = tool.resultDetail;
  if (detail?.charCount === 0) return "no output";
  const stats = [
    detail?.lineCount != null && detail.lineCount > 1
      ? `${detail.lineCount.toLocaleString()} lines`
      : "",
    detail?.charCount != null && detail.charCount > 160
      ? `${detail.charCount.toLocaleString()} chars`
      : "",
  ].filter(Boolean).join(" · ");
  return stats || truncateSummary(normalized, 120);
}

export type PermOptionValue = "allow" | "always_allow" | "always_allow_save" | "explain" | "deny";

export interface PermOption {
  value: PermOptionValue;
  label: string;
  key: string;
  color: (s: string) => string;
}

export const PERM_OPTIONS: PermOption[] = [
  { value: "allow", label: "Allow once", key: "1", color: c.green },
  { value: "always_allow", label: "Allow matching calls for this Session", key: "2", color: c.cyan },
  { value: "always_allow_save", label: "Save matching rule to Settings", key: "3", color: c.magenta },
  { value: "explain", label: "Send guidance instead", key: "4", color: c.yellow },
  { value: "deny", label: "Deny", key: "d", color: c.red },
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
  private messages: UIMessage[] = [];
  private committedMessageIds = new Set<string>();
  private syntheticToolCallSequence = 0;
  private assistantTurnActive = false;
  private pendingAgentBlocks = new Map<string, AgentActivityBlock>();
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
    this.messages = [];
    this.committedMessageIds.clear();
    this.assistantTurnActive = false;
    this.pendingAgentBlocks.clear();
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
    this.clear();
    this.messages = conversationReducer([], {
      type: "ready",
      model: "",
      config: {} as never,
      messages: messages as any[],
    });
    for (const message of this.messages) {
      this.commitCanonicalMessage(message);
      for (const image of message.images ?? []) {
        if ("data" in image) this.addInlineImage(image.data, image.mimeType);
      }
    }
    this.render();
  }

  getMessages(): readonly UIMessage[] {
    return this.messages;
  }

  applyConversationEvent(event: ServerEvent): void {
    if (event.type === "ready") {
      this.replayMessages(event.messages);
      return;
    }
    if (event.type === "clear_conversation") {
      this.clear();
      return;
    }
    this.messages = conversationReducer(this.messages, event);
    switch (event.type) {
      case "user_message": {
        const message = this.messages.at(-1);
        if (message) this.commitCanonicalMessage(message);
        this.render();
        break;
      }
      case "assistant_start":
        this.assistantTurnActive = true;
        this.renderLive();
        break;
      case "thinking_delta":
      case "text_delta":
      case "tool_start":
      case "tool_progress":
        this.assistantTurnActive = true;
        this.renderLive();
        break;
      case "tool_end":
        for (const image of event.images ?? []) {
          this.addInlineImage(image.data, image.mimeType);
        }
        this.renderLive();
        break;
      case "assistant_end": {
        const message = [...this.messages].reverse().find(
          (item) => item.role === "assistant",
        );
        if (message) this.commitCanonicalMessage(message);
        for (const block of this.pendingAgentBlocks.values()) this.blocks.push(block);
        this.pendingAgentBlocks.clear();
        this.assistantTurnActive = false;
        this.render();
        break;
      }
      case "agent_activity":
        this.applyAgentActivity(event.activity);
        break;
      default:
        break;
    }
  }

  addUserMessage(text: string): void {
    this.applyConversationEvent({
      type: "user_message",
      text,
      createdAt: Date.now(),
    });
  }

  startAssistantMessage(): void {
    this.applyConversationEvent({
      type: "assistant_start",
      messageId: `assistant-${Date.now()}`,
      createdAt: Date.now(),
    });
  }

  thinkingDelta(delta: string): void {
    this.applyConversationEvent({ type: "thinking_delta", delta });
  }

  textDelta(delta: string): void {
    this.applyConversationEvent({ type: "text_delta", delta });
  }

  toolStart(
    name: string,
    args: unknown,
    toolCallId = `${name}-${++this.syntheticToolCallSequence}`,
  ): void {
    this.applyConversationEvent({
      type: "tool_start",
      toolCallId,
      name,
      args,
    });
  }

  toolEnd(name: string, result: unknown, isError: boolean, toolCallId?: string): void {
    const activeToolCallId = toolCallId ?? [...this.messages]
      .reverse()
      .flatMap((message) => [...(message.tools ?? [])].reverse())
      .find((tool) => tool.name === name && !isMainToolCompleted(tool))
      ?.toolCallId;
    if (!activeToolCallId) return;
    const resultDetail = createToolResultProjection(name, result);
    this.applyConversationEvent({
      type: "tool_end",
      toolCallId: activeToolCallId,
      name,
      result: resultDetail.summary,
      resultDetail,
      isError,
    });
  }

  finishAssistantMessage(): void {
    this.applyConversationEvent({ type: "assistant_end" });
  }

  addInfo(text: string): void {
    this.pushText(c.dim(text));
    this.render();
  }

  upsertAgentActivity(activity: AgentActivity): void {
    this.messages = conversationReducer(this.messages, {
      type: "agent_activity",
      activity,
    });
    this.applyAgentActivity(activity);
  }

  private applyAgentActivity(activity: AgentActivity): void {
    const index = this.blocks.findIndex(
      (block) => block.type === "agent" && block.agentId === activity.agentId,
    );
    const toolsExpanded = defaultAgentToolsExpanded(activity);
    const block: AgentActivityBlock = {
      type: "agent",
      agentId: activity.agentId,
      activity,
      toolsExpanded,
    };
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
    if (activity) {
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

    const streamingMessage = [...this.messages].reverse().find(
      (message) => message.role === "assistant" && message.isStreaming,
    );
    const activeMainTool = [...(streamingMessage?.tools ?? [])].reverse().find(
      (tool) => !isMainToolCompleted(tool),
    );
    if (activeMainTool) return `Main · ${activeMainTool.name} · running`;
    if (streamingMessage?.thinkingStartedAt !== undefined) {
      return "Thinking";
    }
    return undefined;
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
    for (const other of this.draftBlocks.values()) {
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
    const count = this.getPermSubOptionCount();
    this.permSubSelected = (this.permSubSelected + direction + count) % count;
    this.rerenderStaticBlocks();
  }

  permSubSelect(): number {
    return this.permSubSelected;
  }

  getPermSubOptionCount(): number {
    const fuzzyArgs = this._activePermission?.fuzzyArgDesc ? 1 : 0;
    const suggestions = this._activePermission?.llmSuggestions?.length ?? 0;
    return (this._permSubModeType === "save" ? 2 + fuzzyArgs + suggestions : 2);
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

  private commitCanonicalMessage(message: UIMessage): void {
    if (this.committedMessageIds.has(message.id)) return;
    this.committedMessageIds.add(message.id);
    if (message.role === "agent" && message.agentActivity) {
      this.applyAgentActivity(message.agentActivity);
      return;
    }
    if (message.role === "user") {
      if (message.content) {
        this.pushText(
          c.green.bold("you › ") + formatUserMessageForTui(message.content),
        );
      }
      return;
    }
    if (message.role === "assistant") {
      if (message.thinking) this.pushThinking(message.thinking);
      const lines: string[] = [];
      if (message.content) {
        lines.push(c.magenta.bold("agent ›") + "\n" + message.content);
      }
      for (const tool of this.visibleMainTools(message.tools)) {
        const completed = isMainToolCompleted(tool);
        const icon = completed
          ? tool.isError ? c.red("✗") : c.cyan("✓")
          : c.yellow("⟳");
        const preview = completed ? toolResultPreview(tool) : "";
        const previewPart = preview ? c.dim(" → ") + preview : "";
        lines.push(
          `${icon} ${c.cyan(tool.name)} ${c.dim(tool.args)}${previewPart}`,
        );
      }
      if (lines.length > 0) this.pushText(lines.join("\n"));
      return;
    }
    if (message.content) this.pushText(c.dim(message.content));
  }

  private allAgentBlocks(): AgentActivityBlock[] {
    return [
      ...this.blocks.filter(
        (block): block is AgentActivityBlock => block.type === "agent",
      ),
      ...this.pendingAgentBlocks.values(),
    ];
  }

  private visibleMainTools(tools: readonly ToolCallEntry[] | undefined): ToolCallEntry[] {
    return (tools ?? []).filter(
      (tool) => tool.name !== "spawn_agent" || tool.isError,
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
    const owner = this.allAgentBlocks().find((block) =>
      this.permissionMatchesAgentBlock(block)
    );
    const ownerPath = owner
      ? `${formatAgentLabel(owner.activity)} > ${this._activePermission.toolName}`
      : `Main > ${this._activePermission.toolName}`;
    lines.push(c.yellow(` Owner: ${ownerPath}`));
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
    lines.push(c.dim(" 1-4 choose · Enter confirm · D deny"));
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
        lines.push(`${prefix} ${c.dim(`[${opt.key}]`)} ${label}`);
      }
      lines.push(c.dim(" ──────────────────────────────────────────────────────"));
      lines.push(c.dim(" 1-2 choose · Enter confirm · Esc cancel"));
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
        subOptions.push({
          label: `[AI] ${llm[i].label}`,
          key: `${subOptions.length + 1}`,
        });
      }
    }

    lines.push(c.yellow.bold(" Save Rule ──────────────────────────────────────────────────────"));
    lines.push(c.dim(" Choose exact or fuzzy pattern:"));
    for (let i = 0; i < subOptions.length; i++) {
      const opt = subOptions[i];
      const selected = i === this.permSubSelected;
      const prefix = selected ? c.cyan(" ▶") : "  ";
      const label = selected ? c.bold(c.magenta(opt.label)) : c.dim(opt.label);
      lines.push(`${prefix} ${c.dim(`[${opt.key}]`)} ${label}`);
    }
    lines.push(c.dim(" ──────────────────────────────────────────────────────"));
    lines.push(c.dim(" Number chooses directly · Enter confirms · Esc cancels"));
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

    const liveMessage = [...this.messages].reverse().find(
      (message) => message.role === "assistant" && message.isStreaming,
    );
    if (liveMessage?.thinking) {
      const thinking = new TuiThinkingBlock(
        liveMessage.thinking,
        false,
      );
      this.box.addChild(thinking);
      this.liveComponents.push(thinking);
    }

    const liveLines: string[] = [];
    if (liveMessage?.content) {
      liveLines.push(c.magenta.bold("agent ›") + "\n" + liveMessage.content);
    }
    const visibleTools = this.visibleMainTools(liveMessage?.tools);
    if (visibleTools.length > 0) {
      liveLines.push("");
      liveLines.push(c.dim("──── ⚙ Main Tools ───────────────────"));
      for (const t of visibleTools) {
        if (isMainToolCompleted(t)) {
          const icon = t.isError ? c.red("✗") : c.cyan("✓");
          const preview = toolResultPreview(t);
          const argsStr = t.args;
          liveLines.push(
            ` ${icon} ${c.cyan(t.name)} ${c.dim(argsStr)}${preview ? c.dim(" → ") + preview : ""}`,
          );
        } else {
          liveLines.push(
            ` ${c.yellow("⟳")} ${c.cyan(t.name)} ${c.dim(t.args)} ${c.dim("...")}`,
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

    if (this._activePermission) {
      const permText = new Text(this.renderPermPrompt().join("\n"));
      this.box.addChild(permText);
      this.liveComponents.push(permText);
    }

    this.tui.requestRender(false);
  }

  private makeAgentCard(block: AgentActivityBlock): TuiAgentActivityCard {
    return new TuiAgentActivityCard(block.activity, {
      toolsExpanded: block.toolsExpanded,
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
