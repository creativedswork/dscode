import type { TUI } from "@earendil-works/pi-tui";
import { Text, Box } from "@earendil-works/pi-tui";
import { c } from "./theme.js";

interface ToolEntry {
  name: string;
  args: string;
  result: string;
  isError: boolean;
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

  toolStart(name: string, args: string): void {
    this.toolEntries.push({ name, args, result: "", isError: false });
    this.render();
  }

  toolEnd(_name: string, result: string, isError: boolean): void {
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
    for (const t of this.toolEntries) {
      this.segments.push(
        c.cyan("\n[tool] ") + c.cyan(`${t.name}: ${t.args.slice(0, 120)}`),
      );
      const firstLine = t.result.slice(0, 300);
      this.segments.push(
        (t.isError ? c.red : c.cyan)(`[result] ${firstLine}`),
      );
    }
    if (this.currentAssistantText) {
      this.segments.push(
        c.magenta.bold("agent ›") + "\n" + this.currentAssistantText,
      );
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

  private render(): void {
    const lines: string[] = [];

    for (const s of this.segments) {
      lines.push(...s.split("\n"));
    }

    if (this.thinkingBuffer) {
      lines.push(c.dim("[thinking] " + this.thinkingBuffer.slice(0, 500)));
    }

    for (const t of this.toolEntries) {
      lines.push(c.cyan(`\n[tool] ${t.name}: ${t.args.slice(0, 120)}`));
      if (t.result) {
        const firstLine = t.result.slice(0, 300);
        lines.push((t.isError ? c.red : c.cyan)(`[result] ${firstLine}`));
      }
    }

    if (this.currentAssistantText) {
      lines.push(c.magenta.bold("agent ›") + "\n" + this.currentAssistantText);
    }

    this.textComponent.setText(lines.join("\n"));
    this.tui.requestRender();
  }
}
