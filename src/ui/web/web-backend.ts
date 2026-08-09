import { createServer, request as httpRequest } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { readFileSync, existsSync, mkdirSync, writeFileSync, rmSync, readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";
import type { ImageContent } from "@earendil-works/pi-ai";
import type { UiBackend } from "../backend.js";
import type { PublicRuntimeConfigSnapshot } from "../../config/types.js";
import type {
  PermissionPromptContext,
  PermissionPromptResult,
} from "../../permissions/types.js";
import type {
  AgentSessionMessage,
  PendingPermission,
} from "../../session/types.js";
import { executeSlashCommand, getSlashCommandAutocomplete, resolveCustomCommand } from "../commands.js";
import type { HarnessAPI } from "../../application/harness-api.js";
import type {
  AppInstance,
  McpAppResourceProxy,
} from "../../mcp/app/types.js";
import { rebuildDisplayMessages } from "../shared/session-projector.js";
import { AgentActivityProjector } from "../shared/agent-activity.js";
import { harnessEventToConversationEvent } from "../shared/harness-conversation-adapter.js";
import { formatAgentDisplayId } from "../shared/agent-id.js";
import { serializeArtifactThemeVariables } from "../shared/artifact-theme.js";
import { stageAttachedFiles } from "../shared/file-attachments.js";
import { WsServer, type WebSocketClient } from "./ws-server.js";
import type { EvalDashboardState } from "../../core/events.js";
import type {
  ClientCommand,
  ServerEvent,
  ConfigData,
  SessionInfo,
  ConversationMessage,
  McpServerInfo,
  McpAppInfo,
  ToolCallEntry,
  EvalDashboardServerEvent,
} from "./protocol.js";

export const DASHBOARD_AGENT_TASK_SUMMARY_LIMIT = 100;
export const DASHBOARD_AGENT_OUTCOME_SUMMARY_LIMIT = 120;

export function buildDashboardThemeContract(): string {
  return `DESIGN SYSTEM THEME CONTRACT:
- Define these exact CSS custom properties in :root with the light defaults below:
${serializeArtifactThemeVariables("light", "  ")}
- Use these variables for EVERY theme-dependent color declaration, including inline styles
- Never hard-code a theme color outside the :root declarations
- The WebUI overrides these variables at runtime so the same Dashboard follows light and dark mode`;
}

export function projectEvalDashboardState(
  state: EvalDashboardState,
): EvalDashboardServerEvent {
  switch (state.status) {
    case "starting":
      return {
        type: "eval_dashboard",
        status: "starting",
        requestedSessionId: state.requestedSessionId,
        startedAt: state.startedAt,
      };
    case "running":
      return {
        type: "eval_dashboard",
        status: "running",
        targetSessionId: state.targetSessionId,
        runId: state.runId,
        stage: state.stage,
        stageStatus: state.stageStatus,
        index: state.index,
        total: state.total,
        application: state.application,
        workerAgentId: state.workerAgentId,
        retryCount: state.retryCount,
        durationMs: state.durationMs,
        message: state.message,
        startedAt: state.startedAt,
        actorCount: state.actorCount,
        stepCount: state.stepCount,
        evidence: state.evidence,
      };
    case "completed":
      return {
        type: "eval_dashboard",
        status: "completed",
        targetSessionId: state.targetSessionId,
        runId: state.runId,
        html: state.html,
        generatedAt: state.generatedAt,
      };
    case "failed":
      return {
        type: "eval_dashboard",
        status: "failed",
        requestedSessionId: state.requestedSessionId,
        targetSessionId: state.targetSessionId,
        runId: state.runId,
        stage: state.stage,
        error: state.error,
      };
  }
}

export function summarizeDashboardAgentText(
  text: string | undefined,
  maxLength: number,
): string {
  const normalized = (text ?? "").replace(/\s+/g, " ").trim();
  const sentenceEnd = normalized.search(/[。！？.!?]/);
  const oneSentence = sentenceEnd >= 0
    ? normalized.slice(0, sentenceEnd + 1)
    : normalized;
  if (oneSentence.length <= maxLength) return oneSentence;
  if (maxLength <= 3) return normalized.slice(0, maxLength);
  return `${oneSentence.slice(0, maxLength - 3).trimEnd()}...`;
}

export function formatDashboardDuration(ms: number): string {
  const safeMs = Math.max(0, ms);
  if (safeMs < 1000) return `${safeMs}ms`;
  const sec = Math.floor(safeMs / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const remainSec = sec % 60;
  if (min < 60) return `${min}m ${remainSec}s`;
  const hrs = Math.floor(min / 60);
  return `${hrs}h ${min % 60}m`;
}

export function buildDashboardSubagentSummary(
  agentMessages: AgentSessionMessage[],
) {
  const stateCounts: Record<AgentSessionMessage["state"], number> = {
    completed: 0,
    failed: 0,
    terminated: 0,
    killed: 0,
  };
  const applicationCounts = new Map<string, number>();
  let totalDurationMs = 0;

  const records = [...agentMessages]
    .sort((a, b) => a.createdAt - b.createdAt || a.agentId.localeCompare(b.agentId))
    .map((message) => {
      const durationMs = Math.max(
        0,
        message.endedAt - (message.startedAt ?? message.createdAt),
      );
      const error = summarizeDashboardAgentText(
        message.output?.error,
        DASHBOARD_AGENT_OUTCOME_SUMMARY_LIMIT,
      );
      const output = summarizeDashboardAgentText(
        message.output?.text,
        DASHBOARD_AGENT_OUTCOME_SUMMARY_LIMIT,
      );
      stateCounts[message.state]++;
      applicationCounts.set(
        message.application,
        (applicationCounts.get(message.application) ?? 0) + 1,
      );
      totalDurationMs += durationMs;

      return {
        agentId: formatAgentDisplayId(message.agentId),
        application: message.application,
        state: message.state,
        durationMs,
        durationFormatted: formatDashboardDuration(durationMs),
        taskSummary: summarizeDashboardAgentText(
          message.input.prompt,
          DASHBOARD_AGENT_TASK_SUMMARY_LIMIT,
        ),
        outcomeSummary: error || output,
        outcomeKind: error ? "error" : output ? "output" : "none",
      };
    });

  return {
    total: records.length,
    stateCounts,
    successRate: records.length > 0
      ? Math.round((stateCounts.completed / records.length) * 100)
      : null,
    totalDurationMs,
    totalDurationFormatted: formatDashboardDuration(totalDurationMs),
    applicationCounts: Object.fromEntries(
      [...applicationCounts.entries()].sort(([a], [b]) => a.localeCompare(b)),
    ),
    records,
  };
}

export const SESSION_DASHBOARD_VISUAL_REQUIREMENTS = `DASHBOARD CONTENT REQUIREMENTS:
- Preserve all existing session metrics: token usage and category breakdown, context pressure, Main Agent tool statistics, top-tool warnings, Session active time, turn count, and average turn duration.
- Treat subagents as an additional first-class section; do not replace or merge the existing metrics.
- When subagents.total > 0, include SubAgent count and success rate in the headline metrics and render an "Agent Processes" section.
- Each Agent Processes record must be a compact overview row showing Application, six-character Agent ID, visible state text, duration, taskSummary, and outcomeSummary.
- Render taskSummary and outcomeSummary as single-line text. Do NOT use "Input:" or "Result:" labels.
- Do NOT copy full SubAgent input/output, render multi-paragraph Agent prose, create transcript-style blocks, or provide expandable Agent details.
- Full SubAgent execution detail belongs exclusively in Chat Agent Activity and must not be duplicated in Dashboard.
- Failed, terminated, and killed records must use the error semantic colors plus visible status text; never communicate failure by color alone.
- Label totalDurationFormatted as "Delegated time" and keep it distinct from Session active time because parallel Agents may overlap.
- When subagents.total is 0, retain the Agent section with an explicit "Main Agent only" empty state.`;

export function buildSessionDashboardUserPrompt(sessionSummary: string): string {
  return `Create a rich visual dashboard for this coding session. Use the data below to build a comprehensive, beautiful dashboard:

${sessionSummary}

${SESSION_DASHBOARD_VISUAL_REQUIREMENTS}

Make it visually rich with clear hierarchy, progress bars, color-coded metrics, and CSS charts.`;
}

export interface WebUiOptions {
  port: number;
  harness: HarnessAPI;
  projectRoot?: string;
  webRoot: string;
}

/**
 * Creates an HTTP server + WebSocket server, serves the SPA,
 * and translates all UI callbacks into WebSocket events.
 */
export class WebUiBackend implements UiBackend {
  private port: number;
  private harness: HarnessAPI;
  private httpServer: ReturnType<typeof createServer>;
  private wsServer: WsServer;
  private currentClient: WebSocketClient | null = null;
  private exitPromise!: Promise<void>;
  private exitResolve!: () => void;
  private appResourceProxy?: McpAppResourceProxy;
  private sessionTimeInterval: ReturnType<typeof setInterval> | null = null;

  // Pending permission state
  private permissionResolve: ((result: PermissionPromptResult) => void) | null = null;
  private currentPermissionTool: string = "";
  private currentPermissionArgs: unknown = null;
  private currentPermissionPreview: string = "";

  // Image state
  private pendingImages: ImageContent[] = [];

  // Message accumulation for the current assistant turn
  private currentAssistant: {
    thinking: string;
    text: string;
    tools: ToolCallEntry[];
  } | null = null;

  // Context window broadcast throttling
  private contextWindowThrottleTimer: ReturnType<typeof setTimeout> | null = null;
  private contextWindowThrottlePending: boolean = false;
  private lastArtifactHtml: string = "";
  private isAssistantTurn: boolean = false;
  private syntheticToolCallSequence = 0;
  private readonly agentActivityProjector: AgentActivityProjector;
  private readonly webRoot: string;

  private get config(): PublicRuntimeConfigSnapshot {
    return this.harness.settings.get();
  }

  private cleanupUploadDir(sessionId: string): void {
    const uploadDir = join(this.config.projectPath, ".dscode", "uploads", sessionId);
    if (existsSync(uploadDir)) {
      try {
        rmSync(uploadDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  constructor(options: WebUiOptions) {
    this.port = options.port;
    this.harness = options.harness;
    this.webRoot = options.webRoot;

    this.wsServer = new WsServer();

    // Create HTTP server
    this.httpServer = createServer((req, res) => {
      this.handleHttpRequest(req, res);
    });

    // Attach WebSocket
    this.wsServer.attach(this.httpServer);

    // Set WebSocket handlers
    this.wsServer.onConnectHandler = (client) => this.handleConnect(client);
    this.wsServer.onDisconnectHandler = (_client) => this.handleDisconnect();
    this.wsServer.onMessageHandler = (client, cmd) => {
      void this.handleMessage(client, cmd).catch((error) => {
        client.send({
          type: "error",
          text: error instanceof Error ? error.message : String(error),
        });
      });
    };

    // ── Event bus subscriptions ──
    const h = this.harness;
    this.agentActivityProjector = new AgentActivityProjector(
      h.agents,
      () => h.sessions.currentId(),
      (activity) => this.broadcast({ type: "agent_activity", activity }),
    );
    const projectAgentActivity = (event: Parameters<AgentActivityProjector["handle"]>[0]) => {
      this.agentActivityProjector.handle(event);
    };
    const projectConversationEvent = (
      event: Parameters<typeof harnessEventToConversationEvent>[0],
    ) => harnessEventToConversationEvent(event, {
      sessionId: h.sessions.currentId(),
    });

    h.events.on("llm:thinking:delta", (e) => {
      const projected = projectConversationEvent(e);
      if (projected) this.broadcast(projected);
    });
    h.events.on("llm:text:delta", (e) => {
      if (this.currentAssistant && e.delta != null) this.currentAssistant.text += e.delta;
      const projected = projectConversationEvent(e);
      if (projected) this.broadcast(projected);
    });
    h.events.on("llm:retry", (e) => { this.broadcast({ type: "retry", info: { attempt: e.attempt, maxRetries: e.maxRetries, delayMs: e.delayMs, error: e.error, level: e.level } }); });
    h.events.on("tool:start", (e) => {
      const projected = projectConversationEvent(e);
      if (projected?.type !== "tool_start") return;
      this.currentAssistant?.tools.push({
        toolCallId: e.toolCallId,
        name: e.name,
        args: "",
        result: "",
        isError: false,
      });
      this.broadcast(projected);
    });
    h.events.on("tool:end", (e) => {
      const projected = projectConversationEvent(e);
      if (projected?.type !== "tool_end") return;
      if (this.currentAssistant) {
        const index = this.currentAssistant.tools.findIndex(
          (tool) => tool.toolCallId === e.toolCallId,
        );
        const completed: ToolCallEntry = {
          toolCallId: e.toolCallId,
          name: e.name,
          args: index >= 0 ? this.currentAssistant.tools[index].args : "",
          result: projected.result,
          resultDetail: projected.resultDetail,
          isError: e.isError,
          images: projected.images,
        };
        if (index >= 0) this.currentAssistant.tools[index] = completed;
        else this.currentAssistant.tools.push(completed);
      }
      this.broadcast(projected);
      this.broadcastContextWindow(false);    });
    h.events.on("turn:streaming:start", () => {
      this.currentAssistant = { thinking: "", text: "", tools: [] };
      const projected = projectConversationEvent({ type: "turn:streaming:start" });
      if (projected) this.broadcast(projected);
      this.startSessionTimeBroadcast();
      this.isAssistantTurn = true;    });
    h.events.on("turn:end", (event) => {
      this.broadcastSessionTime();
      const toolsForBroadcast = this.currentAssistant?.tools ?? [];
      this.currentAssistant = null;
      const projected = projectConversationEvent(event);
      if (projected) this.broadcast(projected);
      this.isAssistantTurn = false;
      this.broadcastContextWindow(true, toolsForBroadcast);
      this.pushSessionListToAll();
    });
    h.events.on("turn:abort", () => { this.stopSessionTimeBroadcast(); this.broadcast({ type: "loader", state: "hide" }); });
    h.events.on("turn:error", (e) => { this.broadcast({ type: "error", text: e.error }); });
    h.events.on("processing:start", () => { this.broadcast({ type: "loader", state: "show", text: "Thinking..." }); });
    h.events.on("processing:stop", () => { this.stopSessionTimeBroadcast(); this.broadcast({ type: "loader", state: "hide" }); });
    h.events.on("agent:spawned", projectAgentActivity);
    h.events.on("agent:state", projectAgentActivity);
    h.events.on("agent:progress", projectAgentActivity);
    h.events.on("agent:output", projectAgentActivity);
    h.events.on("agent:exit", projectAgentActivity);
    h.events.on("eval:dashboard", (event) => {
      this.broadcast(projectEvalDashboardState(event.state));
    });
    h.events.on("message:user", (e) => {
      const projected = projectConversationEvent(e);
      if (projected) this.broadcast(projected);
    });
    h.events.on("ui:info", (e) => { this.broadcast({ type: "info", text: e.text, display: e.display ?? "toast" }); });
    h.events.on("ui:error", (e) => { this.broadcast({ type: "error", text: e.text }); });
    h.events.on("ui:warning", (e) => { this.broadcast({ type: "warning", text: e.text }); });
    h.events.on("ui:image:pending", (e) => { this.pendingImages.push(e.image); });
    h.events.on("ui:conversation:clear", (event) => {
      this.currentAssistant = null;
      this.pendingImages = [];
      const projected = projectConversationEvent(event);
      if (projected) this.broadcast(projected);
      this.broadcastContextWindow(true);
    });
    h.events.on("config:change", () => {
      this.broadcast({ type: "config", data: this.buildConfigData() });
    });
    h.events.on("mcp:state", () => { this.pushMcpState(); });
    h.events.on("mcp:browser:open", () => { this.pushMcpState(); this.broadcast({ type: "mcp_open_browser" }); });
    h.events.on("mcp:tool:progress", (e) => { this.broadcast({ type: "tool_progress", name: e.toolName, progress: e.progress, total: e.total, message: e.message }); });
    h.events.on("session:saved", () => { this.pushSessionListToAll(); });
    h.events.on("session:created", () => { this.pushSessionListToAll(); });
    h.events.on("session:deleted", () => { this.pushSessionListToAll(); });
  }

  setAppResourceProxy(proxy: McpAppResourceProxy): void {
    this.appResourceProxy = proxy;
  }

  // ── UiBackend Lifecycle ──

  async start(): Promise<void> {
    this.exitPromise = new Promise<void>((resolve) => {
      this.exitResolve = resolve;
    });

    return new Promise((resolve, reject) => {
      this.httpServer.on("error", (err: NodeJS.ErrnoException) => {
        if (err.code === "EADDRINUSE") {
          console.log("");
          console.log(`  \u001b[33m⚠ Port ${this.port} is already in use.\u001b[0m`);
          console.log(`  Try a different port: \u001b[36mnode ./dist/dscode.mjs --web --web-port ${this.port + 1}\u001b[0m`);
          console.log(`  Or kill the existing process: \u001b[36mlsof -ti:${this.port} | xargs kill\u001b[0m`);
          console.log("");
          this.exitResolve();
          resolve();
          return;
        }
      });
      this.httpServer.listen(this.port, () => {
        console.log(`
  DSCode Web UI ready at http://localhost:${this.port}
`);
        resolve();
      });
    });
  }

  async waitForExit(): Promise<void> {
    return this.exitPromise;
  }

  async shutdown(): Promise<void> {
    this.wsServer.broadcast({ type: "error", text: "Server shutting down" });
    this.httpServer.close();
    if (this.exitResolve) this.exitResolve();
  }

  // ── UiBackend Conversation ──

  addUserMessage(text: string): void {
    // Images are sent separately via the chat command path
    this.broadcast({ type: "user_message", text });
  }

  startAssistantMessage(): void {
    this.currentAssistant = { thinking: "", text: "", tools: [] };
    this.broadcast({ type: "assistant_start" });
    this.startSessionTimeBroadcast();
  }



  thinkingDelta(delta: string): void {
    if (this.currentAssistant && delta != null) {
      this.currentAssistant.thinking += delta;
    }
    this.broadcast({ type: "thinking_delta", delta });
  }

  textDelta(delta: string): void {
    if (this.currentAssistant && delta != null) {
      this.currentAssistant.text += delta;
    }
    this.broadcast({ type: "text_delta", delta });
  }

  toolStart(name: string, args: unknown, toolCallId?: string): void {
    this.broadcast({
      type: "tool_start",
      toolCallId: toolCallId ?? `legacy-${++this.syntheticToolCallSequence}`,
      name,
      args,
    });
  }

  finishAssistantMessage(): void {
    this.broadcastSessionTime();
    this.stopSessionTimeBroadcast();
    const toolsForBroadcast2 = this.currentAssistant?.tools ?? [];
    this.currentAssistant = null;
    this.broadcast({ type: "assistant_end" });
    this.broadcastContextWindow(true, toolsForBroadcast2);

    {
      const sessions2 = this.harness.sessions.list();
      const currentId2 = this.harness.sessions.currentId();
      let sessionList2 = [...sessions2];
      if (currentId2) {
        const currentMeta = this.harness.sessions.currentMetadata();
        if (currentMeta && !sessionList2.find((s: any) => s.id === currentId2)) {
          sessionList2 = [currentMeta, ...sessionList2];
        }
      }
      this.wsServer.broadcast({
        type: "sessions",
        currentSessionId: currentId2 ?? undefined,
        data: sessionList2.slice(0, 50).map((s: any) => ({
          id: s.id, title: s.title, updatedAt: s.updatedAt, createdAt: s.createdAt,
          messageCount: s.messageCount, modelProvider: s.modelProvider, modelId: s.modelId,
          projectPath: s.projectPath || "", preview: s.preview || "",
          totalActiveMs: s.id === currentId2 ? this.harness.sessions.totalActiveMs() : (s.totalActiveMs ?? 0),
          contentHash: s.contentHash ?? "",
          pendingPermission: s.pendingPermission || undefined,
        })),

      });
    }  }

  private startSessionTimeBroadcast(): void {
    if (this.sessionTimeInterval) return;
    this.sessionTimeInterval = setInterval(() => {
      const tickMs = this.harness.sessions.totalActiveMs();
      this.wsServer.broadcast({
        type: "session_time",
        totalActiveMs: tickMs,
      });
    }, 1000);
  }

  private broadcastSessionTime(): void {
    this.wsServer.broadcast({
      type: "session_time",
      totalActiveMs: this.harness.sessions.totalActiveMs(),
    });
  }

  private stopSessionTimeBroadcast(): void {
    if (this.sessionTimeInterval) {
      clearInterval(this.sessionTimeInterval);
      this.sessionTimeInterval = null;
    }
  }

  // ── UiBackend System Messages ──

  addInfo(text: string, display: "toast" | "panel" = "toast"): void {
    this.broadcast({ type: "info", text, display });
  }

  addError(text: string): void {
    this.broadcast({ type: "error", text });
  }

  addWarning(text: string): void {
    this.broadcast({ type: "warning", text });
  }
  addRetry(info: { attempt: number; maxRetries: number; delayMs: number; error: string; level: "stream" | "turn" }): void {
    this.broadcast({ type: "retry", info });
  }

  // ── MCP App Notification (called by Harness when app is registered) ──

  addAppNotification(app: AppInstance): void {
    // Build URL relative to the web server — proxy through the main server
    const appUrl = `/mcp-app/${app.id}`;
    const appInfo: McpAppInfo = {
      toolName: `mcp_${app.serverName}_${app.toolName}`,
      appUrl,
      resourceUri: app.resourceUri,
    };
    this.broadcast({ type: "mcp_app", app: appInfo });
  }

  // ── UiBackend Permission ──

  getPromptPermission(): (
    toolName: string,
    preview: string,
    args: unknown,
    context?: PermissionPromptContext,
  ) => Promise<PermissionPromptResult> {
    return (toolName, preview, args, context) => {
      return new Promise<PermissionPromptResult>((resolve) => {
        this.currentPermissionTool = toolName;
        this.currentPermissionArgs = args;
        this.currentPermissionPreview = preview;
        this.permissionResolve = resolve;
        const fuzzyInfo = this.harness.permissions.fuzzy(toolName, args);
        const fuzzy = fuzzyInfo.toolPattern;
        const fuzzyArgDesc = fuzzyInfo.argDescription;
        const llmSuggestions = this.harness.permissions.suggestions(
          toolName,
          args,
        );
        this.broadcast({
          type: "permission_prompt",
          toolName,
          preview,
          agentId: context?.agentId,
          toolCallId: context?.toolCallId,
          fuzzyPattern: fuzzy,
          fuzzyArgDesc,
          llmSuggestions: llmSuggestions.length > 0
            ? [...llmSuggestions]
            : undefined,
        });
        // Prefetch for next time
        this.harness.permissions.prefetchSuggestions(toolName, args, preview);
      });
    };
  }

  // ── UiBackend Image ──

  addPendingImage(image: ImageContent): void {
    this.pendingImages.push(image);
  }

  // ── UiBackend Editor ──

  focusEditor(): void {
    // No-op in web mode
  }

  clearConversationView(): void {
    const toolsForBroadcast3 = this.currentAssistant?.tools ?? [];
    this.currentAssistant = null;
    this.pendingImages = [];
    this.broadcast({ type: "clear_conversation" });
    this.broadcastContextWindow(true, toolsForBroadcast3);
  }

  replayMessages(_messages: unknown[]): void {
    const model = this.harness.conversation.snapshot().modelName;
    this.broadcast({
      type: "ready",
      model,
      config: this.buildConfigData(),
      messages: this.buildConversationHistory(),
    });
    this.broadcastContextWindow(true);
  }

  takePendingPermission(): PendingPermission | undefined {
    if (this.permissionResolve) {
      const pendingPermission = {
        toolName: this.currentPermissionTool,
        preview: this.currentPermissionPreview,
        fuzzyPattern: this.harness.permissions.fuzzy(
          this.currentPermissionTool,
        ).toolPattern,
        permissionArgs: this.currentPermissionArgs,
      };
      this.permissionResolve({ decision: "deny" });
      this.permissionResolve = null;
      return pendingPermission;
    }
    return this.harness.sessions.currentMetadata()?.pendingPermission;
  }

  // ── UiBackend Processing ──

  setProcessing(processing: boolean): void {
    this.broadcast({
      type: "loader",
      state: processing ? "show" : "hide",
      text: processing ? "Thinking..." : undefined,
    });
  }

  // ── UiBackend MCP ──

  private mutableMcpSnapshot(): McpServerInfo[] {
    return this.harness.mcp.list().map((server) => ({
      ...server,
      tools: server.tools.map((tool) => ({ ...tool })),
    }));
  }

  pushMcpState(): void {
    this.broadcast({ type: "mcp_state", servers: this.mutableMcpSnapshot() });
  }

  pushSkillState(_client?: WebSocketClient): void {
    const skills = this.harness.skills.list().map((skill) => ({
      name: skill.name,
      description: skill.description,
      active: skill.active,
      source: skill.source,
      toolsCount: skill.toolNames.length,
    }));
    const event = { type: "skill_state" as const, skills };
    this.wsServer.broadcast(event);
  }

  openMcpBrowser(): void {
    // Signal the frontend to open the MCP panel
    this.pushMcpState();
    this.broadcast({ type: "mcp_open_browser" });
  }

  // ── UiBackend Config Watch ──

  onConfigChange(): void {
    this.broadcast({ type: "config", data: this.buildConfigData() });
  }
  // ── Private: WebSocket handling ──

  private handleConnect(client: WebSocketClient): void {
    this.currentClient = client;

    const configData = this.buildConfigData();
    const messages = this.buildConversationHistory();
    const model = this.harness.conversation.snapshot().modelName;

      client.send({
      type: "ready",
      model,
      config: configData,
      messages,
    });
    this.broadcastContextWindow(true);
    if (this.harness.mcp.list().length > 0) {
      this.pushMcpState();
    }
    this.pushSkillState(client);
  }

  private handleDisconnect(): void {
    if (this.currentClient) {
      this.currentClient = null;
    }
    if (this.permissionResolve) {
      this.permissionResolve({ decision: "deny" });
      this.permissionResolve = null;
    }
  }

  private async handleMessage(client: WebSocketClient, cmd: ClientCommand): Promise<void> {
    switch (cmd.type) {
      case "chat": {
        const displayText = cmd.text;
        let text = cmd.text;
        let images = cmd.images;

        if (text.startsWith("/")) {
          const firstWord = text.slice(1).split(/\s+/)[0];
          const knownCommands = getSlashCommandAutocomplete(this.harness.commands.list()).map(c => c.name);
          if (knownCommands.includes(firstWord)) {
            this.pendingImages = [];
            await this.handleSlashCommand(client, text);
            break;
          }
        }
        const resolved = this.harness.project.resolveAtFiles(text);
        if (resolved.reject) {
          client.send({ type: "error", text: resolved.warnings.map(w => `@${w.path ?? ""}: ${w.type}${w.detail ? ` — ${w.detail}` : ""}`).join("\n") });
          return;
        }
        text = resolved.text;
        if (resolved.images.length > 0) {
          const atImages = resolved.images.map((img) => ({
            data: img.data,
            mimeType: img.mimeType,
          }));
          images = [...(images ?? []), ...atImages];
        }
        for (const warn of resolved.warnings) {
          client.send({ type: "info", display: "toast", text: `@${warn.path ?? ""}: ${warn.type}${warn.detail ? ` — ${warn.detail}` : ""}` });
        }
        // Handle uploaded files from web drag-and-drop (browser-read content → temp files)
        if (cmd.uploadedFiles && cmd.uploadedFiles.length > 0) {
          const sessionId = this.harness.sessions.currentId() ?? "default";
          const ts = Date.now();
          const uploadDir = join(this.config.projectPath, ".dscode", "uploads", sessionId);
          mkdirSync(uploadDir, { recursive: true });
          const tempPaths: string[] = [];
          for (const uf of cmd.uploadedFiles) {
            const tempName = `${ts}-${uf.name}`;
            const tempPath = join(uploadDir, tempName);
            writeFileSync(tempPath, Buffer.from(uf.content, "base64"));
            tempPaths.push(tempPath);
          }
          if (tempPaths.length > 0) {
            const pathLines = tempPaths.map(p => `- \`${p}\``).join('\n');
            text = text ? `${text}\n\n📁 Attached files:\n${pathLines}` : `📁 Attached files:\n${pathLines}`;
          }
        }

        // Stage explicit filesystem attachments inside the project sandbox so
        // Main and SubAgents can read the same paths.
        if (cmd.fileRefs && cmd.fileRefs.length > 0) {
          let stagedFileRefs: string[];
          try {
            stagedFileRefs = stageAttachedFiles(
              this.config.projectPath,
              this.harness.sessions.currentId() ?? "default",
              cmd.fileRefs,
            );
          } catch (error) {
            client.send({
              type: "error",
              text: error instanceof Error ? error.message : String(error),
            });
            return;
          }
          const imageRefs = stagedFileRefs.filter((file) =>
            this.harness.project.isImagePath(file)
          );
          const pathLines = stagedFileRefs.map(f => `- \`${f}\``).join('\n');
          text = text
            ? `${text}\n\n📁 Attached files:\n${pathLines}`
            : `📁 Attached files:\n${pathLines}`;
          if (imageRefs.length > 0) {
            const refsResolved = this.harness.project.resolveFiles(imageRefs);
            if (!refsResolved.reject) {
              if (refsResolved.text) {
                text = text ? `${text}\n\n${refsResolved.text}` : refsResolved.text;
              }
              if (refsResolved.images.length > 0) {
                const refImages = refsResolved.images.map((img) => ({
                  data: img.data,
                  mimeType: img.mimeType,
                }));
                images = [...(images ?? []), ...refImages];
              }
            }
            for (const warn of refsResolved.warnings) {
              client.send({ type: "info", display: "toast", text: `${warn.path ?? ""}: ${warn.type}${warn.detail ? ` — ${warn.detail}` : ""}` });
            }
          }
        }
        // Broadcast user message to client before sending to agent
        client.send({ type: "user_message", text: displayText, images: images && images.length > 0 ? images : undefined } as any);
        this.pushSessionList(client);

        try {
          if (images && images.length > 0) {
            const imageContents: ImageContent[] = images.map((img) => ({
              type: "image" as const,
              data: img.data,
              mimeType: img.mimeType,
            }) as ImageContent);
            this.pendingImages = [];
            await this.harness.conversation.promptWithImages(
              text,
              imageContents,
              displayText,
            );
          } else {
            this.pendingImages = [];
            await this.harness.conversation.prompt(text);
          }
        } catch (err) {
          this.harness.conversation.save();
          client.send({
            type: "error",
        text: err instanceof Error ? err.message : String(err),
          });
        }
        this.pushSessionList(client);

        break;
      }

      case "abort": {
        this.harness.conversation.abort();
        // Save pending permission to session metadata before denying,
        // so the session switch flow can detect and restore it.
        if (this.permissionResolve) {
          const meta = this.harness.sessions.currentMetadata();
          if (meta) {
            const fuzzy = this.harness.permissions.fuzzy(
              this.currentPermissionTool,
            ).toolPattern;
            const pendingPermission = {
              toolName: this.currentPermissionTool,
              preview: this.currentPermissionPreview,
              fuzzyPattern: fuzzy,
              permissionArgs: this.currentPermissionArgs,
            };
            this.harness.sessions.save(pendingPermission);
          }
          this.permissionResolve({ decision: "deny" });
          this.permissionResolve = null;
        }
        break;
      }
      case "permission_response": {
        if (this.permissionResolve && cmd.denyReason) {
          const resolve = this.permissionResolve;
          this.permissionResolve = null;
          resolve({
            decision: "deny",
            denyReason: `User updated the request during permission review: ${cmd.denyReason}`,
          });
          client.send({ type: "user_message", text: cmd.denyReason });
          this.harness.conversation.prompt(cmd.denyReason).catch((err: unknown) => {
            client.send({
              type: "error",
              text: err instanceof Error ? err.message : String(err),
            });
      client.send({ type: "loader", state: "hide" });
          });
        }
        break;
      }

      case "permission": {
        if (this.permissionResolve) {
          const resolve = this.permissionResolve;
          this.permissionResolve = null;
          const isAlways = cmd.decision === "always_allow" || cmd.decision === "always_allow_save";
          const isSave = cmd.decision === "always_allow_save";
          const isSessionGrant = (cmd.decision === "always_allow" && !isSave) || (cmd.decision === "allow" && !!cmd.sessionGrantPattern);
          const sessionPattern = cmd.sessionGrantPattern;
          resolve({
            decision: isAlways ? "allow" : cmd.decision as "allow" | "deny",
            rememberForSession: isAlways,
            sessionGrantPattern: isSessionGrant ? sessionPattern : undefined,
            persistRule: isSave
              ? (() => {
                  const mode = cmd.fuzzyMode ?? 0;
                  if (mode === 2) {
                    const fuzzyArg = this.harness.permissions.fuzzy(
                      this.currentPermissionTool,
                      this.currentPermissionArgs,
                    ).argPattern;
                    return fuzzyArg
                      ? { tool: this.currentPermissionTool, argPattern: fuzzyArg, decision: "allow" as const }
                      : { tool: this.currentPermissionTool, decision: "allow" as const };
                  }
                  if (mode >= 3) {
                    try {
                      const p = JSON.parse(cmd.toolNamePattern || "{}");
                      return {
                        tool: p.toolPattern ?? this.currentPermissionTool,
                        argPattern: p.argPattern ?? undefined,
                        decision: "allow" as const,
                      };
                    } catch { /* fall through */ }
                  }
                  if (mode === 1) {
                    return { tool: cmd.toolNamePattern ?? this.currentPermissionTool, decision: "allow" as const };
                  }
                  return { tool: this.currentPermissionTool, decision: "allow" as const };
                })()
              : undefined,
          });
        } else {
          const meta = this.harness.sessions.currentMetadata();
          if (meta?.pendingPermission && (cmd.decision === "allow" || cmd.decision === "always_allow")) {
            const toolName = meta.pendingPermission.toolName;
            this.harness.permissions.grantForSession(toolName);
            this.harness.sessions.clearPendingPermission();
            const messages = this.harness.conversation.snapshot().messages;
            let lastUserText = "";
            for (let i = messages.length - 1; i >= 0; i--) {
              const message = messages[i] as {
                role?: unknown;
                content?: unknown;
              };
              if (message.role === "user") {
                const c = message.content;
                if (typeof c === "string") { lastUserText = c; }
                else if (Array.isArray(c)) {
                  const tb = c.find((b: any) => b.type === "text");
                  if (tb) lastUserText = tb.text;
                }
                break;
              }
            }
            if (lastUserText) {
              client.send({ type: "loader", state: "show", text: "Resuming..." });
              this.harness.conversation.prompt(lastUserText).catch((err: any) => {
                client.send({ type: "error", text: err instanceof Error ? err.message : String(err) });
                client.send({ type: "loader", state: "hide" });
              });
            }
          } else if (meta?.pendingPermission && cmd.decision === "deny") {
            this.harness.sessions.clearPendingPermission();
          }
        }
        break;
      }
      case "slash": {
        await this.handleSlashCommand(client, cmd.command);
        break;
      }

      case "config": {
        this.handleConfig(client, cmd);
        break;
      }

      case "session": {
        await this.handleSession(client, cmd);
        break;
      }

      case "file_list": {
        const items = this.harness.project.listFiles(cmd.prefix);
        client.send({
          type: "file_list_result" as any,
          prefix: cmd.prefix,
          items: [...items],
        });
        break;
      }
      case "artifact": {
        await this.handleArtifact(client, cmd as ClientCommand & { type: "artifact"; action: "generate" | "update"; context?: string; instruction?: string });
        break;
      }
      case "cache": {
        this.handleCache(client, cmd as ClientCommand & { type: "cache"; action: "size" | "clear" });
        break;
      }
      case "mcp": {
        this.handleMcp(client, cmd);
        break;
      }
      case "skill": {
        await this.handleSkill(client, cmd);
        break;
      }
    }
  }

  private handleCache(client: WebSocketClient, cmd: ClientCommand & { type: "cache"; action: "size" | "clear" }): void {
    const uploadsDir = join(this.config.projectPath, ".dscode", "uploads");

    if (cmd.action === "clear") {
      if (existsSync(uploadsDir)) {
        try {
          rmSync(uploadsDir, { recursive: true, force: true });
        } catch {
          // Ignore cleanup errors
        }
      }
      client.send({ type: "cache_size", totalBytes: 0, fileCount: 0, sessionCount: 0 });
      return;
    }

    // action === "size"
    let totalBytes = 0;
    let fileCount = 0;
    let sessionCount = 0;

    if (existsSync(uploadsDir)) {
      const sessionDirs = readdirSync(uploadsDir, { withFileTypes: true })
        .filter((d) => d.isDirectory());
      sessionCount = sessionDirs.length;

      for (const dir of sessionDirs) {
        const sessionPath = join(uploadsDir, dir.name);
        const files = readdirSync(sessionPath, { withFileTypes: true });
        for (const f of files) {
          if (f.isFile()) {
            try {
              const st = statSync(join(sessionPath, f.name));
              totalBytes += st.size;
              fileCount++;
            } catch {
              // skip
            }
          }
        }
      }
    }

    client.send({ type: "cache_size", totalBytes, fileCount, sessionCount });
  }

  private async handleSlashCommand(client: WebSocketClient, text: string): Promise<void> {
    try {
      const executed = await executeSlashCommand(text, { harness: this.harness, ui: this });
      if (executed) {
        // Push updated session list so sidebar auto-refreshes
        this.pushSessionList(client);
        client.send({ type: "loader", state: "hide" });
        setTimeout(() => {
          client.send({ type: "config", data: this.buildConfigData() });
        }, 100);
        return;
      }

      // Check custom commands
      const expanded = resolveCustomCommand(text, {
        harness: this.harness,
        ui: this,
      });
      if (expanded !== undefined) {
        this.pendingImages = [];
        // Set title hint with user's actual input so title extraction uses it
        const cmdArgs = text.slice(text.indexOf(" ") + 1).trim();
        if (cmdArgs) this.harness.sessions.setTitleIntent(cmdArgs);

        client.send({ type: 'user_message', text: expanded } as any);
        await this.harness.conversation.prompt(expanded).catch((err: any) => {
          client.send({
            type: 'error',
            text: err instanceof Error ? err.message : String(err),
          });
        });
        this.pushSessionList(client);
        client.send({ type: "loader", state: "hide" });
        setTimeout(() => {
          client.send({ type: "config", data: this.buildConfigData() });
        }, 100);
        return;
      }

      // Not a known command — treat as regular chat message
      this.pendingImages = [];
      client.send({ type: 'user_message', text } as any);
      await this.harness.conversation.prompt(text).catch((err: any) => {
        client.send({
          type: 'error',
          text: err instanceof Error ? err.message : String(err),
        });
      });

      this.pushSessionList(client);
      client.send({ type: "loader", state: "hide" });
      setTimeout(() => {
        client.send({ type: "config", data: this.buildConfigData() });
      }, 100);
    } catch (err) {
      client.send({
        type: "error",
        text: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private pushSessionList(client: WebSocketClient): void {
    const sessions = this.harness.sessions.list();
    const currentId = this.harness.sessions.currentId();
    // Always include the current session even if it has no messages yet
    let sessionList = [...sessions];
    if (currentId) {
      const currentMeta = this.harness.sessions.currentMetadata();
      if (currentMeta && !sessionList.find((s: any) => s.id === currentId)) {
        sessionList = [currentMeta, ...sessionList];
      }
    }
    client.send({
      type: "sessions",
      currentSessionId: currentId,
      data: sessionList.slice(0, 50).map((s: any) => ({
        id: s.id,
        title: s.title,
        updatedAt: s.updatedAt,
        createdAt: s.createdAt,
        messageCount: s.messageCount,
        modelProvider: s.modelProvider,
        modelId: s.modelId,
        projectPath: s.projectPath || "",
        preview: s.preview || "",
        totalActiveMs: s.id === currentId ? this.harness.sessions.totalActiveMs() : (s.totalActiveMs ?? 0),
        contentHash: s.contentHash ?? "",
        pendingPermission: s.pendingPermission || undefined,
      })),
    });
  }

  private pushSessionListToAll(): void {
    const sessions = this.harness.sessions.list();
    const currentId = this.harness.sessions.currentId();
    let sessionList = [...sessions];
    if (currentId) {
      const currentMeta = this.harness.sessions.currentMetadata();
      if (currentMeta && !sessionList.find((s: any) => s.id === currentId)) {
        sessionList = [currentMeta, ...sessionList];
      }
    }
    this.wsServer.broadcast({
      type: "sessions",
      currentSessionId: currentId,
      data: sessionList.slice(0, 50).map((s: any) => ({
        id: s.id, title: s.title, updatedAt: s.updatedAt, createdAt: s.createdAt,
        messageCount: s.messageCount, modelProvider: s.modelProvider, modelId: s.modelId,
        projectPath: s.projectPath || "", preview: s.preview || "",
        totalActiveMs: s.id === currentId ? this.harness.sessions.totalActiveMs() : (s.totalActiveMs ?? 0),
        contentHash: s.contentHash ?? "",
        pendingPermission: s.pendingPermission || undefined,
      })),
    });
  }

  private async handleConfig(
    client: WebSocketClient,
    cmd: ClientCommand & { type: "config" },
  ): Promise<void> {
    try {
      switch (cmd.action) {
        case "set_model": {
          await this.harness.settings.setModel(cmd.value);
          const modelName = this.harness.conversation.snapshot().modelName;
          client.send({ type: "config", data: this.buildConfigData() });
          client.send({ type: "model", name: modelName });
          client.send({ type: "info", display: "toast", text: `Model set to ${cmd.value}` });
          break;
        }
        case "set_thinking": {
          await this.harness.settings.setThinking(cmd.value);
          client.send({ type: "config", data: this.buildConfigData() });
          client.send({ type: "info", display: "toast", text: `Thinking level set to ${cmd.value}` });
          break;
        }
        case "set_key": {
          await this.harness.settings.setApiKey(cmd.value);
          client.send({ type: "config", data: this.buildConfigData() });
          client.send({ type: "info", display: "toast", text: "API key updated" });
          break;
        }
        case "set_provider": {
          await this.harness.settings.setProvider(cmd.value);
          client.send({ type: "config", data: this.buildConfigData() });
          const mn = this.harness.conversation.snapshot().modelName;
          client.send({ type: "model", name: mn });
          client.send({ type: "info", display: "toast", text: `Provider set to: ${cmd.value}. Restart required for full effect.` });
          break;
        }
        case "set_vision_provider": {
          const vp = cmd.value;
          await this.harness.settings.setVisionProvider(vp);
          client.send({ type: "config", data: this.buildConfigData() });
          client.send({ type: "info", display: "toast", text: `Vision provider set to: ${vp}` });
          break;
        }
        case "set_vision_model": {
          const vm = cmd.value;
          await this.harness.settings.setVisionModel(vm);
          client.send({ type: "config", data: this.buildConfigData() });
          client.send({ type: "info", display: "toast", text: `Vision model set to: ${vm}` });
          break;
        }
        case "set_vision_key": {
          const vk = cmd.value;
          await this.harness.settings.setVisionKey(vk);
          client.send({ type: "config", data: this.buildConfigData() });
          client.send({ type: "info", display: "toast", text: "Vision API key updated" });
          break;
        }
        case "set_vision_delete": {
          await this.harness.settings.clearVision();
          client.send({ type: "config", data: this.buildConfigData() });
          client.send({ type: "info", display: "toast", text: "Vision model configuration removed" });
          break;
        }
        case "set_project_path": {
          const cwd = cmd.value;
          if (!cwd) {
            client.send({ type: "error", text: "Project path is required." });
            break;
          }
          const result = await this.harness.project.setPath(cwd);
          if (result.success) {
            client.send({ type: "config", data: this.buildConfigData() });
            this.pushSessionList(client);
            client.send({ type: "info", display: "toast", text: `Project path set to: ${cwd}` });
          } else {
            client.send({ type: "error", text: result.error ?? "Failed to change project path" });
          }
          break;
        }
      }
    } catch (err) {
      client.send({
        type: "error",
        text: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private async handleSession(
    client: WebSocketClient,
    cmd: ClientCommand & { type: "session" },
  ): Promise<void> {
    switch (cmd.action) {
      case "list": {
        const sessions = this.harness.sessions.list();
        const data: SessionInfo[] = sessions.slice(0, 50).map((s: any) => ({
          id: s.id,
          title: s.title,
          updatedAt: s.updatedAt,
          createdAt: s.createdAt,
          messageCount: s.messageCount,
          modelProvider: s.modelProvider,
          modelId: s.modelId,
          projectPath: s.projectPath || "",
          preview: s.preview || "",
          totalActiveMs: s.totalActiveMs ?? 0,
          contentHash: s.contentHash ?? "",
        }));
        client.send({ type: "sessions", data });
        break;
      }
      case "save": {
        try {
          this.harness.sessions.save();
          client.send({ type: "info", display: "toast", text: "Session saved." });
        } catch (err: any) {
          client.send({ type: "error", text: `Failed to save session: ${err.message}` });
          return;
        }
        const sessions = this.harness.sessions.list();
        client.send({
          type: "sessions",
          data: sessions.slice(0, 50).map((s: any) => ({
            id: s.id,
            title: s.title,
            updatedAt: s.updatedAt,
            createdAt: s.createdAt,
            messageCount: s.messageCount,
            modelProvider: s.modelProvider,
            modelId: s.modelId,
            projectPath: s.projectPath || "",
            preview: s.preview || "",
            totalActiveMs: s.totalActiveMs ?? 0,
            contentHash: s.contentHash ?? "",
          })),
        });
        break;
      }
      case "load": {
        if (!cmd.id) {
          client.send({ type: "error", text: "Session ID required." });
          return;
        }
        const result = await this.harness.sessions.switch({
          sessionIdOrPrefix: cmd.id,
          pendingPermission: this.takePendingPermission(),
        });
        const match = result.session;
        // If loaded session has pendingPermission, clean up the aborted turn
        // from agent.state.messages so the conversation looks clean.
        const loadedMeta = this.harness.sessions.currentMetadata();
        let messages = result.messages;
        if (loadedMeta?.pendingPermission) {
          messages = [...this.harness.conversation.discardPendingToolCall()];
        }
        client.send({
          type: "info",
          display: "toast",
          text: [
            `Loaded session: ${match.id.slice(0, 8)}`,
            `  Title:    "${match.title}"`,
            `  Model:    ${match.modelProvider} / ${match.modelId}`,
            `  Project:  ${match.projectPath || "(unscoped)"}`,
            `  Messages: ${match.messageCount}`,
          ].join("\n"),
        });
        this.clearConversationView();
        this.replayMessages(messages);
        this.pushSessionList(client);
        break;
      }
      case "delete": {
        if (!cmd.id) {
          client.send({ type: "error", text: "Session ID required." });
          return;
        }
        const wasCurrent = this.harness.sessions.currentId() === cmd.id;
        const result = this.harness.sessions.delete(cmd.id);
        if (!result.success) {
          client.send({ type: "error", text: `Failed to delete session: ${result.error}` });
          return;
        }
        if (wasCurrent) {
          client.send({ type: "clear_conversation" });
        }
        this.cleanupUploadDir(cmd.id);
        client.send({ type: "info", display: "toast", text: "Session deleted." });
        const sessions = this.harness.sessions.list();
        const currentId = this.harness.sessions.currentId();
        client.send({
          type: "sessions",
          currentSessionId: currentId,
          data: sessions.slice(0, 50).map((s: any) => ({
            id: s.id,
            title: s.title,
            updatedAt: s.updatedAt,
            createdAt: s.createdAt,
            messageCount: s.messageCount,
            modelProvider: s.modelProvider,
            modelId: s.modelId,
            projectPath: s.projectPath || "",
            preview: s.preview || "",
            totalActiveMs: s.totalActiveMs ?? 0,
            contentHash: s.contentHash ?? "",
          })),
        });
        break;
      }
    }
  }

  private async handleMcp(
    client: WebSocketClient,
    cmd: ClientCommand & { type: "mcp" },
  ): Promise<void> {
    if (this.harness.mcp.list().length === 0) {
      client.send({ type: "error", text: "No MCP manager available." });
      return;
    }

    switch (cmd.action) {
      case "list": {
        client.send({
          type: "mcp_state",
          servers: this.mutableMcpSnapshot(),
        });
        break;
      }
      case "refresh": {
        this.harness.mcp.refresh().then(() => {
          client.send({
            type: "mcp_state",
            servers: this.mutableMcpSnapshot(),
          });
          client.send({ type: "info", display: "toast", text: "MCP servers refreshed." });
        }).catch((err: Error) => {
          client.send({ type: "error", text: `MCP refresh failed: ${err.message}` });
        });
        break;
      }
      case "connect": {
        if (!cmd.serverName) {
          client.send({ type: "error", text: "serverName is required for connect action." });
          return;
        }
        try {
          await this.harness.mcp.connect(cmd.serverName);
          this.pushMcpState();
          client.send({ type: "info", display: "toast", text: `MCP server "${cmd.serverName}" connected.` });
        } catch (err: any) {
          this.pushMcpState();
          client.send({ type: "error", text: `MCP connect failed: ${err.message}` });
        }
        break;
      }
      case "disconnect": {
        if (!cmd.serverName) {
          client.send({ type: "error", text: "serverName is required for disconnect action." });
          return;
        }
        try {
          await this.harness.mcp.disconnect(cmd.serverName);
          this.pushMcpState();
          client.send({ type: "info", display: "toast", text: `MCP server "${cmd.serverName}" disconnected.` });
        } catch (err: any) {
          this.pushMcpState();
          client.send({ type: "error", text: `MCP disconnect failed: ${err.message}` });
        }
        break;
      }
    }
  }

  private async handleSkill(
    client: WebSocketClient,
    cmd: ClientCommand & { type: "skill"; action: "toggle"; name: string },
  ): Promise<void> {
    try {
      const skill = this.harness.skills.list().find(
        (candidate) => candidate.name === cmd.name,
      );
      if (!skill) throw new Error(`Unknown Skill: ${cmd.name}`);
      await this.harness.skills.setEnabled(cmd.name, !skill.active);
      this.pushSkillState();

      client.send({ type: "info", display: "toast", text: `Skill "${cmd.name}" ${skill.active ? "deactivated" : "activated"}.` });
    } catch (err: any) {
      this.pushSkillState();
      client.send({ type: "error", text: `Skill toggle failed: ${err.message}` });
    }
  }


  // ── Private: Helpers ──

  private buildConfigData(): ConfigData {
    const config = this.harness.settings.get();
    const providers = this.harness.settings.providers();
    const models = this.harness.settings.models(config.provider).map((m) => ({
      id: m.id,
      name: m.name,

    }));
    return {
      provider: config.provider,
      modelId: config.modelId,
      apiKey: config.apiKey,
      thinkingLevel: config.thinkingLevel,
      projectPath: config.projectPath,
      maxTokens: config.maxTokens,
      providers: [...providers],
      models,
      vision: config.vision,
      visionProviders: [...this.harness.settings.visionProviders()],
      visionModels: config.vision?.provider
        ? [...this.harness.settings.visionModels(config.vision.provider)]
        : [],
    };
  }

  private buildConversationHistory(): ConversationMessage[] {
    const snapshot = this.harness.conversation.snapshot();
    const sessionId = this.harness.sessions.currentId() ?? "unknown";
    return rebuildDisplayMessages(
      [...snapshot.messages] as any[],
      [...snapshot.agentMessages],
      sessionId,
      { resolveImage: (ref) => this.harness.conversation.resolveImage(ref) },
    ) as any;
  }


  private broadcastContextWindow(bypassThrottle: boolean, toolsOverride?: { name: string; result: string }[]): void {
    const current = this.harness.conversation.contextUsage();
    if (current.total <= 0) return;

    if (!bypassThrottle) {
      if (this.contextWindowThrottleTimer) {
        this.contextWindowThrottlePending = true;
        return;
      }
      this.contextWindowThrottleTimer = setTimeout(() => {
        this.contextWindowThrottleTimer = null;
        if (this.contextWindowThrottlePending) {
          this.contextWindowThrottlePending = false;
          this.broadcastContextWindow(true, toolsOverride);
        }
      }, 500);
    }

    const tools = toolsOverride ?? this.currentAssistant?.tools ?? [];
    const breakdown = this.harness.conversation.contextUsage(tools);

    this.broadcast({
      type: "context_window",
      total: breakdown.total,
      used: breakdown.used,
      free: breakdown.free,
      categories: breakdown.categories,
    });
  }


  private broadcast(event: ServerEvent): void {
    this.wsServer.broadcast(event);
  }

  // ── HTTP request handling (SPA + MCP app proxy) ──

  private handleHttpRequest(req: IncomingMessage, res: ServerResponse): void {
    const url = req.url ?? "/";

    // MCP App proxy
    if (url.startsWith("/mcp-app/") && this.appResourceProxy) {
      const appId = url.slice("/mcp-app/".length).split("?")[0].split("/")[0];
      const suffix = url.slice("/mcp-app/".length + appId.length);
      const targetUrl = this.appResourceProxy.resolveAppUrl(appId, suffix);
      if (targetUrl) {
        this.proxyRequest(req, res, targetUrl);
        return;
      }
      res.writeHead(404);
      res.end("MCP App not found");
      return;
    }

    // SPA serving
    this.serveSpa(req, res);
  }

  private proxyRequest(req: IncomingMessage, res: ServerResponse, targetUrl: string): void {
    const parsed = new URL(targetUrl);
    const options = {
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname + parsed.search,
      method: req.method,
      headers: { ...req.headers, host: parsed.host },
    };

    const proxyReq = httpRequest(options, (proxyRes) => {
      res.writeHead(proxyRes.statusCode ?? 200, proxyRes.headers);
      proxyRes.pipe(res);
    });

    proxyReq.on("error", () => {
      res.writeHead(502);
      res.end("Bad Gateway");
    });

    req.pipe(proxyReq);
  }

  private serveSpa(req: IncomingMessage, res: ServerResponse): void {
    const webDist = this.webRoot;

    let filePath = join(webDist, req.url === "/" ? "index.html" : req.url!);

    // Normalize: strip query/hash
    const qIdx = filePath.indexOf("?");
    if (qIdx >= 0) filePath = filePath.slice(0, qIdx);
    const hIdx = filePath.indexOf("#");
    if (hIdx >= 0) filePath = filePath.slice(0, hIdx);

    const ext = extname(filePath);
    const mimeTypes: Record<string, string> = {
      ".html": "text/html",
      ".js": "application/javascript",
      ".css": "text/css",
      ".svg": "image/svg+xml",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".json": "application/json",
      ".woff2": "font/woff2",
      ".woff": "font/woff",
    };

    try {
      if (existsSync(filePath) && ext) {
        const content = readFileSync(filePath);
        res.writeHead(200, { "Content-Type": mimeTypes[ext] ?? "application/octet-stream" });
        res.end(content);
      } else {
        // SPA fallback
        const html = readFileSync(join(webDist, "index.html"));
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(html);
      }
    } catch {
      res.writeHead(404);
      res.end("Not Found");
    }
  }

  private async handleArtifact(
    client: WebSocketClient,
    cmd: ClientCommand & { type: "artifact"; action: "generate" | "update"; context?: string; instruction?: string },
  ): Promise<void> {
    try {
      // 2.4: Load .dscode/html_output_skill if exists
      let styleConstraints = "";
      try {
        const skillPath = join(this.config.projectPath, ".dscode", "html_output_skill");
        if (existsSync(skillPath)) {
          styleConstraints = readFileSync(skillPath, "utf-8");
        }
      } catch {
        // graceful fallback
      }

      // The WebUI injects current values for these variables into the iframe.
      const designColors = buildDashboardThemeContract();

      // Build default style constraints (used when .dscode/html_output_skill absent)
      const defaultStyleConstraints = `CRITICAL STYLE RULES:
- Use only the semantic variables from DESIGN SYSTEM THEME CONTRACT for theme colors
- Flat design: 1px solid var(--border) borders, no box-shadow, no gradients
- Border-radius: 8px for cards/panels, 6px for buttons, 12px for large containers
- Typography: system-ui, -apple-system, sans-serif for labels; monospace for data values
- Emoji for visual markers, CSS conic-gradient or inline SVG for chart-like elements
- Background MUST be var(--bg), never white, black, or transparent
- Text MUST be var(--text), never a hard-coded color
- Accent elements MUST use var(--accent), never blue`;

      // Build system prompt
      const systemPrompt = `You are an expert HTML dashboard designer. Generate a single, self-contained HTML file.

CRITICAL RULES:
- Output ONLY valid HTML starting with <!DOCTYPE html>
- All CSS MUST be inlined in <style> tags within <head>
- NO external resources (fonts, images, scripts, CDN links)
- Use system-ui, -apple-system, sans-serif for labels and monospace for data values
- Use emoji icons for visual markers
- Use CSS conic-gradient or inline SVG for chart-like elements
- Make it visually rich and data-dense
- Self-contained, single HTML document

${designColors}

${styleConstraints ? `ARTIFACT STYLE RULES (from .dscode/html_output_skill):\n${styleConstraints}\n` : defaultStyleConstraints}

Respond ONLY with the raw HTML starting with <!DOCTYPE html>. DO NOT wrap the output in markdown code fences (no \`\`\`html). DO NOT add any explanatory text before or after the HTML. Just output the HTML directly.`;

      // Build session summary for the prompt
      let sessionSummary = "";
      if (cmd.context === "session_dashboard" || cmd.action === "generate") {
        sessionSummary = this.buildSessionSummary();
      }

      // Build user prompt
      let userPrompt: string;
      if (cmd.action === "generate") {
        userPrompt = buildSessionDashboardUserPrompt(sessionSummary);
      } else {
        // update action
        const existingHtml = this.lastArtifactHtml || "";
        userPrompt = `Here is the current dashboard HTML:

${existingHtml.slice(0, 5000)}

User instruction: ${cmd.instruction || "update the dashboard"}

Modify the HTML to fulfill the user's request. Output the complete modified HTML.`;
      }

      client.send({ type: "artifact_start" });

      let fullHtml = await this.harness.conversation.streamText({
        systemPrompt,
        userPrompt,
        maxTokens: this.config.maxTokens,
      }, (event) => {
        if (event.type === "text") {
          client.send({ type: "artifact_delta", delta: event.text });
        } else {
          client.send({
            type: "error",
            text: `Artifact generation error: ${event.text}`,
          });
        }
      });

      // Strip markdown code fences that LLMs sometimes emit despite instructions
      fullHtml = this.stripArtifactFences(fullHtml);
      // DEBUG: write artifact output for inspection
      try { writeFileSync(join(this.config.projectPath, "_artifact_debug.html"), fullHtml, "utf-8"); } catch {}
      this.lastArtifactHtml = fullHtml;
      client.send({ type: "artifact_end" });
    } catch (err) {
      client.send({ type: "artifact_end" });
      client.send({
        type: "error",
        text: `Artifact generation failed: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }


  private stripArtifactFences(html: string): string {
    let result = html.trim();
    // Strip leading ```html or ``` fences
    const fencePattern = /^```(?:html)?\s*\n/;
    result = result.replace(fencePattern, "");
    // Strip trailing ```
    const endFence = /\n```\s*$/;
    result = result.replace(endFence, "");
    // If the result doesn't look like HTML, return the original (don't strip inappropriately)
    if (!result.trimStart().startsWith("<")) {
      return html;
    }
    return result;
  }
  private buildSessionSummary(): string {
    const messages = this.harness.conversation.snapshot().messages;
    const tools = this.currentAssistant?.tools ?? [];
    const breakdown = this.harness.conversation.contextUsage(tools);

    const totalTokens = breakdown.total;
    const usedTokens = breakdown.used;
    const freeTokens = breakdown.free;
    const usagePercent = totalTokens > 0 ? Math.round((usedTokens / totalTokens) * 100) : 0;
    const categories = breakdown.categories;

    // Tool statistics from agent messages
    const toolStats = new Map<string, { calls: number; errors: number }>();
    for (const msg of messages) {
      const m = msg as any;
      if (m.role === "assistant" && Array.isArray(m.content)) {
        for (const block of m.content) {
          if (block.type === "toolCall") {
            const name = block.name || "unknown";
            const existing = toolStats.get(name) || { calls: 0, errors: 0 };
            existing.calls++;
            toolStats.set(name, existing);
          }
        }
      }
      if (m.role === "toolResult" && m.isError) {
        const name = m.toolName || "unknown";
        const existing = toolStats.get(name);
        if (existing) {
          existing.errors++;
        } else {
          toolStats.set(name, { calls: 0, errors: 1 });
        }
      }
    }

    const toolEntries = Array.from(toolStats.entries())
      .map(([name, stats]) => ({
        name,
        callCount: stats.calls,
        errorCount: stats.errors,
        successCount: stats.calls - stats.errors,
        successRate: stats.calls > 0 ? Math.round(((stats.calls - stats.errors) / stats.calls) * 100) : 100,
      }))
      .sort((a, b) => b.callCount - a.callCount);

    const totalToolCalls = toolEntries.reduce((sum, t) => sum + t.callCount, 0);
    const totalToolErrors = toolEntries.reduce((sum, t) => sum + t.errorCount, 0);

    // Timing

    const sessionActiveMs = this.harness.sessions.totalActiveMs();
    const turnCount = (messages as any[]).filter((m: any) => m.role === "user").length;
    const avgTurnMs = turnCount > 0 ? Math.round(sessionActiveMs / turnCount) : 0;

    // Context pressure score
    const pressureScore = totalTokens > 0 ? Math.round((usedTokens / totalTokens) * 100) : 0;
    let pressureLabel = "low";
    if (pressureScore > 95) pressureLabel = "critical";
    else if (pressureScore > 80) pressureLabel = "high";
    else if (pressureScore > 50) pressureLabel = "moderate";

    // Top tools (top 3)
    const topTools = toolEntries.slice(0, 3).map((t) => ({
      name: t.name,
      successRate: t.successRate,
      warning: t.errorCount > 0 && (t.errorCount / t.callCount) > 0.2 ? "⚠️" : "",
    }));

    function formatMs(ms: number): string {
      if (ms < 1000) return `${ms}ms`;
      const sec = Math.floor(ms / 1000);
      if (sec < 60) return `${sec}s`;
      const min = Math.floor(sec / 60);
      const remainSec = sec % 60;
      if (min < 60) return `${min}m ${remainSec}s`;
      const hrs = Math.floor(min / 60);
      const remainMin = min % 60;
      return `${hrs}h ${remainMin}m`;
    }

    return JSON.stringify({
      tokenUsage: {
        total: totalTokens,
        used: usedTokens,
        free: freeTokens,
        usagePercent,
        categories: {
          system: categories.system ?? null,
          rules: categories.rules ?? null,
          user: categories.user ?? null,
          thinking: categories.thinking ?? null,
          readwrite: categories.readwrite ?? null,
          edit: categories.edit ?? null,
          shell: categories.shell ?? null,
          skill: categories.skill ?? null,
          mcp: categories.mcp ?? null,
          other: categories.other ?? null,
        },
      },
      toolStatistics: {
        tools: toolEntries,
        totalToolsCalled: totalToolCalls,
        totalErrors: totalToolErrors,
      },
      timing: {
        sessionActiveMs,
        sessionActiveFormatted: formatMs(sessionActiveMs),
        turnCount,
        avgTurnMs,
        avgTurnFormatted: formatMs(avgTurnMs),
      },
      contextHealth: {
        pressureScore,
        pressureLabel,
      },
      topTools,
      subagents: buildDashboardSubagentSummary(
        [...this.harness.conversation.snapshot().agentMessages],
      ),
    }, null, 2)
  }
}
