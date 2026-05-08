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

interface PermOption {
  value: "allow" | "always_allow" | "deny";
  label: string;
  key: string;
  color: (s: string) => string;
}

const PERM_OPTIONS: PermOption[] = [
  { value: "allow", label: "Allow", key: "enter", color: c.green },
  { value: "deny", label: "Deny", key: "esc", color: c.red },
  { value: "always_allow", label: "Always Allow", key: "a", color: c.cyan },
];

export class ConversationView {
  private box: Box;
  private textComponent: Text;
  private segments: string[] = [];
  private thinkingBuffer = "";
  private currentAssistantText = "";
  private toolEntries: ToolEntry[] = [];
  private renderedToolCount = 0;
  private tui: TUI;
  private inlineImages: Component[] = [];

  private permToolName = "";
  private permPreview = "";
  private permSelected = 0;

  private imageTheme: ImageTheme = {
    fallbackColor: c.dim,
  };

  constructor(tui: TUI) {
    this.tui = tui;
    this.box = new Box(1, 0);
    this.textComponent = new Text("");
    this.box.addChild(this.textComponent);
  }

  get component(): Box {
    return this.box;
  }

  clear(): void {
    this.segments = [];
    this.thinkingBuffer = "";
    this.currentAssistantText = "";
    this.toolEntries = [];
    this.renderedToolCount = 0;
    this.permToolName = "";
    this.permPreview = "";
    this.permSelected = 0;
    this.render();
  }

  addUserMessage(text: string): void {
    this.segments.push(c.green.bold("you › ") + text);
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
    this.render();
  }

  textDelta(delta: string): void {
    this.currentAssistantText += delta;
    this.render();
  }

  toolStart(name: string, args: unknown): void {
    this.toolEntries.push({ name, args, result: "" as unknown, isError: false });
    this.render();
  }

  toolEnd(_name: string, result: unknown, isError: boolean): void {
    const entry = this.toolEntries[this.toolEntries.length - 1];
    if (entry) {
      entry.result = result;
      entry.isError = isError;
    }
    this.render();
  }

  finishAssistantMessage(): void {
    if (this.thinkingBuffer) {
      this.segments.push(
        c.dim("[thinking] ") + c.dim(this.thinkingBuffer.slice(0, 500)),
      );
    }
    if (this.currentAssistantText) {
      this.segments.push(
        c.magenta.bold("agent ›") + "\n" + this.currentAssistantText,
      );
    }
    if (this.toolEntries.length > 0) {
      this.segments.push("");
      this.segments.push(c.dim("──── ⚙ Tools ────────────────────────"));
      for (const t of this.toolEntries) {
        const icon = t.isError ? c.red("✗") : c.cyan("✓");
        const preview = toolResultPreview(t.result);
        const argsStr = toolArgsPreview(t.args);
        this.segments.push(
          ` ${icon} ${c.cyan(t.name)} ${c.dim(argsStr)}${preview ? c.dim(" → ") + preview : ""}`,
        );
      }
      this.segments.push("");
    }
    this.segments.push("");
    this.currentAssistantText = "";
    this.thinkingBuffer = "";
    this.toolEntries = [];
    this.renderedToolCount = 0;
    this.render();
  }

  addInfo(text: string): void {
    this.segments.push(c.dim(text));
    this.render();
  }

  addInlineImage(base64Data: string, mimeType: string): void {
    const caps = getCapabilities();
    if (caps.images) {
      const img = new Image(base64Data, mimeType, this.imageTheme, {
        maxHeightCells: 12,
        maxWidthCells: 40,
      });
      this.inlineImages.push(img);
      this.box.removeChild(this.textComponent);
      this.box.addChild(img);
      this.box.addChild(this.textComponent);
    } else {
      const cacheDir = join(homedir(), ".dscode", "image-cache");
      mkdirSync(cacheDir, { recursive: true });
      const ext = mimeType.split("/")[1] || "png";
      const filename = `${Date.now()}.${ext}`;
      const filePath = join(cacheDir, filename);
      writeFileSync(filePath, Buffer.from(base64Data, "base64"));
      const linkText = c.dim(`[image: ${filePath}]`);
      this.segments.push(hyperlink(linkText, `file://${filePath}`));
    }
    this.render();
  }

  addError(text: string): void {
    this.segments.push(c.red("[error] " + text));
    this.render();
  }

  showPermissionPrompt(toolName: string, preview: string): void {
    this.permToolName = toolName;
    this.permPreview = preview;
    this.permSelected = 0;
    this.render();
  }

  permNavigate(direction: -1 | 1): void {
    const max = PERM_OPTIONS.length - 1;
    this.permSelected = Math.max(0, Math.min(max, this.permSelected + direction));
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
    lines.push(c.dim(" ↑↓ to navigate  Enter to confirm  Esc to deny"));
    return lines;
  }

  private render(): void {
    const lines: string[] = [];

    for (const s of this.segments) {
      lines.push(...s.split("\n"));
    }

    if (this.thinkingBuffer) {
      lines.push(c.dim("[thinking] " + this.thinkingBuffer.slice(0, 500)));
    }

    if (this.currentAssistantText) {
      lines.push(c.magenta.bold("agent ›") + "\n" + this.currentAssistantText);
    }

    if (this.toolEntries.length > this.renderedToolCount) {
      if (this.renderedToolCount === 0) {
        lines.push("");
        lines.push(c.dim("──── ⚙ Tools ────────────────────────"));
      }
      for (let i = this.renderedToolCount; i < this.toolEntries.length; i++) {
        const t = this.toolEntries[i];
        const hasResult = t.result !== ("" as unknown);
        if (hasResult) {
          const icon = t.isError ? c.red("✗") : c.cyan("✓");
          const preview = toolResultPreview(t.result);
          const argsStr = toolArgsPreview(t.args);
          lines.push(
            ` ${icon} ${c.cyan(t.name)} ${c.dim(argsStr)}${preview ? c.dim(" → ") + preview : ""}`,
          );
        } else {
          lines.push(
            ` ${c.yellow("⟳")} ${c.cyan(t.name)} ${c.dim(toolArgsPreview(t.args))} ${c.dim("...")}`,
          );
        }
      }
      this.renderedToolCount = this.toolEntries.filter(
        (t) => t.result !== ("" as unknown),
      ).length;
    }

    if (this.permToolName) {
      lines.push(...this.renderPermPrompt());
    }

    this.textComponent.setText(lines.join("\n"));
    this.box.invalidate();
    this.tui.requestRender(true);
  }
}
