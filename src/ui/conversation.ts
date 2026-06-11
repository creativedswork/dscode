import type { TUI, Component } from "@earendil-works/pi-tui";
import { Text, Box, Image, getCapabilities, hyperlink } from "@earendil-works/pi-tui";
import type { ImageTheme } from "@earendil-works/pi-tui";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { c } from "./theme.js";
import type { PermissionPrompt } from "./shared/types.js";

interface ToolEntry {
  name: string;
  args: unknown;
  result: unknown;
  isError: boolean;
}

type ContentBlock =
  | { type: "text"; content: string }
  | { type: "image"; img: Image };

function toolArgsPreview(args: unknown): string {
  if (typeof args === "string") return args.slice(0, 80);
  try {
    return JSON.stringify(args).slice(0, 80);
  } catch {
    return String(args).slice(0, 80);
  }
}

function toolResultPreview(result: unknown): string {
  if (typeof result === "string") return result.slice(0, 120);
  if (result && typeof result === "object") {
    const r = result as Record<string, unknown>;
    if (Array.isArray(r.content)) {
      const first = r.content[0];
      if (first && typeof first === "object" && "text" in first) {
        return String(first.text).slice(0, 120);
      }
    }
  }
  try {
    return JSON.stringify(result).slice(0, 120);
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
  private renderedToolCount = 0;
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
    this.renderedToolCount = 0;
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
              this.addInlineImage(block.data, block.mimeType ?? "image/png");
            }
          }
        }
        // Also render images from msg.images (non-restored inline format)
        if (m.images && Array.isArray(m.images)) {
          for (const img of m.images) {
            if (img && typeof img === "object" && img.data) {
              this.addInlineImage(img.data, img.mimeType ?? "image/png");
            }
          }
        }
      } else if (m.role === "assistant") {
        const content = m.content;
        if (Array.isArray(content)) {
          for (const block of content) {
            if (block.type === "thinking" && block.thinking) {
              lines.push(c.dim("[thinking] ") + c.dim(String(block.thinking).slice(0, 500)));
            } else if (block.type === "text" && block.text) {
              lines.push(c.magenta.bold("agent ›") + "\n" + block.text);
            } else if (block.type === "toolCall") {
              lines.push(` ${c.cyan("⚙")} ${c.cyan(block.name)} ${c.dim(toolArgsPreview(block.arguments))}`);
            } else if (block.type === "image" && block.data) {
              this.addInlineImage(block.data, block.mimeType ?? "image/png");
            }
          }
        } else if (typeof content === "string") {
          lines.push(c.magenta.bold("agent ›") + "\n" + content);
        }
      }
    }
    if (lines.length > 0) {
      this.pushText(lines.join("\n"));
    }
    this.render();
  }

  addUserMessage(text: string): void {
    this.pushText(c.green.bold("you › ") + text);
    this.render();
  }

  startAssistantMessage(): void {
    this.currentAssistantText = "";
    this.thinkingBuffer = "";
    this.toolEntries = [];
    this.renderedToolCount = 0;
  }

  thinkingDelta(delta: string): void {
    this.thinkingBuffer += delta;
    this.renderLive();
  }

  textDelta(delta: string): void {
    this.currentAssistantText += delta;
    this.renderLive();
  }

  toolStart(name: string, args: unknown): void {
    this.toolEntries.push({ name, args, result: "" as unknown, isError: false });
    this.renderLive();
  }

  toolEnd(_name: string, result: unknown, isError: boolean): void {
    const entry = this.toolEntries[this.toolEntries.length - 1];
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
      lines.push(c.dim("[thinking] ") + c.dim(this.thinkingBuffer.slice(0, 500)));
    }
    if (this.currentAssistantText) {
      lines.push(c.magenta.bold("agent ›") + "\n" + this.currentAssistantText);
    }
    if (this.toolEntries.length > 0) {
      lines.push("");
      lines.push(c.dim("──── ⚙ Tools ────────────────────────"));
      for (const t of this.toolEntries) {
        const icon = t.isError ? c.red("✗") : c.cyan("✓");
        const preview = toolResultPreview(t.result);
        const argsStr = toolArgsPreview(t.args);
        lines.push(` ${icon} ${c.cyan(t.name)} ${c.dim(argsStr)}${preview ? c.dim(" → ") + preview : ""}`);
      }
    }
    if (lines.length > 0) {
      lines.push("");
      this.pushText(lines.join("\n"));
    }
    this.currentAssistantText = "";
    this.thinkingBuffer = "";
    this.toolEntries = [];
    this.renderedToolCount = 0;
    this.render();
  }

  addInfo(text: string): void {
    this.pushText(c.dim(text));
    this.render();
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
    // Always save to file — reliable across all terminals
    const cacheDir = join(homedir(), ".dscode", "image-cache");
    mkdirSync(cacheDir, { recursive: true });
    const ext = mimeType.split("/")[1] || "png";
    const filename = `${Date.now()}.${ext}`;
    const filePath = join(cacheDir, filename);
    writeFileSync(filePath, Buffer.from(base64Data, "base64"));
    this.pushText(c.dim(`[image: ${filePath}]`));

    // Attempt terminal-native image rendering (Kitty, iTerm2, Ghostty, etc.)
    // Skip JPEG — terminal graphics protocols have inconsistent JPEG format support
    const isJpeg = mimeType === "image/jpeg" || mimeType === "image/jpg";
    if (!isJpeg) {
      try {
        const img = new Image(base64Data, mimeType, this.imageTheme, {
          maxHeightCells: 12,
          maxWidthCells: 40,
        });
        this.blocks.push({ type: "image", img });
      } catch {
        // Image creation failed — fallback to file path only
      }
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

  showPermissionPrompt(toolName: string, preview: string, fuzzyPattern?: string | null, fuzzyArgDesc?: string | null): void {
    this._activePermission = { toolName, preview, fuzzyPattern: fuzzyPattern ?? null, fuzzyArgDesc: fuzzyArgDesc ?? null };
    this.permSelected = 0;
    this.permSubMode = false;
    this._permSubModeType = "save";
    this.permSubSelected = 0;
    this.render();
  }

  permNavigate(direction: -1 | 1): void {
    this.permSelected = navigatePermSelection(this.permSelected, direction);
    this.render();
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
    this.render();
  }

  cancelSubMode(): void {
    this.permSubMode = false;
    this.permSubSelected = 0;
    this.lastCancelSubAt = Date.now();
    this.render();
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
    this.render();
  }

  permSubSelect(): number {
    return this.permSubSelected;
  }

  clearPermissionPrompt(): void {
    this._activePermission = null;
    this.permSelected = 0;
    this.permSubMode = false;
    this.permSubSelected = 0;
  }

  private pushText(content: string): void {
    this.blocks.push({ type: "text", content });
  }

  private renderPermPrompt(): string[] {
    const lines: string[] = [];
    const maxLineLen = 60;

    if (!this._activePermission) return lines;

    if (this.permSubMode) {
      return this.renderPermSubOptions(lines);
    }

    lines.push("");
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
      lines.push("");
      lines.push(c.yellow.bold(" Always Allow ──────────────────────────────────────"));
      lines.push(c.dim(" Choose exact or fuzzy pattern:"));
      lines.push("");
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

    lines.push("");
    lines.push(c.yellow.bold(" Save Rule ──────────────────────────────────────────────────────"));
    lines.push(c.dim(" Choose exact or fuzzy pattern:"));
    lines.push("");
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

    const liveLines: string[] = [];
    if (this.thinkingBuffer) {
      liveLines.push(c.dim("[thinking] " + this.thinkingBuffer.slice(0, 500)));
    }
    if (this.currentAssistantText) {
      liveLines.push(c.magenta.bold("agent ›") + "\n" + this.currentAssistantText);
    }
    if (this.toolEntries.length > this.renderedToolCount) {
      if (this.renderedToolCount === 0) {
        liveLines.push("");
        liveLines.push(c.dim("──── ⚙ Tools ────────────────────────"));
      }
      for (let i = this.renderedToolCount; i < this.toolEntries.length; i++) {
        const t = this.toolEntries[i];
        const hasResult = t.result !== ("" as unknown);
        if (hasResult) {
          const icon = t.isError ? c.red("✗") : c.cyan("✓");
          const preview = toolResultPreview(t.result);
          const argsStr = toolArgsPreview(t.args);
          liveLines.push(
            ` ${icon} ${c.cyan(t.name)} ${c.dim(argsStr)}${preview ? c.dim(" → ") + preview : ""}`,
          );
        } else {
          liveLines.push(
            ` ${c.yellow("⟳")} ${c.cyan(t.name)} ${c.dim(toolArgsPreview(t.args))} ${c.dim("...")}`,
          );
        }
      }
      this.renderedToolCount = this.toolEntries.filter(
        (t) => t.result !== ("" as unknown),
      ).length;
    }

    if (liveLines.length > 0) {
      const liveText = new Text(liveLines.join("\n"));
      this.box.addChild(liveText);
      this.liveComponents.push(liveText);
    }

    if (this._activePermission) {
      const permText = new Text(this.renderPermPrompt().join("\n"));
      this.box.addChild(permText);
      this.liveComponents.push(permText);
    }

    this.tui.requestRender(true);
  }
}
