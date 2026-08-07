import type {
  PermissionPromptContext,
  PermissionPromptResult,
} from "../core/types.js";

/**
 * Minimal lifecycle + request-response interface for UI backends.
 *
 * Only 4 methods remain: start, waitForExit, shutdown, getPromptPermission.
 * All notification concerns (streaming, tool events, system messages,
 * config changes, MCP state) are now handled via HarnessEventBus subscriptions.
 *
 * Both TUI and Web UI implement this interface.
 */
export interface UiBackend {
  /** Start the UI and begin rendering. Called once by Harness.run(). */
  start(): Promise<void>;
  /** Block until the UI should exit. Called by Harness.run() after start(). */
  waitForExit(): Promise<void>;
  /** Gracefully tear down the UI. */
  shutdown(): Promise<void>;

  /**
   * Request tool execution permission from the user. Blocks until user decides.
   * This is the only request-response method — it requires Harness to block
   * waiting for a user decision, which an event bus cannot model.
   */
  getPromptPermission(): (
    toolName: string,
    preview: string,
    args: unknown,
    context?: PermissionPromptContext,
  ) => Promise<PermissionPromptResult>;
}
