import type { TUI } from "@earendil-works/pi-tui";
import { Text, Box } from "@earendil-works/pi-tui";
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

export class ConversationView {
  private box: Box;
  private textComponent: Text;
  private segments: string[] = [];
  private thinkingBuffer = "";
  private currentAssistantText = "";
  private toolEntries: ToolEntry[] = [];
  private tui: TUI;

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
  }

  toolEnd(_name: string, result: unknown, isError: boolean): void {
    const entry = this.toolEntries[this.toolEntries.length - 1];
    if (entry) {
      entry.result = result;
      entry.isError = isError;
    }
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
        this.segments.push(
          ` ${icon} ${c.cyan(t.name)} ${c.dim(toolArgsPreview(t.args))}${preview ? c.dim(" → ") + preview : ""}`,
        );
      }
      this.segments.push("");
    }
    this.segments.push("");
    this.currentAssistantText = "";
    this.thinkingBuffer = "";
    this.toolEntries = [];
    this.render();
  }

  addInfo(text: string): void {
    this.segments.push(c.dim(text));
    this.render();
  }

  addError(text: string): void {
    this.segments.push(c.red("[error] " + text));
    this.render();
  }

  addPermissionPrompt(toolName: string, preview: string): void {
    const maxLen = 50;
    const trimmed = preview.length > maxLen ? preview.slice(0, maxLen) + "..." : preview;
    this.segments.push(
      c.yellow.bold("⚡ Permission: ") + c.yellow(toolName) + "\n" +
      c.dim(trimmed || "(no preview)") + "\n" +
      c.dim("──────────────────────────────") + "\n" +
      c.green("[y]") + " Allow  " +
      c.red("[n]") + " Deny  " +
      c.cyan("[a]") + " Always",
    );
    this.render();
  }

  removePermissionPrompt(): void {
    if (this.segments.length > 0) {
      this.segments.pop();
    }
    this.render();
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

    this.textComponent.setText(lines.join("\n"));
    this.box.invalidate();
    this.tui.requestRender(true);
  }
}
