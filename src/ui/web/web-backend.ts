import { createServer, request as httpRequest } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ImageContent } from "@mariozechner/pi-ai";
import { getAllProviders, getAllModels, getVisionModels, getVisionProviders, resolveModel } from "../../models/index.js";
import type { UiBackend } from "../backend.js";
import type { HarnessConfig, PermissionPromptResult } from "../../core/types.js";
import type { ConfigWatch } from "../../core/config-watch.js";
import { maskApiKey, PROVIDER_ENV_VARS, saveUserConfig, normalizeTransport, normalizeProtocolVersion, loadScopedSettings, projectSettingsPath } from "../../core/config.js";
import { executeSlashCommand, getSlashCommandAutocomplete } from "../commands.js";
import { deriveFuzzyPattern, deriveFuzzyArgPattern, describeFuzzyArgPattern } from "../../permissions/fuzzy.js";
import { prefetchLlmSuggestions, getLlmSuggestions } from "../../permissions/fuzzy-llm.js";
import type { HarnessAPI } from "../../core/harness-api.js";
import type { MCPManager } from "../../mcp/manager.js";
import type { AppHostManager } from "../../mcp/app/host.js";
import type { AppInstance } from "../../mcp/app/types.js";
import { buildMcpServers } from "../mcp-browser.js";
import { resolveAtFileRefs, listProjectFiles } from "../../utils/at-file-resolver.js";
import { rebuildDisplayMessages } from "../../session/display.js";
import { formatToolResultForUI } from "../shared/tool-result-formatter.js";
import { WsServer, type WebSocketClient } from "./ws-server.js";
import type {
  ClientCommand,
  ServerEvent,
  ConfigData,
  SessionInfo,
  ConversationMessage,
  McpServerInfo,
  McpAppInfo,
  ToolCallEntry,
} from "./protocol.js";
import type { ImageAttachment } from "./protocol.js";

function extractImagesFromToolResult(result: unknown): ImageAttachment[] | undefined {
  if (!result || typeof result !== "object") return undefined;
  const r = result as Record<string, unknown>;
  const content = r.content;
  if (!Array.isArray(content)) return undefined;
  const images: ImageAttachment[] = [];
  for (const item of content) {
    if (item && typeof item === "object" && (item as any).type === "image" && (item as any).data) {
      images.push({ data: (item as any).data, mimeType: (item as any).mimeType ?? "image/png" });
    }
  }
  return images.length > 0 ? images : undefined;
}
export interface WebUiOptions {
  port: number;
  harness: HarnessAPI;
  configStore: ConfigWatch;
  config: HarnessConfig;
}

/**
 * Web UI backend that implements UiBackend.
 * Creates an HTTP server + WebSocket server, serves the SPA,
 * and translates all UI callbacks into WebSocket events.
 */
export class WebUiBackend implements UiBackend {
  private port: number;
  private harness: HarnessAPI;
  private config: HarnessConfig;
  private configStore: ConfigWatch;
  private httpServer: ReturnType<typeof createServer>;
  private wsServer: WsServer;
  private currentClient: WebSocketClient | null = null;
  private exitPromise!: Promise<void>;
  private exitResolve!: () => void;
  private appHostManager?: AppHostManager;
  private mcpManager?: MCPManager;
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

  constructor(options: WebUiOptions) {
    this.port = options.port;
    this.harness = options.harness;
    this.configStore = options.configStore;
    this.config = options.config;

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
    this.wsServer.onMessageHandler = (client, cmd) => this.handleMessage(client, cmd);

    // ── Event bus subscriptions ──
    const h = this.harness;

    h.events.on("llm:thinking:delta", (e) => { this.broadcast({ type: "thinking_delta", delta: e.delta }); });
    h.events.on("llm:text:delta", (e) => {
      if (this.currentAssistant && e.delta != null) this.currentAssistant.text += e.delta;
      this.broadcast({ type: "text_delta", delta: e.delta });
    });
    h.events.on("llm:retry", (e) => { this.broadcast({ type: "retry", info: { attempt: e.attempt, maxRetries: e.maxRetries, delayMs: e.delayMs, error: e.error, level: e.level } }); });
    h.events.on("tool:start", (e) => { this.broadcast({ type: "tool_start", name: e.name, args: e.args }); });
    h.events.on("tool:end", (e) => {
      const rawResult = typeof e.result === "string" ? e.result : JSON.stringify(e.result);
      const rs = formatToolResultForUI(e.name, rawResult);
      const imgs = extractImagesFromToolResult(e.result);
      if (this.currentAssistant) {
        this.currentAssistant.tools = this.currentAssistant.tools.filter((t) => t.name !== e.name || t.result !== "");
        this.currentAssistant.tools.push({ name: e.name, args: "", result: rs, isError: e.isError, images: imgs });
      }
      this.broadcast({ type: "tool_end", name: e.name, result: rs, isError: e.isError, images: imgs });
    });
    h.events.on("turn:streaming:start", () => {
      this.currentAssistant = { thinking: "", text: "", tools: [] };
      this.broadcast({ type: "assistant_start" });
      this.startSessionTimeBroadcast();
    });
    h.events.on("turn:end", () => {
      this.broadcastSessionTime();
      this.currentAssistant = null;
      this.broadcast({ type: "assistant_end" });
      this.pushSessionListToAll();
    });
    h.events.on("turn:abort", () => { this.stopSessionTimeBroadcast(); this.broadcast({ type: "loader", state: "hide" }); });
    h.events.on("turn:error", (e) => { this.broadcast({ type: "error", text: e.error }); });
    h.events.on("processing:start", () => { this.broadcast({ type: "loader", state: "show", text: "Thinking..." }); });
    h.events.on("processing:stop", () => { this.stopSessionTimeBroadcast(); this.broadcast({ type: "loader", state: "hide" }); });
    h.events.on("message:user", (e) => { this.broadcast({ type: "user_message", text: e.text, images: e.images as any }); });
    h.events.on("ui:info", (e) => { this.broadcast({ type: "info", text: e.text, display: e.display ?? "toast" }); });
    h.events.on("ui:error", (e) => { this.broadcast({ type: "error", text: e.text }); });
    h.events.on("ui:warning", (e) => { this.broadcast({ type: "warning", text: e.text }); });
    h.events.on("ui:image:pending", (e) => { this.pendingImages.push(e.image); });
    h.events.on("ui:conversation:clear", () => { this.currentAssistant = null; this.pendingImages = []; this.broadcast({ type: "clear_conversation" }); });
    h.events.on("config:change", (e) => { this.broadcast({ type: "config", data: e.data }); });
    h.events.on("mcp:state", (e) => { this.broadcast({ type: "mcp_state", servers: e.servers }); });
    h.events.on("mcp:browser:open", () => { this.pushMcpState(); this.broadcast({ type: "mcp_open_browser" }); });
    h.events.on("session:saved", () => { this.pushSessionListToAll(); });
    h.events.on("session:created", () => { this.pushSessionListToAll(); });
    h.events.on("session:deleted", () => { this.pushSessionListToAll(); });
  }

  setAppHostManager(manager: AppHostManager): void {
    this.appHostManager = manager;
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

  toolStart(name: string, args: unknown): void {
    this.broadcast({ type: "tool_start", name, args });
  }

  toolEnd(name: string, result: unknown, isError: boolean): void {
    const resultStr = typeof result === "string" ? result.slice(0, 5000) : JSON.stringify(result).slice(0, 5000);
    const images = extractImagesFromToolResult(result);
    if (this.currentAssistant) {
      this.currentAssistant.tools = this.currentAssistant.tools.filter((t) => t.name !== name || t.result !== "");
      this.currentAssistant.tools.push({
        name,
        args: "",
        result: resultStr,
        isError,
        images,
      });
    }
    this.broadcast({ type: "tool_end", name, result: resultStr, isError, images });
  }
  finishAssistantMessage(): void {
    this.broadcastSessionTime();
    this.stopSessionTimeBroadcast();
    this.currentAssistant = null;
    this.broadcast({ type: "assistant_end" });

    const sm2 = this.harness.sessionManager;
    if (sm2) {
      const sessions2 = sm2.listSessions();
      const currentId2 = sm2.getCurrentSessionId?.();
      let sessionList2 = sessions2;
      if (currentId2) {
        const currentMeta = sm2.getCurrentMetadata();
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
          totalActiveMs: s.id === currentId2 ? sm2.getTotalActiveMs() : (s.totalActiveMs ?? 0),
          pendingPermission: s.pendingPermission || undefined,
        })),

      });
    }  }

  private startSessionTimeBroadcast(): void {
    if (this.sessionTimeInterval) return;
    this.sessionTimeInterval = setInterval(() => {
      const sm = this.harness.sessionManager;
      if (!sm) return;
      const tickMs = sm.getTotalActiveMs();
      this.wsServer.broadcast({
        type: "session_time",
        totalActiveMs: tickMs,
      });
    }, 1000);
  }

  private broadcastSessionTime(): void {
    const sm = this.harness.sessionManager;
    if (!sm) return;
    this.wsServer.broadcast({
      type: "session_time",
      totalActiveMs: sm.getTotalActiveMs(),
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
  ) => Promise<PermissionPromptResult> {
    return (toolName, preview, args) => {
      return new Promise<PermissionPromptResult>((resolve) => {
        this.currentPermissionTool = toolName;
        this.currentPermissionArgs = args;
        this.currentPermissionPreview = preview;
        this.permissionResolve = resolve;
        const fuzzy = deriveFuzzyPattern(toolName);
        const fuzzyArgDesc = describeFuzzyArgPattern(toolName, args);
        const llmSuggestions = getLlmSuggestions(toolName, args);
        this.broadcast({ type: "permission_prompt", toolName, preview, fuzzyPattern: fuzzy, fuzzyArgDesc, llmSuggestions: llmSuggestions.length > 0 ? llmSuggestions : undefined });
        // Prefetch for next time
        const model = resolveModel(this.config.provider, this.config.modelId);
        prefetchLlmSuggestions(model, toolName, args, preview);
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
    this.currentAssistant = null;
    this.pendingImages = [];
    this.broadcast({ type: "clear_conversation" });
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

  setMcpManager(mcpManager?: MCPManager): void {
    this.mcpManager = mcpManager;
    if (mcpManager) {
      this.pushMcpState();
    }
  }

  pushMcpState(): void {
    if (!this.mcpManager) return;
    const driverRegistry = this.harness.driverRegistry;
    const toolRegistry = this.harness.toolRegistry;
    if (!driverRegistry || !toolRegistry) return;
    const servers = buildMcpServers(this.mcpManager.getStates(), driverRegistry, toolRegistry);
    this.broadcast({ type: "mcp_state", servers });
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
    const model = (this.harness.agent.state.model as any)?.name ?? this.config.modelId;

      client.send({
      type: "ready",
      model,
      config: configData,
      messages,
    });

    if (this.mcpManager) {
      this.pushMcpState();
    }
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
        let text = cmd.text;
        let images = cmd.images;

        if (text.startsWith("/")) {
          const firstWord = text.slice(1).split(/\s+/)[0];
          const knownCommands = getSlashCommandAutocomplete().map(c => c.name);
          if (knownCommands.includes(firstWord)) {
            this.pendingImages = [];
            this.handleSlashCommand(client, text);
            break;
          }
        }
        const resolved = resolveAtFileRefs(this.config.projectPath, text, this.config.atFile ?? {});
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
        // Broadcast user message to client before sending to agent
        client.send({ type: "user_message", text, images: images && images.length > 0 ? images : undefined } as any);
        this.pushSessionList(client);

        try {
          if (images && images.length > 0) {
            const imageContents: ImageContent[] = images.map((img) => ({
              type: "image" as const,
              data: img.data,
              mimeType: img.mimeType,
            }) as ImageContent);
            this.pendingImages = [];
            await this.harness.promptWithImages(text, imageContents);
          } else {
            this.pendingImages = [];
            await this.harness.promptAndSave(text);
          }
        } catch (err) {
          this.harness.saveSessionNow();
          client.send({
            type: "error",
        text: err instanceof Error ? err.message : String(err),
          });
        }
        this.pushSessionList(client);

        break;
      }

      case "abort": {
        this.harness.abort();
        // Save pending permission to session metadata before denying,
        // so the session switch flow can detect and restore it.
        if (this.permissionResolve) {
          const sm = this.harness.sessionManager;
          const meta = sm.getCurrentMetadata();
          if (meta) {
            const fuzzy = deriveFuzzyPattern(this.currentPermissionTool);
            meta.pendingPermission = {
              toolName: this.currentPermissionTool,
              preview: this.currentPermissionPreview,
              fuzzyPattern: fuzzy,
              permissionArgs: this.currentPermissionArgs,
            };
            // Save immediately with truncation so deny/abort messages
            // that follow won't persist to disk.
            this.harness.logger.info("session", "WebBackend", "saving pendingPermission to metadata, then denying");
            sm.saveSession(this.harness.agent, meta.pendingPermission);
          }
          this.permissionResolve({ decision: "deny" });
          this.permissionResolve = null;
        }
        break;
      }
      case "permission_response": {
        if (this.permissionResolve && (cmd as any).denyReason) {
          const resolve = this.permissionResolve;
          this.permissionResolve = null;
          resolve({
            decision: "deny",
            denyReason: `User updated the request during permission review: ${(cmd as any).denyReason}`,
          });
          client.send({ type: "user_message", text: (cmd as any).denyReason } as any);
          this.harness.promptAndSave((cmd as any).denyReason, undefined).catch((err: any) => {
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
          const isSessionGrant = (cmd.decision === "always_allow" && !isSave) || (cmd.decision === "allow" && !!(cmd as any).sessionGrantPattern);
          const sessionPattern = (cmd as any).sessionGrantPattern as string | undefined;
          resolve({
            decision: isAlways ? "allow" : cmd.decision as "allow" | "deny",
            rememberForSession: isAlways,
            sessionGrantPattern: isSessionGrant ? sessionPattern : undefined,
            persistRule: isSave
              ? (() => {
                  const mode = ((cmd as any).fuzzyMode as number | undefined) ?? 0;
                  if (mode === 2) {
                    const fuzzyArg = deriveFuzzyArgPattern(this.currentPermissionTool, this.currentPermissionArgs);
                    return fuzzyArg
                      ? { tool: this.currentPermissionTool, argPattern: fuzzyArg, decision: "allow" as const }
                      : { tool: this.currentPermissionTool, decision: "allow" as const };
                  }
                  if (mode >= 3) {
                    try {
                      const p = JSON.parse((cmd as any).toolNamePattern || "{}");
                      return {
                        tool: p.toolPattern ?? this.currentPermissionTool,
                        argPattern: p.argPattern ?? undefined,
                        decision: "allow" as const,
                      };
                    } catch { /* fall through */ }
                  }
                  if (mode === 1) {
                    return { tool: (cmd as any).toolNamePattern ?? this.currentPermissionTool, decision: "allow" as const };
                  }
                  return { tool: this.currentPermissionTool, decision: "allow" as const };
                })()
              : undefined,
          });
        } else {
          const sm = this.harness.sessionManager;
          const meta = sm.getCurrentMetadata();
          if (meta?.pendingPermission && (cmd.decision === "allow" || cmd.decision === "always_allow")) {
            const toolName = meta.pendingPermission.toolName;
            this.harness.permissionManager.grantForSession(toolName);
            meta.pendingPermission = undefined;
            sm.saveSession(this.harness.agent);
            const messages = this.harness.agent.state.messages as any[];
            let lastUserText = "";
            for (let i = messages.length - 1; i >= 0; i--) {
              if (messages[i]?.role === "user") {
                const c = messages[i].content;
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
              this.harness.promptAndSave(lastUserText).catch((err: any) => {
                client.send({ type: "error", text: err instanceof Error ? err.message : String(err) });
                client.send({ type: "loader", state: "hide" });
              });
            }
          } else if (meta?.pendingPermission && cmd.decision === "deny") {
            meta.pendingPermission = undefined;
            sm.saveSession(this.harness.agent);
          }
        }
        break;
      }
      case "slash": {
        this.handleSlashCommand(client, cmd.command);
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
        const items = listProjectFiles(this.config.projectPath, cmd.prefix);
        client.send({ type: "file_list_result" as any, prefix: cmd.prefix, items });
        break;
      }
      case "mcp": {
        this.handleMcp(client, cmd);
        break;
      }
    }
  }

  private async handleSlashCommand(client: WebSocketClient, text: string): Promise<void> {
    try {

      

      const executed = executeSlashCommand(text, { harness: this.harness, ui: this });

      if (!executed) {
        // Not a known command — treat as regular chat message
        this.pendingImages = [];
        // Send as user message then prompt the agent
        client.send({ type: 'user_message', text } as any);
        await this.harness.promptAndSave(text).catch((err: any) => {
          client.send({
            type: 'error',
            text: err instanceof Error ? err.message : String(err),
          });
        });
      }

      // Push updated session list so sidebar auto-refreshes
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
    const sessionManager = this.harness.sessionManager;
    if (!sessionManager) return;
    const sessions = sessionManager.listSessions();
    const currentId = sessionManager.getCurrentSessionId?.() ?? undefined;
    // Always include the current session even if it has no messages yet
    let sessionList = sessions;
    if (currentId) {
      const currentMeta = sessionManager.getCurrentMetadata();
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
        totalActiveMs: s.id === currentId ? sessionManager.getTotalActiveMs() : (s.totalActiveMs ?? 0),
        pendingPermission: s.pendingPermission || undefined,
      })),
    });
  }

  private pushSessionListToAll(): void {
    const sm = this.harness.sessionManager;
    if (!sm) return;
    const sessions = sm.listSessions();
    const currentId = sm.getCurrentSessionId?.() ?? undefined;
    let sessionList = sessions;
    if (currentId) {
      const currentMeta = sm.getCurrentMetadata();
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
        totalActiveMs: s.id === currentId ? sm.getTotalActiveMs() : (s.totalActiveMs ?? 0),
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
          this.harness.setModel(cmd.value);
          const modelName = (this.harness.agent.state.model as any)?.name ?? cmd.value;
          client.send({ type: "config", data: this.buildConfigData() });
          client.send({ type: "model", name: modelName });
          client.send({ type: "info", display: "toast", text: `Model set to ${cmd.value}` });
          break;
        }
        case "set_thinking": {
          this.harness.setThinking(cmd.value);
          client.send({ type: "config", data: this.buildConfigData() });
          client.send({ type: "info", display: "toast", text: `Thinking level set to ${cmd.value}` });
          break;
        }
        case "set_key": {
          this.configStore.setApiKey(cmd.value);
          saveUserConfig({ apiKey: cmd.value });
          const envVar = PROVIDER_ENV_VARS[this.config.provider] ?? "DEEPSEEK_API_KEY";
          process.env[envVar] = cmd.value;
          if (envVar !== "DEEPSEEK_API_KEY") {
            process.env.DEEPSEEK_API_KEY = cmd.value;
          }
          client.send({ type: "config", data: this.buildConfigData() });
          client.send({ type: "info", display: "toast", text: "API key updated" });
          break;
        }
        case "set_provider": {
          saveUserConfig({ provider: cmd.value });
          // Update config via ConfigWatch so onChange propagates
          this.configStore.setModelConfig(cmd.value, this.config.modelId, this.config.thinkingLevel);
          // Auto-select the first model for the new provider
          const cd = this.buildConfigData();
          if (cd.models.length > 0) {
            try {
              this.harness.setModel(cd.models[0].id);
            } catch {
              // ignore if model resolution fails
            }
          }
          client.send({ type: "config", data: this.buildConfigData() });
          const mn = (this.harness.agent.state.model as any)?.name ?? this.config.modelId;
          client.send({ type: "model", name: mn });
          client.send({ type: "info", display: "toast", text: `Provider set to: ${cmd.value}. Restart required for full effect.` });
          break;
        }
        case "set_vision_provider": {
          const vp = cmd.value;
          this.configStore.updateVision({ provider: vp });
          saveUserConfig({ vision: this.config.vision });
          client.send({ type: "config", data: this.buildConfigData() });
          client.send({ type: "info", display: "toast", text: `Vision provider set to: ${vp}` });
          break;
        }
        case "set_vision_model": {
          const vm = cmd.value;
          const vp = this.config.vision?.provider ?? "";
          this.configStore.updateVision({ model: vm });
          saveUserConfig({ vision: this.config.vision });
          client.send({ type: "config", data: this.buildConfigData() });
          client.send({ type: "info", display: "toast", text: `Vision model set to: ${vm}` });
          break;
        }
        case "set_vision_key": {
          const vk = cmd.value;
          const vp = this.config.vision?.provider ?? "";
          const vm = this.config.vision?.model ?? "";
          this.configStore.updateVision({ key: vk });
          saveUserConfig({ vision: this.config.vision });
          client.send({ type: "config", data: this.buildConfigData() });
          client.send({ type: "info", display: "toast", text: "Vision API key updated" });
          break;
        }
        case "set_vision_delete": {
          this.configStore.setVision(undefined);
          saveUserConfig({ vision: null });
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
          const result = await this.harness.updateProjectPath(cwd);
          if (result.success) {
            client.send({ type: "config", data: this.buildConfigData() });
            // Push updated session list
            const sessionManager = this.harness.sessionManager;
            if (sessionManager) {
              const sessions = sessionManager.listSessions();
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
                })),
              });
            }
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
    const sessionManager = this.harness.sessionManager;
    const agent = this.harness.agent;

    switch (cmd.action) {
      case "list": {
        const sessions = sessionManager.listSessions();
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
        }));
        client.send({ type: "sessions", data });
        break;
      }
      case "save": {
        try {
          sessionManager.saveSession(agent);
          client.send({ type: "info", display: "toast", text: "Session saved." });
        } catch (err: any) {
          client.send({ type: "error", text: `Failed to save session: ${err.message}` });
          return;
        }
        const sessions = sessionManager.listSessions();
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
          })),
        });
        break;
      }
      case "load": {
        if (!cmd.id) {
          client.send({ type: "error", text: "Session ID required." });
          return;
        }
        const sessions = sessionManager.listSessions();
        const matches = sessions.filter((s: any) => s.id.startsWith(cmd.id!));
        let match: any;
        if (matches.length === 0) {
          // Fallback: check if the requested session is the current active session
          // (which may be filtered out by listSessions() if messageCount === 0)
          const currentMeta = sessionManager.getCurrentMetadata();
          if (currentMeta && currentMeta.id.startsWith(cmd.id!)) {
            match = currentMeta;
          } else {
            client.send({ type: "error", text: `Session not found: ${cmd.id}` });
            return;
          }
        } else if (matches.length > 1) {
          const matchList = matches.map((s: any) =>
            `  ${s.id.slice(0, 8)} "${s.title.slice(0, 60)}"  ${s.modelProvider}/${s.modelId}  ${s.messageCount} msgs`
          ).join("\n");
          client.send({ type: "error", text: `Ambiguous session ID prefix. Matching sessions:\n${matchList}` });
          return;
        } else {
          match = matches[0];
        }
        // If permissionResolve is active, capture and deny it.
        // If already denied by abort handler, pendingPermission is in metadata.
        // Either way, save with truncation to keep conversation clean.
        let pendingPermission: import("../../core/types.js").PendingPermission | undefined;
        if (this.permissionResolve) {
          const fuzzy = deriveFuzzyPattern(this.currentPermissionTool);
          pendingPermission = {
            toolName: this.currentPermissionTool,
            preview: this.currentPermissionPreview,
            fuzzyPattern: fuzzy,
            permissionArgs: this.currentPermissionArgs,
          };
          this.permissionResolve({ decision: "deny" });
          this.permissionResolve = null;
        } else {
          // Check if abort handler already saved pendingPermission to metadata
          const meta = sessionManager.getCurrentMetadata();
          if (meta?.pendingPermission) {
            pendingPermission = meta.pendingPermission;
            this.harness.logger.info("session", "WebBackend", "using pendingPermission from metadata");
          }
        }
        this.harness.abort();
        if (pendingPermission) {
          this.harness.logger.info("session", "WebBackend", `saving with pendingPermission: ${JSON.stringify(pendingPermission)}`);
          sessionManager.saveSession(agent, pendingPermission);
        } else {
          this.harness.logger.info("session", "WebBackend", "saving without pendingPermission");
          this.harness.saveSessionNow();
        }
        const result = await sessionManager.loadSession(match.id, agent);
        if (!result.success) {
          client.send({ type: "error", text: `Failed to load session: ${result.error}` });
          return;
        }
        // If loaded session has pendingPermission, clean up the aborted turn
        // from agent.state.messages so the conversation looks clean.
        const loadedMeta = sessionManager.getCurrentMetadata();
        if (loadedMeta?.pendingPermission) {
          const msgs = agent.state.messages as any[];
          // Remove the last assistant message with toolCall and everything after it
          for (let i = msgs.length - 1; i >= 0; i--) {
            if (msgs[i].role === "assistant") {
              const c = (msgs[i] as any).content;
              if (Array.isArray(c) && c.some((b: any) => b.type === "toolCall")) {
                msgs.length = i;
                break;
              }
            }
          }
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
        client.send({ type: "clear_conversation" });

        const messages = await this.buildConversationHistory();
        const model = (agent.state.model as any)?.name ?? this.config.modelId;
        client.send({
          type: "ready",
          model,
          config: this.buildConfigData(),
          messages,
        });
        this.pushSessionList(client);
        break;
      }
      case "delete": {
        if (!cmd.id) {
          client.send({ type: "error", text: "Session ID required." });
          return;
        }
        const wasCurrent = sessionManager.getCurrentSessionId?.() === cmd.id;
        const result = sessionManager.deleteSession(cmd.id);
        if (!result.success) {
          client.send({ type: "error", text: `Failed to delete session: ${result.error}` });
          return;
        }
        if (wasCurrent) {
          client.send({ type: "clear_conversation" });
        }
        client.send({ type: "info", display: "toast", text: "Session deleted." });
        const sessions = sessionManager.listSessions();
        const currentId = sessionManager.getCurrentSessionId?.() ?? undefined;
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
    const mcpManager = this.mcpManager ?? this.harness.mcpManager as MCPManager | undefined;
    if (!mcpManager) {
      client.send({ type: "error", text: "No MCP manager available." });
      return;
    }

    switch (cmd.action) {
      case "list": {
        const servers = buildMcpServers(mcpManager.getStates(), this.harness.driverRegistry, this.harness.toolRegistry);
        client.send({ type: "mcp_state", servers });
        break;
      }
      case "refresh": {
        const driverRegistry = this.harness.driverRegistry;
        mcpManager.registerDrivers(driverRegistry).then(() => {
          const servers = buildMcpServers(mcpManager.getStates(), driverRegistry, this.harness.toolRegistry);
          client.send({ type: "mcp_state", servers });
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
          await mcpManager.connectServer(cmd.serverName);
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
          await mcpManager.disconnectServer(cmd.serverName);
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

  // ── Private: Helpers ──

  private buildConfigData(): ConfigData {
    const providers = getAllProviders();
    const models = getAllModels(this.config.provider).map((m) => ({
      id: m.id,
      name: m.name,

    }));
    return {
      provider: this.config.provider,
      modelId: this.config.modelId,
      apiKey: maskApiKey(this.config.apiKey),
      thinkingLevel: this.config.thinkingLevel,
      projectPath: this.config.projectPath,
      maxTokens: this.config.maxTokens,
      providers,
      models,
      vision: this.config.vision,
      visionProviders: getVisionProviders(),
      visionModels: this.config.vision?.provider
        ? getVisionModels(this.config.vision.provider)
        : [],
    };
  }

  private buildConversationHistory(): ConversationMessage[] {
    const messages = this.harness.agent.state.messages as any[];
    const vms = this.harness.sessionManager?.visionMessages ?? [];
    return rebuildDisplayMessages(messages, vms) as any;
  }

  private broadcast(event: ServerEvent): void {
    this.wsServer.broadcast(event);
  }

  // ── HTTP request handling (SPA + MCP app proxy) ──

  private handleHttpRequest(req: IncomingMessage, res: ServerResponse): void {
    const url = req.url ?? "/";

    // MCP App proxy
    if (url.startsWith("/mcp-app/") && this.appHostManager) {
      const appId = url.slice("/mcp-app/".length).split("?")[0].split("/")[0];
      const app = (this.appHostManager as any).apps?.get?.(appId);
      if (app) {
        // Proxy to the MCP app's local server
        const targetUrl = `http://127.0.0.1:${app.port}${url.slice("/mcp-app/".length + appId.length)}`;
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
    // Resolve web dist: try dist/web relative to project root first (for tsx/source mode),
    // then fall back to __dirname-relative (for bundled mode).
    const projectDist = join(resolve(process.cwd()), "dist", "web");
    const moduleDist = join(fileURLToPath(new URL(".", import.meta.url)), "web");
    const webDist = existsSync(projectDist) ? projectDist : moduleDist;

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
}
