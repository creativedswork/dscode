import type { ImageContent } from "@mariozechner/pi-ai";
import type { MCPManager } from "../mcp/manager.js";
import type { PermissionPromptResult } from "../core/types.js";
import type { UiBackend } from "./backend.js";
import { TuiApp, type TuiDeps } from "./tui-app.js";

/**
 * Thin adapter that wraps TuiApp and exposes the UiBackend interface.
 * All calls delegate directly to the underlying TuiApp.
 */
export class TuiBackend implements UiBackend {
  private tui: TuiApp;

  constructor(deps: TuiDeps) {
    this.tui = new TuiApp(deps);
  }

  // ── Lifecycle ──
  async start(): Promise<void> {
    await this.tui.start();
  }

  async waitForExit(): Promise<void> {
    await this.tui.waitForExit();
  }

  async shutdown(): Promise<void> {
    // TuiApp handles its own shutdown via stop()
  }

  // ── Conversation rendering ──
  addUserMessage(text: string): void {
    this.tui.addUserMessage(text);
  }

  startAssistantMessage(): void {
    this.tui.startAssistantMessage();
  }

  thinkingDelta(delta: string): void {
    this.tui.thinkingDelta(delta);
  }

  textDelta(delta: string): void {
    this.tui.textDelta(delta);
  }

  toolStart(name: string, args: unknown): void {
    this.tui.toolStart(name, args);
  }

  toolEnd(name: string, result: unknown, isError: boolean): void {
    this.tui.toolEnd(name, result, isError);
  }

  finishAssistantMessage(): void {
    this.tui.finishAssistantMessage();
  }

  // ── System messages ──
  addInfo(text: string): void {
    this.tui.addInfo(text);
  }

  addError(text: string): void {
    this.tui.addError(text);
  }

  // ── Retry feedback ──
  addRetry(info: { attempt: number; maxRetries: number; delayMs: number; error: string; level: "stream" | "turn" }): void {
    this.tui.addRetry(info);
  }

  // ── Permission ──
  getPromptPermission(): (
    toolName: string,
    preview: string,
    args: unknown,
  ) => Promise<PermissionPromptResult> {
    return this.tui.getPromptPermission();
  }

  // ── Image attachments ──
  addPendingImage(image: ImageContent): void {
    this.tui.addPendingImage(image);
  }

  // ── Editor control ──
  focusEditor(): void {
    this.tui.focusEditor();
  }

  clearConversationView(): void {
    this.tui.clearConversationView();
  }

  // ── Processing state ──
  setProcessing(processing: boolean): void {
    this.tui.setProcessing(processing);
  }

  // ── MCP ──
  setMcpManager(mcpManager?: MCPManager): void {
    this.tui.setMcpManager(mcpManager);
  }

  openMcpBrowser(): void {
    this.tui.openMcpBrowser();
  }
}
