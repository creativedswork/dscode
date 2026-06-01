import { createServer, request as httpRequest } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ImageContent } from "@mariozechner/pi-ai";
import { getAllProviders, getAllModels, getVisionModels, getVisionProviders } from "../../models/index.js";
import type { UiBackend } from "../backend.js";
import type { HarnessConfig, PermissionPromptResult } from "../../core/types.js";
import type { ConfigWatch } from "../../core/config-watch.js";
import { maskApiKey, PROVIDER_ENV_VARS, saveUserConfig, normalizeTransport, normalizeProtocolVersion, loadScopedSettings, projectSettingsPath } from "../../core/config.js";
import { executeSlashCommand, getSlashCommandAutocomplete } from "../commands.js";
import type { Harness } from "../../core/harness.js";
import type { MCPManager } from "../../mcp/manager.js";
import type { AppHostManager } from "../../mcp/app/host.js";
import type { AppInstance } from "../../mcp/app/types.js";
import { buildMcpServers } from "../mcp-browser.js";
import { resolveAtFileRefs, listProjectFiles } from "../../utils/at-file-resolver.js";
import { rebuildDisplayMessages } from "../../session/display.js";
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
  harness: Harness;
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
  private harness: Harness;
  private config: HarnessConfig;
  private configStore: ConfigWatch;
  private httpServer: ReturnType<typeof createServer>;
  private wsServer: WsServer;
  private currentClient: WebSocketClient | null = null;
  private exitPromise!: Promise<void>;
  private exitResolve!: () => void;
  private appHostManager?: AppHostManager;
  private mcpManager?: MCPManager;

  // Pending permission state
  private permissionResolve: ((result: PermissionPromptResult) => void) | null = null;

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
    this.currentAssistant = null;
    this.broadcast({ type: "assistant_end" });
  }

  // ── UiBackend System Messages ──

  addInfo(text: string): void {
    this.broadcast({ type: "info", text });
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
    return (toolName, preview, _args) => {
      return new Promise<PermissionPromptResult>((resolve) => {
        this.permissionResolve = resolve;
        this.broadcast({ type: "permission_prompt", toolName, preview });
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
    const driverRegistry = (this.harness as any).driverRegistry;
    const toolRegistry = (this.harness as any).toolRegistry;
    if (!driverRegistry || !toolRegistry) return;
    const servers = buildMcpServers(this.mcpManager.getStates(), driverRegistry, toolRegistry);
    this.broadcast({ type: "mcp_state", servers });
  }

  openMcpBrowser(): void {
    // In web mode, initiated by client
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
          client.send({ type: "info", text: `@${warn.path ?? ""}: ${warn.type}${warn.detail ? ` — ${warn.detail}` : ""}` });
        }
        // Broadcast user message to client before sending to agent
        client.send({ type: "user_message", text, images: images && images.length > 0 ? images : undefined } as any);

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
        this.harness.agent.abort();
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
      }

      case "permission": {
        if (this.permissionResolve) {
          const resolve = this.permissionResolve;
          this.permissionResolve = null;
          resolve({
            decision: cmd.decision === "always_allow" ? "allow" : cmd.decision,
            rememberForSession: cmd.decision === "always_allow",
            persistRule: undefined,
          });
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

  private handleSlashCommand(client: WebSocketClient, text: string): void {
    try {
      const ctx = {
        agent: this.harness.agent,
        sessionManager: (this.harness as any).sessionManager,
        memoryManager: (this.harness as any).memoryManager,
        driverRegistry: (this.harness as any).driverRegistry,
        toolRegistry: (this.harness as any).toolRegistry,
        skillManager: (this.harness as any).skillManager,
        permissionManager: (this.harness as any).permissionManager,
        contextManager: (this.harness as any).contextManager,
        mcpManager: (this.harness as any).mcpManager,
        config: this.config,
        configStore: this.configStore,
        onSetModel: (id: string) => (this.harness as any).setModel(id),
        onSetThinking: (level: string) => (this.harness as any).setThinking(level),
        onSetProvider: (id: string) => (this.harness as any).setProvider(id),
        onSetCwd: (cwd: string) => (this.harness as any).updateProjectPath(cwd),
      };

      const mockTui = {
        addInfo: (msg: string) => client.send({ type: "info", text: msg }),
        addError: (msg: string) => client.send({ type: "error", text: msg }),
        addUserMessage: () => {},
        addPendingImage: () => {},
        openMcpBrowser: () => {},
        clearConversationView: () => this.clearConversationView(),
        replayMessages: async () => {
          this.clearConversationView();
          const messages = await this.buildConversationHistory();
          const model = (this.harness.agent.state.model as any)?.name ?? this.config.modelId;
          client.send({
            type: "ready",
            model,
            config: this.buildConfigData(),
            messages,
          });
        },
        focusEditor: () => {},
        setProcessing: () => {},
        getPromptPermission: () => () => Promise.resolve({ decision: "deny" } as PermissionPromptResult),
      };

      const executed = executeSlashCommand(text, ctx, mockTui as any);

      if (!executed) {
        // Not a known command — treat as regular chat message
        this.pendingImages = [];
        // Send as user message then prompt the agent
        client.send({ type: 'user_message', text } as any);
        this.harness.promptAndSave(text).catch((err: any) => {
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
    const sessionManager = (this.harness as any).sessionManager;
    if (!sessionManager) return;
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
          (this.harness as any).setModel(cmd.value);
          const modelName = (this.harness.agent.state.model as any)?.name ?? cmd.value;
          client.send({ type: "config", data: this.buildConfigData() });
          client.send({ type: "model", name: modelName });
          client.send({ type: "info", text: `Model set to ${cmd.value}` });
          break;
        }
        case "set_thinking": {
          (this.harness as any).setThinking(cmd.value);
          client.send({ type: "config", data: this.buildConfigData() });
          client.send({ type: "info", text: `Thinking level set to ${cmd.value}` });
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
          client.send({ type: "info", text: "API key updated" });
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
              (this.harness as any).setModel(cd.models[0].id);
            } catch {
              // ignore if model resolution fails
            }
          }
          client.send({ type: "config", data: this.buildConfigData() });
          const mn = (this.harness.agent.state.model as any)?.name ?? this.config.modelId;
          client.send({ type: "model", name: mn });
          client.send({ type: "info", text: `Provider set to: ${cmd.value}. Restart required for full effect.` });
          break;
        }
        case "set_vision_provider": {
          const vp = cmd.value;
          this.configStore.updateVision({ provider: vp });
          saveUserConfig({ vision: this.config.vision });
          client.send({ type: "config", data: this.buildConfigData() });
          client.send({ type: "info", text: `Vision provider set to: ${vp}` });
          break;
        }
        case "set_vision_model": {
          const vm = cmd.value;
          const vp = this.config.vision?.provider ?? "";
          this.configStore.updateVision({ model: vm });
          saveUserConfig({ vision: this.config.vision });
          client.send({ type: "config", data: this.buildConfigData() });
          client.send({ type: "info", text: `Vision model set to: ${vm}` });
          break;
        }
        case "set_vision_key": {
          const vk = cmd.value;
          const vp = this.config.vision?.provider ?? "";
          const vm = this.config.vision?.model ?? "";
          this.configStore.updateVision({ key: vk });
          saveUserConfig({ vision: this.config.vision });
          client.send({ type: "config", data: this.buildConfigData() });
          client.send({ type: "info", text: "Vision API key updated" });
          break;
        }
        case "set_vision_delete": {
          this.configStore.setVision(undefined);
          saveUserConfig({ vision: null });
          client.send({ type: "config", data: this.buildConfigData() });
          client.send({ type: "info", text: "Vision model configuration removed" });
          break;
        }
        case "set_project_path": {
          const cwd = cmd.value;
          if (!cwd) {
            client.send({ type: "error", text: "Project path is required." });
            break;
          }
          const result = await (this.harness as any).updateProjectPath(cwd);
          if (result.success) {
            client.send({ type: "config", data: this.buildConfigData() });
            // Push updated session list
            const sessionManager = (this.harness as any).sessionManager;
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
                })),
              });
            }
            client.send({ type: "info", text: `Project path set to: ${cwd}` });
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
    const sessionManager = (this.harness as any).sessionManager;
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
        }));
        client.send({ type: "sessions", data });
        break;
      }
      case "save": {
        try {
          sessionManager.saveSession(agent);
          client.send({ type: "info", text: "Session saved." });
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
        if (matches.length === 0) {
          client.send({ type: "error", text: `Session not found: ${cmd.id}` });
          return;
        }
        if (matches.length > 1) {
          const matchList = matches.map((s: any) =>
            `  ${s.id.slice(0, 8)} "${s.title.slice(0, 60)}"  ${s.modelProvider}/${s.modelId}  ${s.messageCount} msgs`
          ).join("\n");
          client.send({ type: "error", text: `Ambiguous session ID prefix. Matching sessions:\n${matchList}` });
          return;
        }
        const match = matches[0];
        const result = await sessionManager.loadSession(match.id, agent);
        if (!result.success) {
          client.send({ type: "error", text: `Failed to load session: ${result.error}` });
          return;
        }
        client.send({
          type: "info",
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
        break;
      }
      case "delete": {
        if (!cmd.id) {
          client.send({ type: "error", text: "Session ID required." });
          return;
        }
        const result = sessionManager.deleteSession(cmd.id);
        if (!result.success) {
          client.send({ type: "error", text: `Failed to delete session: ${result.error}` });
          return;
        }
        client.send({ type: "info", text: "Session deleted." });
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
    const mcpManager = this.mcpManager ?? (this.harness as any).mcpManager as MCPManager | undefined;
    if (!mcpManager) {
      client.send({ type: "error", text: "No MCP manager available." });
      return;
    }

    switch (cmd.action) {
      case "list": {
        const servers = buildMcpServers(mcpManager.getStates(), (this.harness as any).driverRegistry, (this.harness as any).toolRegistry);
        client.send({ type: "mcp_state", servers });
        break;
      }
      case "refresh": {
        const driverRegistry = (this.harness as any).driverRegistry;
        mcpManager.registerDrivers(driverRegistry).then(() => {
          const servers = buildMcpServers(mcpManager.getStates(), driverRegistry, (this.harness as any).toolRegistry);
          client.send({ type: "mcp_state", servers });
          client.send({ type: "info", text: "MCP servers refreshed." });
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
          client.send({ type: "info", text: `MCP server "${cmd.serverName}" connected.` });
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
          client.send({ type: "info", text: `MCP server "${cmd.serverName}" disconnected.` });
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
    const vms = (this.harness as any).sessionManager?.visionMessages ?? [];
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
