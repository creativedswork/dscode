import { createServer, request as httpRequest } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";
import type { ImageContent } from "@mariozechner/pi-ai";

import type { UiBackend } from "../backend.js";
import type { HarnessConfig, PermissionPromptResult } from "../../core/types.js";
import { maskApiKey } from "../../core/config.js";
import { executeSlashCommand } from "../commands.js";
import type { Harness } from "../../core/harness.js";
import type { MCPManager } from "../../mcp/manager.js";
import type { AppHostManager } from "../../mcp/app/host.js";
import type { AppInstance } from "../../mcp/app/types.js";
import { buildMcpServers } from "../mcp-browser.js";
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

export interface WebUiOptions {
  port: number;
  harness: Harness;
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
  private httpServer: ReturnType<typeof createServer>;
  private wsServer: WsServer;
  private currentClient: WebSocketClient | null = null;
  private exitPromise!: Promise<void>;
  private exitResolve!: () => void;
  private appHostManager?: AppHostManager;

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
          console.log(`  [33m⚠ Port ${this.port} is already in use.[0m`);
          console.log(`  Try a different port: [36mnode ./dist/dscode.mjs --web --web-port ${this.port + 1}[0m`);
          console.log(`  Or kill the existing process: [36mlsof -ti:${this.port} | xargs kill[0m`);
          console.log("");
          this.exitResolve();
          resolve();
          return;
        }
        reject(err);
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
    this.broadcast({ type: "user_message", text });
  }

  startAssistantMessage(): void {
    this.currentAssistant = { thinking: "", text: "", tools: [] };
    this.broadcast({ type: "assistant_start" });
  }

  thinkingDelta(delta: string): void {
    if (this.currentAssistant) {
      this.currentAssistant.thinking += delta;
    }
    this.broadcast({ type: "thinking_delta", delta });
  }

  textDelta(delta: string): void {
    if (this.currentAssistant) {
      this.currentAssistant.text += delta;
    }
    this.broadcast({ type: "text_delta", delta });
  }

  toolStart(name: string, args: unknown): void {
    this.broadcast({ type: "tool_start", name, args });
  }

  toolEnd(name: string, result: unknown, isError: boolean): void {
    const resultStr = typeof result === "string" ? result.slice(0, 200) : JSON.stringify(result).slice(0, 200);
    if (this.currentAssistant) {
      this.currentAssistant.tools = this.currentAssistant.tools.filter((t) => t.name !== name || t.result !== "");
      this.currentAssistant.tools.push({
        name,
        args: "",
        result: resultStr,
        isError,
      });
    }
    this.broadcast({ type: "tool_end", name, result: resultStr, isError });
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

  setMcpManager(_mcpManager?: MCPManager): void {
    // MCP state sent on demand via mcp command
  }

  openMcpBrowser(): void {
    // In web mode, initiated by client
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
        const text = cmd.text;
        const images = cmd.images;

        if (images && images.length > 0) {
          for (const img of images) {
            this.pendingImages.push({ data: img.data, mimeType: img.mimeType } as ImageContent);
          }
        }

        if (text.startsWith("/")) {
          this.handleSlashCommand(client, text);
          return;
        }

        // Broadcast user message to client before sending to agent
        client.send({ type: "user_message", text } as any);
        try {
          const imageContents = this.pendingImages.length > 0 ? [...this.pendingImages] : undefined;
          this.pendingImages = [];
          await this.harness.agent.prompt(text, imageContents);
        } catch (err) {
          client.send({
            type: "error",
            text: err instanceof Error ? err.message : String(err),
          });
        }
        break;
      }

      case "abort": {
        this.harness.agent.abort();
        break;
      }

      case "permission": {
        if (this.permissionResolve) {
          const resolve = this.permissionResolve;
          this.permissionResolve = null;
          resolve({
            decision: cmd.decision === "always_allow" ? "allow" : cmd.decision,
            rememberForSession: cmd.decision === "always_allow",
            persistRule: cmd.persistRule ? undefined : undefined,
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
        this.handleSession(client, cmd);
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
        onSetModel: (id: string) => (this.harness as any).setModel(id),
        onSetThinking: (level: string) => (this.harness as any).setThinking(level),
      };

      const mockTui = {
        addInfo: (msg: string) => client.send({ type: "info", text: msg }),
        addError: (msg: string) => client.send({ type: "error", text: msg }),
        addUserMessage: () => {},
        addPendingImage: () => {},
        openMcpBrowser: () => {},
        clearConversationView: () => {},
        focusEditor: () => {},
        setProcessing: () => {},
        getPromptPermission: () => () => Promise.resolve({ decision: "deny" } as PermissionPromptResult),
      };

      executeSlashCommand(text, ctx, mockTui as any);

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

  private handleConfig(
    client: WebSocketClient,
    cmd: ClientCommand & { type: "config" },
  ): void {
    try {
      switch (cmd.action) {
        case "set_model": {
          (this.harness as any).setModel(cmd.value);
          client.send({ type: "config", data: this.buildConfigData() });
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
          this.config.apiKey = cmd.value;
          process.env.DEEPSEEK_API_KEY = cmd.value;
          client.send({ type: "config", data: this.buildConfigData() });
          client.send({ type: "info", text: "API key updated" });
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

  private handleSession(
    client: WebSocketClient,
    cmd: ClientCommand & { type: "session" },
  ): void {
    const sessionManager = (this.harness as any).sessionManager;
    const agent = this.harness.agent;

    switch (cmd.action) {
      case "list": {
        const sessions = sessionManager.listSessions();
        const data: SessionInfo[] = sessions.slice(0, 50).map((s: any) => ({
          id: s.id,
          title: s.title,
          updatedAt: s.updatedAt,
          messageCount: s.messageCount,
        }));
        client.send({ type: "sessions", data });
        break;
      }
      case "save": {
        sessionManager.saveSession(agent);
        client.send({ type: "info", text: "Session saved." });
        const sessions = sessionManager.listSessions();
        client.send({
          type: "sessions",
          data: sessions.slice(0, 50).map((s: any) => ({
            id: s.id,
            title: s.title,
            updatedAt: s.updatedAt,
            messageCount: s.messageCount,
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
        const match = sessions.find((s: any) => s.id.startsWith(cmd.id!));
        if (!match) {
          client.send({ type: "error", text: `Session not found: ${cmd.id}` });
          return;
        }
        sessionManager.loadSession(match.id, agent);
        client.send({ type: "info", text: `Loaded session: ${match.title}` });
        client.send({
          type: "ready",
          model: this.config.modelId,
          config: this.buildConfigData(),
          messages: this.buildConversationHistory(),
        });
        break;
      }
      case "delete": {
        if (!cmd.id) {
          client.send({ type: "error", text: "Session ID required." });
          return;
        }
        sessionManager.deleteSession(cmd.id);
        client.send({ type: "info", text: "Session deleted." });
        const sessions = sessionManager.listSessions();
        client.send({
          type: "sessions",
          data: sessions.slice(0, 50).map((s: any) => ({
            id: s.id,
            title: s.title,
            updatedAt: s.updatedAt,
            messageCount: s.messageCount,
          })),
        });
        break;
      }
    }
  }

  private handleMcp(client: WebSocketClient, _cmd: ClientCommand & { type: "mcp" }): void {
    const mcpManager = (this.harness as any).mcpManager;
    const driverRegistry = (this.harness as any).driverRegistry;
    const toolRegistry = (this.harness as any).toolRegistry;

    if (!mcpManager) {
      client.send({ type: "mcp_state", servers: [] });
      return;
    }

    const states = mcpManager.getStates();
    const servers = buildMcpServers(states, driverRegistry, toolRegistry);

    const serverInfos: McpServerInfo[] = servers.map((s: any) => ({
      name: s.name,
      description: s.description,
      status: s.status,
      error: s.error,
      toolCount: s.toolCount,
      tools: s.tools.map((t: any) => ({
        name: t.name,
        label: t.label,
        description: t.description,
        state: t.state,
      })),
      transport: s.transport,
      protocolVersion: s.protocolVersion,
    }));

    client.send({ type: "mcp_state", servers: serverInfos });
  }

  // ── Private: HTTP request handling ──

  private handleHttpRequest(req: IncomingMessage, res: ServerResponse): void {
    const url = new URL(req.url ?? "/", `http://localhost:${this.port}`);
    const path = url.pathname;

    // Proxy MCP App routes to AppHostManager
    if (path.startsWith("/mcp-app/") || path.startsWith("/api/bridge/") || path.startsWith("/api/app/")) {
      if (this.appHostManager) {
        this.proxyToAppHost(req, res);
        return;
      }
      res.writeHead(503);
      res.end("App host not available");
      return;
    }

    // API endpoints
    if (path === "/api/config" && req.method === "GET") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(this.buildConfigData()));
      return;
    }

    if (path === "/api/sessions" && req.method === "GET") {
      const sessionManager = (this.harness as any).sessionManager;
      const sessions = sessionManager.listSessions();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(sessions.slice(0, 50)));
      return;
    }

    if (path === "/api/conversation" && req.method === "GET") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(this.buildConversationHistory()));
      return;
    }

    // Static file serving
    this.serveStatic(res, path);
  }

  /**
   * Proxy requests to the AppHostManager's internal HTTP server.
   * Rewrites /mcp-app/{appId} to /app/{appId} on the app host.
   */
  private proxyToAppHost(req: IncomingMessage, res: ServerResponse): void {
    if (!this.appHostManager) {
      res.writeHead(503);
      res.end("App host not available");
      return;
    }

    const appHostPort = this.appHostManager.getPort();
    // Rewrite /mcp-app/{id} → /app/{id}
    const targetPath = req.url!.replace(/^\/mcp-app/, "/app");

    const opts = {
      hostname: "127.0.0.1",
      port: appHostPort,
      path: targetPath,
      method: req.method,
      headers: { ...req.headers },
    };

    const proxyReq = httpRequest(opts, (proxyRes) => {
      // Copy status and headers (except CSP which may block iframe)
      const csp = proxyRes.headers["content-security-policy"];
      if (csp) {
        // Relax CSP: allow embedding in iframe from same origin
        const relaxedCsp = String(csp)
          .replace(/frame-ancestors\s+[^;]+;?/gi, "frame-ancestors 'self';")
          .replace(/frame-src\s+[^;]+;?/gi, "frame-src 'self';");
        proxyRes.headers["content-security-policy"] = relaxedCsp;
      }
      res.writeHead(proxyRes.statusCode ?? 200, proxyRes.headers);
      proxyRes.pipe(res);
    });

    proxyReq.on("error", () => {
      res.writeHead(502);
      res.end("Bad gateway");
    });

    if (req.method === "POST" || req.method === "PUT") {
      req.pipe(proxyReq);
    } else {
      proxyReq.end();
    }
  }

  private serveStatic(res: ServerResponse, path: string): void {
    const __dirname = fileURLToPath(new URL(".", import.meta.url));
    // Resolve dist/web/ from the project root: walk up from __dirname until we find package.json
    let projectRoot = __dirname;
    while (!existsSync(join(projectRoot, "package.json")) && projectRoot !== join(projectRoot, "..")) {
      projectRoot = join(projectRoot, "..");
    }
    const webDir = join(projectRoot, "dist", "web");

    let filePath = join(webDir, path === "/" ? "index.html" : path);

    if (!existsSync(filePath)) {
      filePath = join(webDir, "index.html");
    }

    if (!existsSync(filePath)) {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(`<!DOCTYPE html>
<html>
<head><title>DSCode Web UI</title></head>
<body style="font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#0d1117;color:#c9d1d9">
<div style="text-align:center">
  <h1 style="color:#58a6ff">DSCode Web UI</h1>
  <p>Frontend not built yet. Run <code style="background:#21262d;padding:2px 8px;border-radius:4px">npm run build:web</code> to build.</p>
  <p>Then connect via WebSocket at <code style="background:#21262d;padding:2px 8px;border-radius:4px">ws://localhost:${this.port}/ws</code></p>
</div>
</body></html>`);
      return;
    }

    const ext = extname(filePath).toLowerCase();
    const mimeTypes: Record<string, string> = {
      ".html": "text/html; charset=utf-8",
      ".js": "application/javascript",
      ".css": "text/css",
      ".json": "application/json",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".gif": "image/gif",
      ".svg": "image/svg+xml",
      ".ico": "image/x-icon",
      ".woff": "font/woff",
      ".woff2": "font/woff2",
    };

    const contentType = mimeTypes[ext] || "application/octet-stream";

    try {
      const content = readFileSync(filePath);
      res.writeHead(200, { "Content-Type": contentType });
      res.end(content);
    } catch {
      res.writeHead(404);
      res.end("Not found");
    }
  }

  // ── Private: Helpers ──

  private broadcast(event: ServerEvent): void {
    if (this.currentClient) {
      this.currentClient.send(event);
    }
  }

  private buildConfigData(): ConfigData {
    return {
      provider: this.config.provider,
      modelId: this.config.modelId,
      apiKey: maskApiKey(this.config.apiKey),
      thinkingLevel: this.config.thinkingLevel,
      projectPath: this.config.projectPath,
      maxTokens: this.config.maxTokens,
    };
  }

  private buildConversationHistory(): ConversationMessage[] {
    try {
      const history = this.harness.agent.state.messages ?? [];
      return history
        .filter((m: any) => m.role === "user" || m.role === "assistant")
        .map((m: any): ConversationMessage => {
          let thinking: string | undefined;
          const textParts: string[] = [];

          for (const part of m.content ?? []) {
            if (part.type === "thinking") {
              thinking = (thinking ?? "") + part.text;
            } else if (part.type === "text") {
              textParts.push(part.text);
            }
          }

          return {
            role: m.role,
            content: textParts.join("\n"),
            thinking,
            tools: m.toolCalls?.map((tc: any) => ({
              name: tc.name,
              result: typeof tc.result === "string"
                ? tc.result.slice(0, 200)
                : "",
              args: JSON.stringify(tc.arguments).slice(0, 80),
              isError: Boolean(tc.error),
            })),
          };
        });
    } catch {
      return [];
    }
  }
}
