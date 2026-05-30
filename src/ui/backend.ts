import type { ImageContent } from "@mariozechner/pi-ai";
import type { MCPManager } from "../mcp/manager.js";
import type { PermissionPromptResult } from "../core/types.js";

/**
 * Abstraction layer between Harness and UI rendering.
 * Both TUI and Web UI implement this interface, allowing the same
 * Agent logic to drive different presentation layers.
 */
export interface UiBackend {
  // ── Lifecycle ──
  start(): Promise<void>;
  waitForExit(): Promise<void>;
  shutdown(): Promise<void>;

  // ── Conversation rendering ──
  addUserMessage(text: string): void;
  startAssistantMessage(): void;
  thinkingDelta(delta: string): void;
  textDelta(delta: string): void;
  toolStart(name: string, args: unknown): void;
  toolEnd(name: string, result: unknown, isError: boolean): void;
  finishAssistantMessage(): void;

  // ── System messages ──
  addInfo(text: string): void;
  addError(text: string): void;

  // ── Retry feedback ──
  addRetry(info: { attempt: number; maxRetries: number; delayMs: number; error: string; level: "stream" | "turn" }): void;

  // ── Permission ──
  getPromptPermission(): (
    toolName: string,
    preview: string,
    args: unknown,
  ) => Promise<PermissionPromptResult>;

  // ── Image attachments ──
  addPendingImage(image: ImageContent): void;

  // ── Editor control ──
  focusEditor(): void;
  clearConversationView(): void;

  // ── Processing state ──
  setProcessing(processing: boolean): void;

  // ── MCP ──
  setMcpManager(mcpManager?: MCPManager): void;
  pushMcpState?(): void;
  openMcpBrowser(): void;
}
