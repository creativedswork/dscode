import type { ImageContent } from "@mariozechner/pi-ai";
import type { MCPManager } from "../mcp/manager.js";
import type { PermissionPromptResult } from "../core/types.js";

/**
 * Abstraction layer between Harness and UI rendering.
 *
 * Both TUI and Web UI implement this interface, allowing the same Agent logic
 * to drive different presentation layers. Implementations MUST follow the
 * lifecycle contracts documented on each method to ensure TUI ↔ Web parity.
 *
 * ## Conversation Turn Lifecycle
 *
 * A single user-initiated chat turn follows this sequence:
 *
 * ```
 * User submits message
 *   → addUserMessage(text)          // Display user's message
 *   → setProcessing(true)           // Enter processing state, start timer
 *
 * Agent starts
 *   → startAssistantMessage()       // Prepare for streaming response (render only)
 *
 * Model streams response
 *   → thinkingDelta(delta) × N      // Reasoning/thinking phase
 *   → textDelta(delta) × N          // Visible response text
 *   → toolStart / toolEnd pairs     // Tool calls (interspersed with deltas)
 *
 * Turn ends
 *   → finishAssistantMessage()      // Mark message as complete (render only)
 *
 * Agent ends
 *   → setProcessing(false)          // Exit processing state, stop timer
 * ```
 *
 * **IMPORTANT**: `finishAssistantMessage()` MUST NOT call `setProcessing(false)`.
 * The `processing` state lifecycle is separate from the message streaming lifecycle.
 * Only `agent_end` (via `setProcessing`) and error paths should exit processing.
 */
export interface UiBackend {
  // ── Lifecycle ──
  /** Start the UI and begin rendering. Called once by Harness.run(). */
  start(): Promise<void>;
  /** Block until the UI should exit. Called by Harness.run() after start(). */
  waitForExit(): Promise<void>;
  /** Gracefully tear down the UI. */
  shutdown(): Promise<void>;

  // ── Conversation rendering ──

  /**
   * Display a user message in the conversation.
   *
   * Called by: user input handling (before `setProcessing(true)`)
   * Contract: render-only — MUST NOT change processing state
   */
  addUserMessage(text: string): void;

  /**
   * Prepare for an incoming assistant message stream.
   *
   * Called by: harness on `agent_start` event
   * Contract: render-only — MUST NOT change processing state.
   * The processing state is already active from the user's submit action.
   */
  startAssistantMessage(): void;

  /**
   * Append a thinking/reasoning delta to the current assistant message.
   *
   * Called by: harness on `message_update` → `thinking_delta` events
   * Contract: render-only — MUST NOT change processing state
   */
  thinkingDelta(delta: string): void;

  /**
   * Append a visible text delta to the current assistant message.
   *
   * Called by: harness on `message_update` → `text_delta` events
   * Contract: render-only — MUST NOT change processing state
   */
  textDelta(delta: string): void;

  /**
   * Display the start of a tool execution.
   *
   * Called by: harness on `tool_execution_start` event
   * Contract: render-only — MUST NOT change processing state
   */
  toolStart(name: string, args: unknown): void;

  /**
   * Display the result of a tool execution.
   *
   * Called by: harness on `tool_execution_end` event
   * Contract: render-only — MUST NOT change processing state
   */
  toolEnd(name: string, result: unknown, isError: boolean): void;

  /**
   * Finalize the current assistant message (mark as no longer streaming).
   *
   * Called by: harness on `turn_end` event
   * Contract: render-only — MUST NOT call `setProcessing(false)`.
   * The processing state ends only when `agent_end` fires.
   */
  finishAssistantMessage(): void;

  // ── System messages ──
  /** Display an informational message to the user. */
  addInfo(text: string): void;
  /** Display an error message to the user. */
  addError(text: string): void;
  /** Display a warning (non-fatal but important — e.g., vision model billing issue, fallback active). */
  addWarning(text: string): void;

  // ── Retry feedback ──
  /** Display retry progress during model error recovery. */
  addRetry(info: { attempt: number; maxRetries: number; delayMs: number; error: string; level: "stream" | "turn" }): void;

  // ── Permission ──
  /** Request tool execution permission from the user. Blocks until user decides. */
  getPromptPermission(): (
    toolName: string,
    preview: string,
    args: unknown,
  ) => Promise<PermissionPromptResult>;

  // ── Image attachments ──
  /** Register a pending image for the next user message. */
  addPendingImage(image: ImageContent): void;

  // ── Editor control ──
  /** Focus the text input (TUI only; no-op in Web). */
  focusEditor(): void;
  /** Clear all messages from the conversation view. */
  clearConversationView(): void;

  // ── Processing state ──

  /**
   * Enter or exit the global processing state.
   *
   * ## Contract
   *
   * `setProcessing(true)` is called ONLY by:
   * - User message submission (before the agent starts)
   * - Vision model / OCR pre-processing (in harness.promptWithImages)
   *
   * `setProcessing(false)` is called ONLY by:
   * - Harness on `agent_end` event
   * - Error paths (model failure, vision/OCR failure)
   *
   * **MUST NOT** be called from `finishAssistantMessage()` or any
   * method that handles message streaming events.
   *
   * Implementations should use this to:
   * - Show/hide a "processing" indicator or loader
   * - Disable/enable user input
   * - Start/stop elapsed time tracking
   */
  setProcessing(processing: boolean): void;

  // ── MCP ──
  /** Receive the MCP manager instance for state queries. */
  setMcpManager(mcpManager?: MCPManager): void;
  /** Push updated MCP server/tool state to the UI. */
  pushMcpState?(): void;
  /** Open the MCP browser panel. */
  openMcpBrowser(): void;

  // ── Config Watch ──
  /** Config change notification. Called by Harness when ConfigWatch fires.
   *  TuiBackend: no-op (shared reference already synced).
   *  WebUiBackend: broadcasts config event to frontend. */
  onConfigChange?(): void;
}
