import type { HarnessAPI } from "../application/harness-api.js";
import type {
  PermissionPromptContext,
  PermissionPromptResult,
} from "../permissions/types.js";
import type { UiBackend } from "./backend.js";
import { TuiApp } from "./tui-app.js";
import { AgentActivityProjector } from "./shared/agent-activity.js";
import { harnessEventToConversationEvent } from "./shared/harness-conversation-adapter.js";
import { openPath } from "./shared/open-path.js";

/**
 * Thin adapter that wraps TuiApp and exposes the UiBackend interface.
 * All notification concerns are handled via HarnessEventBus subscriptions.
 */
export class TuiBackend implements UiBackend {
  private tui: TuiApp;
  private readonly agentActivityProjector: AgentActivityProjector;

  constructor(deps: HarnessAPI) {
    this.tui = new TuiApp(deps);
    this.agentActivityProjector = new AgentActivityProjector(
      deps.agents,
      () => deps.sessions.currentId(),
      (activity) => this.tui.upsertAgentActivity(activity),
    );
    const projectAgentActivity = (event: Parameters<AgentActivityProjector["handle"]>[0]) => {
      this.agentActivityProjector.handle(event);
    };
    const projectConversationEvent = (
      event: Parameters<typeof harnessEventToConversationEvent>[0],
    ) => {
      const projected = harnessEventToConversationEvent(event, {
        sessionId: deps.sessions.currentId(),
      });
      if (projected) this.tui.applyConversationEvent(projected);
    };

    // ── Event bus subscriptions ──
    deps.events.on("llm:text:delta", projectConversationEvent);
    deps.events.on("llm:thinking:delta", projectConversationEvent);
    deps.events.on("llm:retry", (e) => { this.tui.addRetry({ attempt: e.attempt, maxRetries: e.maxRetries, delayMs: e.delayMs, error: e.error, level: e.level }); });
    deps.events.on("tool:start", projectConversationEvent);
    deps.events.on("tool:end", projectConversationEvent);
    deps.events.on("turn:streaming:start", projectConversationEvent);
    deps.events.on("turn:end", (e) => {
      projectConversationEvent(e);
      this.tui.finishAssistantTurnMetadata(e.usage);
    });
    deps.events.on("message:user", projectConversationEvent);
    deps.events.on("ui:info", (e) => { this.tui.addInfo(e.text, e.display); });
    deps.events.on("ui:error", (e) => { this.tui.addError(e.text); });
    deps.events.on("ui:warning", (e) => { this.tui.addWarning(e.text); });
    deps.events.on("ui:image:pending", (e) => { this.tui.addPendingImage(e.image); });
    deps.events.on("ui:conversation:clear", projectConversationEvent);
    deps.events.on("ui:focus:editor", () => { this.tui.focusEditor(); });
    deps.events.on("processing:start", () => { this.tui.setProcessing(true); });
    deps.events.on("processing:stop", () => { this.tui.setProcessing(false); });
    deps.events.on("agent:spawned", projectAgentActivity);
    deps.events.on("agent:state", projectAgentActivity);
    deps.events.on("agent:progress", projectAgentActivity);
    deps.events.on("agent:output", projectAgentActivity);
    deps.events.on("agent:exit", projectAgentActivity);
    deps.events.on("eval:dashboard", (event) => {
      if (event.state.status === "completed") {
        openPath(event.state.outputPath);
      }
    });
  }

  // ── Lifecycle ──
  async start(): Promise<void> {
    await this.tui.start();
  }

  async waitForExit(): Promise<void> {
    await this.tui.waitForExit();
  }

  handleInterrupt(): void {
    this.tui.handleInterrupt();
  }

  async shutdown(): Promise<void> {
    // TuiApp handles its own shutdown via stop()
  }

  // ── Permission ──
  getPromptPermission(): (
    toolName: string,
    preview: string,
    args: unknown,
    context?: PermissionPromptContext,
  ) => Promise<PermissionPromptResult> {
    return this.tui.getPromptPermission();
  }
}
