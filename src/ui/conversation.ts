import type { TUI, Component } from "@earendil-works/pi-tui";
import { Text, Box, Image, getCapabilities, hyperlink } from "@earendil-works/pi-tui";
import type { ImageTheme } from "@earendil-works/pi-tui";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { c } from "./theme.js";

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

export type PermOptionValue = "allow" | "always_allow" | "explain" | "deny";

export interface PermOption {
  value: PermOptionValue;
  label: string;
  key: string;
  color: (s: string) => string;
}

export const PERM_OPTIONS: PermOption[] = [
  { value: "allow", label: "Allow", key: "enter", color: c.green },
  { value: "always_allow", label: "Always Allow", key: "a", color: c.cyan },
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

  private permToolName = "";
  private permPreview = "";
  private permSelected = 0;

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
    this.permToolName = "";
    this.permPreview = "";
    this.permSelected = 0;
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

  addNotice(text: string): void {
    this.pushText(text);
    this.render();
  }

  addInlineImage(base64Data: string, mimeType: string): void {
    if (getCapabilities().images) {
      const img = new Image(base64Data, mimeType, this.imageTheme, {
        maxHeightCells: 12,
        maxWidthCells: 40,
      });
      this.blocks.push({ type: "image", img });
    } else {
      const cacheDir = join(homedir(), ".dscode", "image-cache");
      mkdirSync(cacheDir, { recursive: true });
      const ext = mimeType.split("/")[1] || "png";
      const filename = `${Date.now()}.${ext}`;
      const filePath = join(cacheDir, filename);
      writeFileSync(filePath, Buffer.from(base64Data, "base64"));
      this.pushText(c.dim(`[image: ${filePath}]`));
    }
    this.render();
  }

  addError(text: string): void {
    this.pushText(c.red("[error] " + text));
    this.render();
  }

  showPermissionPrompt(toolName: string, preview: string): void {
    this.permToolName = toolName;
    this.permPreview = preview;
    this.permSelected = 0;
    this.render();
  }

  permNavigate(direction: -1 | 1): void {
    this.permSelected = navigatePermSelection(this.permSelected, direction);
    this.render();
  }

  permSelect(): PermOption | null {
    return this.permToolName ? PERM_OPTIONS[this.permSelected] : null;
  }

  clearPermissionPrompt(): void {
    this.permToolName = "";
    this.permPreview = "";
    this.permSelected = 0;
  }

  private pushText(content: string): void {
    this.blocks.push({ type: "text", content });
  }

  private renderPermPrompt(): string[] {
    const lines: string[] = [];
    const maxLineLen = 60;

    lines.push("");
    lines.push(c.yellow.bold(" Permissions ────────────────────────────────────"));
    lines.push(c.yellow(` Tool: ${this.permToolName}`));
    if (this.permPreview) {
      for (const pl of this.permPreview.split("\n").slice(0, 6)) {
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
    lines.push(c.dim(" ↑↓ to navigate  Enter to confirm  A/I shortcuts  Esc to deny"));
    return lines;
  }

  private render(): void {
    const totalBlocks = this.blocks.length;

    // Add new blocks since last render
    for (let i = this.renderedBlockCount; i < totalBlocks; i++) {
      const block = this.blocks[i];
      if (block.type === "text") {
        this.box.addChild(new Text(block.content));
      } else {
        this.box.addChild(block.img);
      }
    }
    this.renderedBlockCount = totalBlocks;

    // Live content: rebuild live section each time
    this.renderLive();
  }

  private liveComponents: Component[] = [];

  private renderLive(): void {
    // Remove previous live components
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

    if (this.permToolName) {
      const permText = new Text(this.renderPermPrompt().join("\n"));
      this.box.addChild(permText);
      this.liveComponents.push(permText);
    }

    this.box.invalidate();
    this.tui.requestRender(true);
  }
}
