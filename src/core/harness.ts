import { Agent } from "@mariozechner/pi-agent-core";
import type { AfterToolCallContext, AfterToolCallResult, AgentMessage, AgentTool, BeforeToolCallContext } from "@mariozechner/pi-agent-core";
import { streamSimple, Type } from "@mariozechner/pi-ai";
import type { Api, AssistantMessage, Context, ImageContent, Model, SimpleStreamOptions } from "@mariozechner/pi-ai";

import type { HarnessConfig } from "./types.js";
import { saveUserConfig } from "./config.js";
import { SessionManager } from "../session/manager.js";
import { ContextManager } from "../context/manager.js";
import { MemoryManager } from "../memory/manager.js";
import { DriverRegistry } from "../drivers/registry.js";
import { ToolRegistry } from "../drivers/tool-registry.js";
import { makeDiscoveryDriver } from "../drivers/discovery.js";
import { SkillManager } from "../skills/manager.js";
import { PermissionManager } from "../permissions/manager.js";
import { MCPManager } from "../mcp/manager.js";
import type { MCPClientEvent } from "../mcp/types.js";
import { AppHostManager } from "../mcp/app/host.js";
import { inferLayout } from "../ui/mdx/inference.js";
import { TuiBackend } from "../ui/tui-backend.js";
import type { UiBackend } from "../ui/backend.js";
import type { TuiDeps } from "../ui/tui-app.js";
import { resolveModel, getThinkingLevel, getAllModels } from "../models/index.js";

export class Harness {
  agent!: Agent;
  sessionManager: SessionManager;
  private contextManager: ContextManager;
  memoryManager: MemoryManager;
  driverRegistry: DriverRegistry;
  toolRegistry: ToolRegistry;
  skillManager: SkillManager;
  permissionManager: PermissionManager;
  mcpManager?: MCPManager;
  public appHostManager?: AppHostManager;
  private config: HarnessConfig;
  private ui!: UiBackend;
  private baseSystemPrompt = "";
  private lastMcpProgress = new Map<string, { progress?: number; total?: number; message?: string }>();
  private mcpEventUnsubscribe?: () => void;
  private shuttingDown = false;

  constructor(config: HarnessConfig) {
    this.config = config;
    this.sessionManager = new SessionManager(config.dataDir);
    this.contextManager = new ContextManager(config.context);
    this.memoryManager = new MemoryManager(config.dataDir, config.projectPath, config.memory);
    this.driverRegistry = new DriverRegistry();
    this.toolRegistry = new ToolRegistry(this.driverRegistry);
    this.skillManager = new SkillManager(config.userSkillsDir, config.projectSkillsDir);
    this.permissionManager = new PermissionManager(
      config.permissions,
      (toolName, preview, args) => this.ui.getPromptPermission()(toolName, preview, args),
      () => {},
    );
  }

  async initialize(): Promise<void> {
    for (const name of this.skillManager.listAllSkillNames()) {
      try {
        this.skillManager.activate(name, this.driverRegistry);
      } catch {
      }
    }

    for (const name of this.config.skills) {
      try {
        this.skillManager.activate(name, this.driverRegistry);
      } catch {
      }
    }

    // Register discovery driver so search_tools is available
    this.driverRegistry.register(makeDiscoveryDriver(this.toolRegistry));

    if (this.config.appHost?.enabled) {
      this.appHostManager = new AppHostManager();
      await this.appHostManager.start();
    }

    const memories = this.memoryManager.getRelevantMemories();
    const skillSection = this.skillManager.getSystemPromptSection();
    this.baseSystemPrompt = this.buildSystemPrompt(memories, skillSection);
    const systemPrompt = this.baseSystemPrompt;

    const model = resolveModel(this.config.provider, this.config.modelId);
    this.contextManager.updateModel(model.contextWindow, model.maxTokens);

    const maxTokens = this.config.maxTokens;
    const apiKey = this.config.apiKey;
    const self = this;
    this.agent = new Agent({
      initialState: {
        systemPrompt,
        model,
        tools: [this.makeSkillTool()],
        thinkingLevel: this.config.thinkingLevel,
      },
      streamFn: (m: Model<Api>, ctx: Context, opts?: SimpleStreamOptions) => streamSimple(m, ctx, {
        ...opts,
        apiKey: opts?.apiKey ?? self.config.apiKey,
        maxTokens,
        timeoutMs: 120_000,
        maxRetries: 0,
      }),
      transformContext: (msgs: AgentMessage[], signal?: AbortSignal) => {
        try {
          // Update tools based on current discovery state
          self.agent.state.tools = self.toolRegistry.buildToolsForRequest();
          // Update system prompt with current deferred tools hint
          const deferredHint = self.toolRegistry.buildDeferredToolsHint();
          self.agent.state.systemPrompt = self.baseSystemPrompt + deferredHint;
          return self.contextManager.transform(msgs, signal) as Promise<AgentMessage[]>;
        } catch (err) {
          console.error("[harness] transformContext error:", err);
          // Return original messages to keep the agent loop running
          return msgs as unknown as Promise<AgentMessage[]>;
        }
      },
      beforeToolCall: (ctx: BeforeToolCallContext, signal?: AbortSignal) =>
        this.permissionManager.check(ctx, signal),
      afterToolCall: async (ctx: AfterToolCallContext, _signal?: AbortSignal) => {
        try {
          if (ctx.toolCall.name === "search_tools" && ctx.context.tools) {
            ctx.context.tools = self.toolRegistry.buildToolsForRequest();
          }
        } catch (err) {
          console.error("[harness] afterToolCall error:", err);
        }
        return undefined as AfterToolCallResult | undefined;
      },
    });

    this.bindEvents();
    this.sessionManager.createSession(this.config.provider, this.config.modelId);
  }

  /**
   * Prompt the agent and automatically save the session after the turn completes
   * (whether successful or not). This provides an extra safety layer on top of
   * the agent_end event handler.
   */
  async promptAndSave(text: string, images?: ImageContent[]): Promise<void> {
    try {
      await this.agent.prompt(text, images);
    } finally {
      // Always save after each turn, regardless of success/failure
      this.sessionManager.trySaveSession(this.agent);
    }
  }
  /**
   * Force a session save immediately. Safe to call from anywhere,
   * including error handlers and shutdown hooks.
   */
  saveSessionNow(): void {
    this.sessionManager.trySaveSession(this.agent);
  }
  async run(ui?: UiBackend): Promise<void> {
    if (ui) this.ui = ui;
    const model = resolveModel(this.config.provider, this.config.modelId);
    const nativeImageSupport = model.input.includes("image");
    const needsOcr = !nativeImageSupport && (this.config.provider === "deepseek" || this.config.provider === "kimi-coding");
    if (!ui) {
      const tuiDeps: TuiDeps = {
        agent: this.agent,
        sessionManager: this.sessionManager,
        memoryManager: this.memoryManager,
        driverRegistry: this.driverRegistry,
        toolRegistry: this.toolRegistry,
        skillManager: this.skillManager,
        permissionManager: this.permissionManager,
        contextManager: this.contextManager,
        mcpManager: this.mcpManager,
        modelName: model.name,
        modelSupportsImages: nativeImageSupport || needsOcr,
        modelNeedsOcr: needsOcr,
        projectPath: this.config.projectPath,
        config: this.config,
        onSetModel: (id: string) => this.setModel(id),
        onSetThinking: (level: string) => this.setThinking(level),
        onSetProvider: (id: string) => this.setProvider(id),
      };
      ui = new TuiBackend(tuiDeps);
    }
    this.ui = ui;

    await this.ui.start();

    try {
      if (this.config.mcp.length > 0) {
        this.ui.addInfo(`Connecting ${this.config.mcp.length} MCP server(s)...`);
        this.mcpManager = new MCPManager(this.config.mcp);
        this.ui.setMcpManager(this.mcpManager);
        await this.mcpManager.initialize();
        this.mcpEventUnsubscribe = this.mcpManager.onEvent((event) => this.handleMcpEvent(event));
        await this.mcpManager.registerDrivers(this.driverRegistry);

        if (this.appHostManager) {
          this.appHostManager.setMcpManager(this.mcpManager);
        }

        const appOnlyNames = new Set(this.mcpManager.getAppOnlyToolNames());
        this.toolRegistry.initialize(
          this.makeSkillTool(),
          this.mcpManager.getAlwaysLoadToolNames(),
          appOnlyNames,
        );
        this.agent.state.tools = this.toolRegistry.buildToolsForRequest();
        const connected = this.mcpManager.getStates().filter((s) => s.status === "connected").length;
        const total = this.config.mcp.length;
        this.ui.addInfo(`MCP: ${connected}/${total} connected`);
        if (connected < total) {
          const errors = this.mcpManager.getStates().filter((s) => s.status === "error");
          for (const err of errors) {
            this.ui.addInfo(`MCP '${err.config.name}' failed: ${err.error ?? "unknown"}`);
          }
        }
        this.ui.focusEditor();
      } else {
        this.toolRegistry.initialize(this.makeSkillTool());
        this.agent.state.tools = this.toolRegistry.buildToolsForRequest();
      }

      if (!this.config.apiKey) {
        this.ui.addInfo([
          "Welcome to DSCode! To get started, configure your API key:",
          "",
          `  /config key your-${this.config.provider}-api-key`,
          "",
          "Then set your preferred model:",
          "",
          `  /config model ${this.config.modelId}`,
          "",
          "Type /config to see all settings.",
        ].join("\n"));
      }

      this.ui.focusEditor();
      await this.ui.waitForExit();
    } finally {
      await this.shutdown();
    }
  }

  setModel(modelId: string): void {
    const oldModelId = this.config.modelId;
    const model = resolveModel(this.config.provider, modelId);
    this.config.modelId = modelId;
    this.agent.state.model = model;
    this.contextManager.updateModel(model.contextWindow, model.maxTokens);

    const thinkingLevel = getThinkingLevel(this.config.provider, modelId);
    this.config.thinkingLevel = thinkingLevel;
    this.agent.state.thinkingLevel = thinkingLevel;

    saveUserConfig({ modelId, thinkingLevel });

    // Clear conversation context when switching models to avoid capability mismatch
    // (e.g. image messages from qwen -> deepseek which only supports text)
    if (oldModelId && modelId !== oldModelId) {
      this.agent.reset();
      this.ui.clearConversationView();
    }
  }


  setProvider(providerId: string): void {
    const oldProvider = this.config.provider;
    if (oldProvider === providerId) return;

    const models = getAllModels(providerId);
    if (!models || models.length === 0) {
      throw new Error(`Unknown provider: ${providerId}`);
    }
    const defaultModelId = models[0].id;
    const model = resolveModel(providerId, defaultModelId);

    this.config.provider = providerId;
    this.config.modelId = defaultModelId;
    this.config.thinkingLevel = getThinkingLevel(providerId, defaultModelId);
    this.agent.state.model = model;
    this.agent.state.thinkingLevel = this.config.thinkingLevel;
    this.contextManager.updateModel(model.contextWindow, model.maxTokens);

    saveUserConfig({ provider: providerId, modelId: defaultModelId, thinkingLevel: this.config.thinkingLevel });

    this.agent.reset();
    this.ui.clearConversationView();
  }
  setThinking(level: string): void {
    this.config.thinkingLevel = level as any;
    this.agent.state.thinkingLevel = level as any;
    saveUserConfig({ thinkingLevel: level });
  }

  private async shutdown(): Promise<void> {
    // Save session FIRST, before any other shutdown steps.
    // This ensures data is persisted even if later steps fail.
    // Also save regardless of shuttingDown flag — this is the last chance to persist.
    this.sessionManager.trySaveSession(this.agent);

    if (this.shuttingDown) return;
    this.shuttingDown = true;

    this.mcpEventUnsubscribe?.();
    this.mcpEventUnsubscribe = undefined;
    if (this.appHostManager) {
      try {
        await this.appHostManager.shutdown();
      } catch (err) {
        console.error("[harness] appHostManager shutdown error:", err);
      }
    }
    if (this.mcpManager) {
      try {
        await this.mcpManager.shutdown();
      } catch (err) {
        console.error("[harness] mcpManager shutdown error:", err);
      }
    }
  }

  private buildSystemPrompt(memories: string, skillSection: string): string {
    let prompt = `You are a coding assistant working in: ${this.config.projectPath}

## Rules

- When the user asks you to create, modify, or delete files, you MUST call the corresponding tool (write_file, bash, etc.) immediately. Never just describe what you plan to do without actually doing it.
- Do not explain your plan before acting. Act first, then briefly explain what you did.
- If a task requires multiple tool calls, execute them one by one. Do not stop after planning.
- Answer in the user's language. Be concise and direct.
- When writing code, produce complete, working implementations. Do not leave placeholders or TODOs.`;

    if (skillSection) {
      prompt += "\n\n" + skillSection;
    }

    prompt += `\n\n## Using Skills

You have a \`skill\` tool available. When you decide to use a skill from the list above, call \`skill\` with the skill name to load its full instructions and allowed tools. Read the instructions, then follow them.

## Tool Search

You have a \`search_tools\` tool for discovering additional tools. Some tools (especially MCP tools from connected servers) are not loaded by default to save context. These tools are listed in the "Discoverable Tools" section below.

When you need a tool that is listed as discoverable but not yet in your tool list:
1. Call \`search_tools\` with keywords describing what you need
2. The matching tools will become available in your next message
3. Then call the newly loaded tools directly

You can also load tools by exact name using \`select:\`: for example \`search_tools\` with query \`select:ToolA,ToolB\`.`;

    if (memories) {
      prompt += memories;
    }
    if (this.config.agentsMdContent) {
      prompt += "\n\n" + this.config.agentsMdContent;
    }
    return prompt;
  }


  private makeSkillTool(): AgentTool<typeof skillParams> {
    const skillManager = this.skillManager;

    const skillParams = Type.Object({
      name: Type.String({ description: "Name of the skill to load" }),
    });

    return {
      name: "skill",
      label: "Load skill",
      description: "Load and display the full SKILL.md content (frontmatter + instructions) for a given skill. Call this first before using a skill to understand its instructions and allowed tools.",
      parameters: skillParams,
      execute: async (_id, params) => {
        const manifest = skillManager.getManifest(params.name);
        if (!manifest) {
          return {
            content: [{ type: "text", text: `Error: skill not found: ${params.name}` }],
            details: { error: "not_found" },
          };
        }

        const lines: string[] = [];
        lines.push(`# ${manifest.name}`);
        lines.push(`Description: ${manifest.description}`);
        lines.push(`Source: ${manifest.source}`);
        if (manifest.tools && manifest.tools.length > 0) {
          lines.push(`Allowed tools: ${manifest.tools.join(", ")}`);
        } else {
          lines.push("Allowed tools: all driver tools");
        }
        if (manifest.instructions) {
          lines.push("");
          lines.push("## Instructions");
          lines.push(manifest.instructions);
        }

        return {
          content: [{ type: "text", text: lines.join("\n") }],
          details: { name: manifest.name },
        };
      },
    };
  }




  private registeredApps = new Map<string, string>();

  private getToolResultDetails(toolResult: unknown): Record<string, unknown> | undefined {
    if (!toolResult || typeof toolResult !== "object") return undefined;
    const details = (toolResult as Record<string, unknown>).details;
    return details && typeof details === "object" ? details as Record<string, unknown> : undefined;
  }

  private getToolPayload(toolResult: unknown): unknown {
    const details = this.getToolResultDetails(toolResult);
    return details?.mcpResult ?? toolResult;
  }

  private getStructuredContent(toolResult: unknown): Record<string, unknown> | undefined {
    const payload = this.getToolPayload(toolResult);
    if (!payload || typeof payload !== "object") return undefined;
    const structuredContent = (payload as Record<string, unknown>).structuredContent;
    return structuredContent && typeof structuredContent === "object"
      ? structuredContent as Record<string, unknown>
      : undefined;
  }

  private getEffectiveToolError(toolResult: unknown, isError: boolean): boolean {
    if (isError) return true;
    const details = this.getToolResultDetails(toolResult);
    return Boolean(details?.error);
  }

  private checkAndRegisterApp(toolName: string, toolResult?: unknown): void {
    if (!this.appHostManager || !this.mcpManager) return;
    const uiInfo = this.mcpManager.getUiToolMap().get(toolName);
    if (!uiInfo) return;

    const payload = this.getToolPayload(toolResult);
    const existingAppId = this.registeredApps.get(toolName);
    if (existingAppId) {
      if (payload !== undefined) {
        this.appHostManager.pushToApp(existingAppId, {
          jsonrpc: "2.0",
          method: "ui/notifications/tool-result",
          params: payload,
        });
      }
      return;
    }

    // Try to fetch UI resource (HTML) first
    this.mcpManager.fetchUiResource(uiInfo.serverName, uiInfo.resourceUri)
      .then(({ html, csp, permissions }) => {
        const app = this.appHostManager!.registerApp({
          resourceUri: uiInfo.resourceUri,
          toolName: uiInfo.toolName,
          serverName: uiInfo.serverName,
          html,
          csp,
          permissions,
        });
        this.registeredApps.set(toolName, app.id);
        if ("addAppNotification" in this.ui) (this.ui as any).addAppNotification?.(app);
        if (payload !== undefined) {
          this.appHostManager!.pushToApp(app.id, {
            jsonrpc: "2.0",
            method: "ui/notifications/tool-result",
            params: payload,
          });
        }
      })
      .catch((err) => {
        // No HTML resource — try auto-layout inference from structuredContent
        this.ui.addInfo(`[MDX] fetchUiResource failed: ${err.message}, falling back to data mode`);
        this.registerDataModeApp(uiInfo, toolName, toolResult);
      });
  }

  private registerDataModeApp(
    uiInfo: { resourceUri: string; toolName: string; serverName: string },
    toolName: string,
    toolResult?: unknown,
  ): void {
    if (!this.appHostManager) return;

    const payload = this.getToolPayload(toolResult);
    const structuredContent = this.getStructuredContent(toolResult);
    const result = payload as Record<string, unknown> | undefined;

    if (!structuredContent) {
      this.ui.addInfo(`[MDX] no structuredContent (keys: ${result ? Object.keys(result).join(",") : "null"})`);
      return;
    }

    try {
      const layout = inferLayout(structuredContent, uiInfo.toolName);
      this.ui.addInfo(`[MDX] layout: ${layout.mdx.slice(0, 80)}...`);

      const app = this.appHostManager!.registerApp({
        resourceUri: uiInfo.resourceUri,
        toolName: uiInfo.toolName,
        serverName: uiInfo.serverName,
        mdx: layout.mdx,
        data: structuredContent,
      });
      this.registeredApps.set(toolName, app.id);
      if ("addAppNotification" in this.ui) (this.ui as any).addAppNotification?.(app);

      if (payload !== undefined) {
        this.appHostManager!.pushToApp(app.id, {
          jsonrpc: "2.0",
          method: "ui/notifications/tool-result",
          params: payload,
        });
      }
    } catch (e: any) {
      this.ui.addInfo(`[MDX] error: ${e.message}`);
    }
  }

  private bindEvents(): void {
    this.agent.subscribe((event) => {
      switch (event.type) {
        case "message_update": {
          const ev = event.assistantMessageEvent;
          if (!ev) break;
          switch (ev.type) {
            case "thinking_delta":
              this.ui.thinkingDelta(ev.delta);
              break;
            case "text_delta":
              this.ui.textDelta(ev.delta);
              break;
          }
          break;
        }
        case "tool_execution_start":
          this.ui.toolStart(event.toolName, event.args);
          break;
        case "tool_execution_end": {
          const payload = this.getToolPayload(event.result);
          const effectiveIsError = this.getEffectiveToolError(event.result, event.isError);
          this.ui.toolEnd(
            event.toolName,
            payload,
            effectiveIsError,
          );
          this.checkAndRegisterApp(event.toolName, event.result);
          break;
        }
      }
    });

    this.agent.subscribe(async (event) => {
      try {
        if (event.type === "agent_end") {
          this.ui.setProcessing(false);
          this.sessionManager.saveSession(this.agent);
        }
        if (event.type === "agent_start") {
          this.ui.startAssistantMessage();
        }
        if (event.type === "turn_end") {
          this.ui.finishAssistantMessage();
          const msg = event.message as AssistantMessage;
          if (msg?.stopReason === "length") {
            this.ui.addInfo("Output truncated (hit max_tokens). Continue from where you left off.");
          }
          if (msg?.stopReason === "error" && msg?.errorMessage) {
            this.ui.addError(`Model error: ${msg.errorMessage}`);
          }
        }
      } catch (err) {
        // If the event handler fails, still try to save session
        console.error("[harness] agent event handler error:", err);
        this.sessionManager.trySaveSession(this.agent);
      }
    });
  }

  private handleMcpEvent(event: MCPClientEvent): void {
    switch (event.type) {
      case "progress": {
        const key = `${event.serverName}:${event.params.progressToken}`;
        const previous = this.lastMcpProgress.get(key);
        const next = {
          progress: event.params.progress,
          total: event.params.total,
          message: event.params.message,
        };
        this.lastMcpProgress.set(key, next);

        const shouldReport = !previous
          || event.params.message !== previous.message
          || this.isProgressComplete(event.params.progress, event.params.total)
          || this.progressBucket(event.params.progress, event.params.total) !== this.progressBucket(previous.progress, previous.total);

        if (shouldReport) {
          const summary = this.formatProgress(event.params.progress, event.params.total);
          const detail = event.params.message ? ` ${event.params.message}` : "";
          this.ui.addInfo(`MCP ${event.serverName}: ${summary}${detail}`);
        }
        return;
      }
      case "message": {
        const level = (event.params.level ?? "info").toLowerCase();
        const prefix = `MCP ${event.serverName}`;
        const text = this.stringifyMcpMessage(event.params.data);
        const label = event.params.logger ? `${event.params.logger}: ` : "";
        if (level === "error") {
          this.ui.addError(`${prefix}: ${label}${text}`);
        } else if (level === "warning" || level === "warn") {
          this.ui.addInfo(`${prefix} warning: ${label}${text}`);
        } else {
          this.ui.addInfo(`${prefix}: ${label}${text}`);
        }
        return;
      }
      case "tools_list_changed":
        this.ui.addInfo(`MCP ${event.serverName}: refreshing tool list...`);
        return;
      case "tools_refreshed":
        this.ui.addInfo(`MCP ${event.serverName}: tool list refreshed (${event.toolCount} tools)`);
        return;
      case "tools_refresh_failed":
        this.ui.addError(`MCP ${event.serverName}: tool refresh failed: ${event.error}`);
        return;
      case "resources_list_changed":
        this.ui.addInfo(`MCP ${event.serverName}: resources updated`);
        return;
      case "cancelled":
        this.ui.addInfo(`MCP ${event.serverName}: request cancelled` + (event.params.reason ? ` (${event.params.reason})` : ""));
        return;
      default:
        return;
    }
  }

  private progressBucket(progress?: number, total?: number): number {
    if (typeof progress !== "number") return -1;
    if (typeof total === "number" && total > 0) {
      return Math.min(10, Math.floor((progress / total) * 10));
    }
    return Math.floor(progress / 10);
  }

  private isProgressComplete(progress?: number, total?: number): boolean {
    if (typeof progress !== "number") return false;
    if (typeof total === "number" && total > 0) {
      return progress >= total;
    }
    return progress >= 100;
  }

  private formatProgress(progress?: number, total?: number): string {
    if (typeof progress !== "number") return "progress update";
    if (typeof total === "number" && total > 0) {
      const percent = Math.max(0, Math.min(100, Math.round((progress / total) * 100)));
      return `progress ${percent}% (${progress}/${total})`;
    }
    return `progress ${progress}`;
  }

  private stringifyMcpMessage(data: unknown): string {
    if (typeof data === "string") return data;
    try {
      return JSON.stringify(data);
    } catch {
      return String(data);
    }
  }
}
