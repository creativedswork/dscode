import { existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { Agent as PiAgentRuntime } from "@earendil-works/pi-agent-core";
import type { AfterToolCallContext, AfterToolCallResult, AgentMessage, AgentTool, BeforeToolCallContext } from "@earendil-works/pi-agent-core";
import { Type } from "@earendil-works/pi-ai";
import type { Api, AssistantMessage, Context, ImageContent, Model, SimpleStreamOptions } from "@earendil-works/pi-ai";

import { streamSimple } from "../models/index.js";
import type {
  HarnessConfig,
  SwitchSessionRequest,
  SwitchSessionResult,
} from "./types.js";
import { saveUserConfig, loadScopedSettings, projectSettingsPath, userSettingsPath, loadMcpServers } from "./config.js";
import { SessionManager } from "../session/manager.js";
import { ContextManager } from "../context/manager.js";
import { MemoryManager } from "../memory/manager.js";
import { DriverRegistry } from "../drivers/registry.js";
import { ToolRegistry } from "../drivers/tool-registry.js";
import { makeDiscoveryDriver } from "../drivers/discovery.js";
import { formatLoadedSkill, SkillManager } from "../skills/manager.js";
import { CommandManager } from "../commands/manager.js";
import {
  PermissionManager,
  PermissionPromptQueue,
} from "../permissions/manager.js";
import { MCPManager } from "../mcp/manager.js";
import type { MCPClientEvent } from "../mcp/types.js";
import { AppHostManager } from "../mcp/app/host.js";
import { inferLayout } from "../ui/mdx/inference.js";
import { TuiBackend } from "../ui/tui-backend.js";
import type { UiBackend } from "../ui/backend.js";
import { projectTranscriptToolActivities } from "../ui/shared/tool-result-projection.js";
import type { HarnessAPI } from "./harness-api.js";
import { resolveModel, getThinkingLevel, getAllModels, getEnvApiKey } from "../models/index.js";
import { ImagePipeline } from "../drivers/vision/pipeline.js";
import type { ProcessOptions, ProcessResult, ProgressInfo } from "../drivers/vision/types.js";
import { ImageCache } from "../utils/image-cache.js";
import type { AgentSessionMessage, ImageRef, VisionMessage } from "./types.js";
import { initCheckpointSystem, shutdownCheckpointSystem } from "../checkpoint/index.js";
import { ConfigWatch } from "./config-watch.js";
import { recordInvalidation, consumePendingNotices } from "../context/anchor-invalidation.js";
import { HarnessEventBus } from "./events.js";
import type { Logger } from "../utils/logger.js";
import { AgentApplicationRegistry } from "../agents/application/registry.js";
import type { AgentApplicationSnapshot } from "../agents/application/types.js";
import { loadAgentMemory } from "../agents/application/memory.js";
import { AgentProcessRuntimeFactory } from "../agents/runtimes/factory.js";
import { PiAgentRuntimeAdapter } from "../agents/runtimes/pi-agent-runtime.js";
import {
  AgentRuntimeFailure,
  FailedAgentRuntime,
  type AgentProcessRuntime,
} from "../agents/runtimes/runtime.js";
import {
  OcrFallbackHandler,
  type VisionAgentOutput,
} from "../agents/runtimes/ocr-fallback.js";
import { resolveVisionApplicationConfig } from "../agents/runtimes/vision-model.js";
import { AgentProcessStore } from "../agents/process/store.js";
import { AgentSupervisor } from "../agents/process/supervisor.js";
import { AgentFallbackRegistry } from "../agents/process/fallback.js";
import { createMainAgentContext } from "../agents/process/context.js";
import type {
  AgentContext as ProcessAgentContext,
  AgentExitResult,
} from "../agents/process/types.js";
import { checkAgentCapability } from "../agents/process/capability.js";
import {
  AGENT_PROCESS_TOOL_NAMES,
  makeAgentProcessTools,
} from "../agents/tools/process-tools.js";
import { formatSubagentLabel } from "../ui/shared/agent-label.js";

const MAIN_PROCESS_APPLICATION: AgentApplicationSnapshot = Object.freeze({
  name: "main",
  description: "Primary dscode process",
  systemPrompt: "",
  permissionMode: "default",
  source: { kind: "internal", path: "src/core/harness.ts" } as const,
  digest: "0".repeat(64),
  registryGeneration: 0,
});

export function shouldUseNativeMainImagePath(
  agentsEnabled: boolean,
  hasVisionConfig: boolean,
  mainSupportsImages: boolean,
): boolean {
  return !agentsEnabled && !hasVisionConfig && mainSupportsImages;
}

export class Harness implements HarnessAPI {
  private piAgentRuntime!: PiAgentRuntime;
  sessionManager: SessionManager;
  contextManager: ContextManager;
  memoryManager: MemoryManager;
  driverRegistry: DriverRegistry;
  toolRegistry: ToolRegistry;
  skillManager: SkillManager;
  commandManager: CommandManager;
  permissionManager: PermissionManager;
  mcpManager: MCPManager | undefined;
  appHostManager?: AppHostManager;
  configStore: ConfigWatch;
  config: HarnessConfig;
  readonly logger: Logger;
  readonly events: HarnessEventBus;
  imagePipeline: ImagePipeline;
  applicationRegistry: AgentApplicationRegistry;
  agentSupervisor!: AgentSupervisor;
  private runtimeFactory!: AgentProcessRuntimeFactory;
  private processStore: AgentProcessStore;
  private mainAgentId = "";
  private ui!: UiBackend;
  private baseSystemPrompt = "";
  private debug = false;
  private debugPromptLastHash = "";
  private lastMcpProgress = new Map<string, { progress?: number; total?: number; message?: string }>();
  private mcpEventUnsubscribe?: () => void;
  private shuttingDown = false;
  private turnIndex = 0;
  private activeVisionAgentId: string | null = null;
  private activeVisionAbortController: AbortController | null = null;
  private autoSaveTimer: NodeJS.Timeout | undefined;
  private lastSavedMessageCount: number = 0;
  private activeMainTurn: Promise<void> | null = null;
  private sessionSwitchInProgress = false;
  private readonly permissionPromptQueue = new PermissionPromptQueue();
  private readonly pendingBackgroundContinuationSessions = new Set<string>();
  private backgroundContinuationDrain: Promise<void> | null = null;

  get agent(): PiAgentRuntime {
    return this.piAgentRuntime;
  }

  constructor(config: HarnessConfig, logger: Logger, debug?: boolean) {
    this.logger = logger;
    this.configStore = new ConfigWatch(config);
    this.debug = debug ?? false;
    this.config = this.configStore.get() as HarnessConfig;
    this.events = new HarnessEventBus(logger);
    this.applicationRegistry = new AgentApplicationRegistry({
      projectPath: config.projectPath,
      configDir: config.configDir,
      managedDir: config.managedAgentsDir,
    });
    this.processStore = new AgentProcessStore(config.dataDir, config.projectPath);
    this.sessionManager = new SessionManager(config.dataDir, config.projectPath, logger);
    this.contextManager = new ContextManager(config.context);
    this.sessionManager.bindEvents(this.events);
    this.memoryManager = new MemoryManager(config.dataDir, config.projectPath, config.memory);
    this.driverRegistry = new DriverRegistry();
    this.toolRegistry = new ToolRegistry(this.driverRegistry);
    this.commandManager = new CommandManager(config.userCommandsDir, config.projectCommandsDir);
    this.skillManager = new SkillManager(config.userSkillsDir, config.projectSkillsDir);
    this.permissionManager = new PermissionManager(
      config.permissions,
      (toolName, preview, args) => this.permissionPromptQueue.enqueue(
        () => this.ui.getPromptPermission()(toolName, preview, args),
      ),
      config.projectPath,
      () => {},
    );
    this.imagePipeline = new ImagePipeline({
      visionConfig: config.vision,
      fallbackApiKey: config.apiKey,
      onWarning: (msg: string) => {
        if (this.ui) this.events.emit({ type: "ui:warning", text: msg });
      },
    });
  }

  async initialize(): Promise<void> {
    await this.applicationRegistry.load();
    for (const diagnostic of this.applicationRegistry.getDiagnostics()) {
      this.logger.warn("AgentApplication", `${diagnostic.source.path}: ${diagnostic.message}`);
    }

    const disabled = new Set(this.config.disabledSkills ?? []);
    for (const name of this.skillManager.listAllSkillNames()) {
      if (disabled.has(name)) continue;
      try {
        this.skillManager.activate(name, this.driverRegistry);
      } catch {
      }
    }

    for (const name of this.config.skills) {
      if (disabled.has(name)) continue;
      try {
        this.skillManager.activate(name, this.driverRegistry);
      } catch {
      }
    }

    // Register discovery driver so search_tools is available

    // 4.2: Initialize checkpoint system for baseline hygiene
    const sessionId = this.sessionManager.getCurrentSessionId?.() ?? `session-${Date.now()}`;
    initCheckpointSystem(this.config.projectPath, sessionId);
    this.driverRegistry.register(makeDiscoveryDriver(this.toolRegistry));

    if (this.config.appHost?.enabled) {
      this.appHostManager = new AppHostManager();
      await this.appHostManager.start();
    }

    const memories = this.memoryManager.getRelevantMemories();
    const skillSection = this.skillManager.getSystemPromptSection();
    this.baseSystemPrompt = this.buildSystemPrompt(memories, skillSection, this.commandManager.getSystemPromptSection());
    const systemPrompt = this.baseSystemPrompt.replace("__DEFERRED_HINT__", this.toolRegistry.buildDeferredToolsHint());

    const model = resolveModel(this.config.provider, this.config.modelId);
    this.contextManager.updateModel(model.contextWindow, model.maxTokens);

    const maxTokens = this.config.maxTokens;
    const apiKey = this.config.apiKey;
    const self = this;
    this.piAgentRuntime = new PiAgentRuntime({
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
        maxRetries: self.config.retry.maxRetries,
        maxRetryDelayMs: self.config.retry.maxDelayMs,
      }),
      transformContext: async (msgs: AgentMessage[], signal?: AbortSignal) => {
        try {
          const activeSessionId = self.sessionManager.getCurrentSessionId();
          const notifications = activeSessionId
            ? self.agentSupervisor?.consumeNotifications(activeSessionId) ?? []
            : [];
          if (notifications.length > 0) {
            msgs.unshift({
              role: "user",
              content: self.formatAgentNotifications(notifications),
            } as AgentMessage);
          }
          // S2b: Inject anchor invalidation notices into conversation (NOT system prompt)
          const invalidationNotice = consumePendingNotices();
          if (invalidationNotice) {
            msgs.unshift({
              role: "user",
              content: invalidationNotice,
            } as AgentMessage);
          }
          // Update tools based on current discovery state
          self.agent.state.tools = self.toolRegistry.buildToolsForRequest();
          // Update system prompt with current deferred tools hint
          const deferredHint = self.toolRegistry.buildDeferredToolsHint();
          self.agent.state.systemPrompt = self.baseSystemPrompt.replace("__DEFERRED_HINT__", deferredHint);
          await self.dumpDebugPrompt();
          return self.contextManager.transform(msgs, signal) as Promise<AgentMessage[]>;
        } catch (err) {
          this.logger.error("TransformContext", String(err));
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
            // S2b: Record anchor invalidation on write_file/overwrite_file success
            const toolName = ctx.toolCall.name;
            if ((toolName === "write_file" || toolName === "overwrite_file") &&
                ctx.result && !("error" in (ctx.result as any))) {
              const args = ctx.toolCall.arguments as any;
              const res = ctx.result as any;
              if (res.details?.file_version && args.path) {
                recordInvalidation(
                  args.path,
                  res.details?.lines ?? 0,
                  res.details.file_version,
                );
              }
            }
        } catch (err) {
          this.logger.error("AfterToolCall", String(err));
        }
        // If signal is aborted, terminate the agent loop immediately
        if (_signal?.aborted) {
          return { terminate: true };
        }
        return undefined;
      },    });

    this.bindEvents();
    const session = this.sessionManager.createSession(this.config.provider, this.config.modelId);
    this.runtimeFactory = new AgentProcessRuntimeFactory(
      (application, context, agentId) => this.createSubagentRuntime(application, context, agentId),
    );
    const fallbackRegistry = new AgentFallbackRegistry();
    fallbackRegistry.register(new OcrFallbackHandler(this.events));
    this.agentSupervisor = new AgentSupervisor(
      this.applicationRegistry,
      (application, context, agentId) => this.runtimeFactory.create(application, context, agentId),
      this.processStore,
      this.events,
      this.logger,
      () => this.getAvailableAgentToolNames(),
      1,
      fallbackRegistry,
    );
    this.events.on("agent:exit", (event) => {
      this.recordSubagentExit(event.result.agentId);
      this.scheduleBackgroundAgentContinuation(event.result.agentId);
    });
    const mainContext = createMainAgentContext(
      this.config.projectPath,
      session.id,
      this.getAvailableAgentToolNames(),
      this.config.permissions.denyPatterns,
    );
    const mainProcess = this.agentSupervisor.registerMain(
      MAIN_PROCESS_APPLICATION,
      new PiAgentRuntimeAdapter(this.agent),
      mainContext,
    );
    this.mainAgentId = mainProcess.agentId;
    const updateMainSession = (sessionId: string) => {
      void this.agentSupervisor.updateParentSession(
        this.mainAgentId,
        sessionId,
        this.config.projectPath,
      );
    };
    this.events.on("session:created", (event) => updateMainSession(event.id));
    if (this.config.agents.enabled) {
      this.driverRegistry.register({
        name: "agent-process",
        description: "Agent process creation, inspection, waiting, signalling, and IPC",
        tools: makeAgentProcessTools(this.agentSupervisor, this.mainAgentId),
        source: "builtin",
      });
    }
    await this.dumpDebugPrompt();
  }

  /**
   * Prompt the agent with retry logic for transient errors.
   * On success, saves the session. On failure, retries up to maxRetries
   * with exponential backoff, then saves the failed state.
   */
  async promptAndSave(text: string, images?: ImageContent[]): Promise<void> {
    return this.runMainTurn(() => this.promptAndSaveInternal(text, images));
  }

  private async promptAndSaveInternal(text: string, images?: ImageContent[]): Promise<void> {
    const maxRetries = this.config.retry.maxRetries;
    const baseDelay = this.config.retry.baseDelayMs;
    const maxDelay = this.config.retry.maxDelayMs;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const preTurnLength = (this.agent.state.messages as any[]).length;

      // On retry attempts, rollback messages and wait
      if (attempt > 0) {
        // Truncate messages to pre-turn state (removes failed assistant message)
        (this.agent.state.messages as any[]).length = preTurnLength;

        const delay = this.computeRetryDelay(attempt, baseDelay, maxDelay);
        this.events.emit({ type: "llm:retry", attempt,
          maxRetries,
          delayMs: delay,
          error: "",
          level: "turn",
        });
        await this.sleep(delay);
      }

      this.events.emit({ type: "turn:start" });
      await this.agent.prompt(text, images);

      // Check if last assistant message has an error
      const msgs = this.agent.state.messages as any[];
      const lastAssistantMsg = this.findLastAssistantMessage(msgs);

      if (!lastAssistantMsg || lastAssistantMsg.stopReason !== "error") {
        // Success — save and return
        this.sessionManager.trySaveSession(this.agent);
        this.lastSavedMessageCount = (this.agent.state.messages as any[]).length;

        return;
      }

      const errorMsg = lastAssistantMsg.errorMessage ?? "Unknown model error";

      // Non-retryable errors: auth, invalid model, etc.
      if (!this.isRetryableError(errorMsg)) {
        this.events.emit({ type: "llm:retry", attempt: attempt + 1,
          maxRetries,
          delayMs: 0,
          error: errorMsg,
          level: "turn",
        });
        this.events.emit({ type: "ui:error", text: `Model error: ${errorMsg}` });
        this.events.emit({ type: "turn:error", error: errorMsg, attempt: attempt + 1, maxRetries });        this.sessionManager.trySaveSession(this.agent);
        this.lastSavedMessageCount = (this.agent.state.messages as any[]).length;

        return;
      }


      // Last retry attempt exhausted
      if (attempt >= maxRetries) {
        this.events.emit({ type: "llm:retry", attempt: attempt + 1,
          maxRetries,
          delayMs: 0,
          error: errorMsg,
          level: "turn",
        });
        this.events.emit({ type: "ui:error", text: `Model error: ${errorMsg}` });
        this.events.emit({ type: "turn:error", error: errorMsg, attempt: attempt + 1, maxRetries });        this.events.emit({ type: "ui:error", text: "✗ All retries exhausted" });
        this.sessionManager.trySaveSession(this.agent);
        this.lastSavedMessageCount = (this.agent.state.messages as any[]).length;
        return;
      }

      // Will retry — show progress
      this.events.emit({ type: "llm:retry", 
        attempt: attempt + 1,
        maxRetries,
        delayMs: this.computeRetryDelay(attempt + 1, baseDelay, maxDelay),
        error: errorMsg,
        level: "turn",
      });
    }
  }

  private runMainTurn(operation: () => Promise<void>): Promise<void> {
    if (this.sessionSwitchInProgress) {
      return Promise.reject(new Error("Cannot submit a prompt while a session switch is in progress"));
    }
    if (this.activeMainTurn) {
      return Promise.reject(new Error("A Main Agent turn is already in progress"));
    }
    const operationPromise = operation();
    let tracked: Promise<void>;
    tracked = operationPromise.finally(() => {
      if (this.activeMainTurn === tracked) this.activeMainTurn = null;
    });
    this.activeMainTurn = tracked;
    return tracked;
  }

  private formatAgentNotifications(notifications: AgentExitResult[]): string {
    const entries = notifications.map((notice) => {
      const process = this.agentSupervisor.get(notice.agentId);
      const label = formatSubagentLabel(
        process?.description,
        process?.application.name,
      );
      const result = (notice.output ?? notice.error ?? "(no output)").slice(0, 4000);
      return [
        `## ${label} (${notice.agentId})`,
        `State: ${notice.state}`,
        result,
      ].join("\n");
    });
    return [
      "<agent_notifications>",
      "Background SubAgent work completed:",
      ...entries,
      "",
      "Resume the current user task using these results.",
      "If a dependency is now satisfied, continue to the next planned step immediately.",
      "Do not merely acknowledge this notification or wait for another user message.",
      "</agent_notifications>",
    ].join("\n");
  }

  private scheduleBackgroundAgentContinuation(agentId: string): void {
    const process = this.agentSupervisor.get(agentId);
    if (
      !process
      || process.role !== "subagent"
      || process.recording !== "session"
      || process.attachment !== "background"
      || !process.exit
    ) return;
    this.pendingBackgroundContinuationSessions.add(process.parentSessionId);
    this.startBackgroundContinuationDrain();
  }

  private startBackgroundContinuationDrain(): void {
    if (
      this.backgroundContinuationDrain
      || this.shuttingDown
      || this.sessionSwitchInProgress
      || this.pendingBackgroundContinuationSessions.size === 0
    ) return;

    let drain: Promise<void>;
    drain = Promise.resolve()
      .then(() => this.drainBackgroundAgentContinuations())
      .finally(() => {
        if (this.backgroundContinuationDrain === drain) {
          this.backgroundContinuationDrain = null;
        }
        const currentSessionId = this.sessionManager.getCurrentSessionId();
        if (
          !this.shuttingDown
          && !this.sessionSwitchInProgress
          && currentSessionId
          && this.pendingBackgroundContinuationSessions.has(currentSessionId)
        ) {
          this.startBackgroundContinuationDrain();
        }
      });
    this.backgroundContinuationDrain = drain;
  }

  private async drainBackgroundAgentContinuations(): Promise<void> {
    while (!this.shuttingDown && !this.sessionSwitchInProgress) {
      const sessionId = this.sessionManager.getCurrentSessionId();
      if (
        !sessionId
        || !this.pendingBackgroundContinuationSessions.has(sessionId)
      ) return;

      const activeTurn = this.activeMainTurn;
      if (activeTurn) {
        try {
          await activeTurn;
        } catch {
          // A failed user turn still leaves the background notification pending.
        }
        continue;
      }
      if (
        this.sessionSwitchInProgress
        || this.sessionManager.getCurrentSessionId() !== sessionId
      ) continue;

      const notifications = this.agentSupervisor.consumeNotifications(sessionId);
      this.pendingBackgroundContinuationSessions.delete(sessionId);
      if (notifications.length === 0) continue;

      this.events.emit({ type: "processing:start" });
      try {
        await this.runMainTurn(() =>
          this.promptAndSaveInternal(this.formatAgentNotifications(notifications))
        );
      } catch (error) {
        this.logger.error(
          "AgentContinuation",
          `Failed to resume Main Agent: ${String(error)}`,
        );
        this.events.emit({
          type: "ui:error",
          text: `Failed to resume after SubAgent completion: ${String(error)}`,
        });
        this.events.emit({ type: "processing:stop" });
      }
    }
  }

  async switchSession(request: SwitchSessionRequest): Promise<SwitchSessionResult> {
    if (this.sessionSwitchInProgress) {
      throw new Error("A session switch is already in progress");
    }
    this.sessionSwitchInProgress = true;
    try {
      const targetId = this.resolveSessionId(request.sessionIdOrPrefix);
      const prepared = await this.sessionManager.prepareLoad(targetId);

      const activeTurn = this.activeMainTurn;
      if (activeTurn) {
        this.abort();
        try {
          await activeTurn;
        } catch {
          // Aborted turns may reject; quiescence, not success, is required here.
        }
      }

      this.sessionManager.saveSession(this.agent, request.pendingPermission);
      await this.agentSupervisor.updateParentSession(
        this.mainAgentId,
        targetId,
        this.config.projectPath,
      );
      this.sessionManager.commitPreparedLoad(prepared, this.agent);
      this.lastSavedMessageCount = prepared.messages.length;

      return {
        session: prepared.metadata,
        messages: prepared.messages,
        agentMessages: prepared.agentMessages,
      };
    } finally {
      this.sessionSwitchInProgress = false;
      this.startBackgroundContinuationDrain();
    }
  }

  private resolveSessionId(idOrPrefix: string): string {
    const normalized = idOrPrefix.trim();
    if (!normalized) throw new Error("Session ID required");

    const current = this.sessionManager.getCurrentMetadata();
    const candidates = new Map(
      [
        ...this.sessionManager.listSessions(),
        ...this.sessionManager.listAllSessions(),
        ...(current ? [current] : []),
      ].map((session) => [session.id, session]),
    );
    if (candidates.has(normalized)) return normalized;

    const matches = [...candidates.values()].filter((session) =>
      session.id.startsWith(normalized),
    );
    if (matches.length === 0) {
      throw new Error(`Session not found: ${normalized}`);
    }
    if (matches.length > 1) {
      const details = matches
        .map((session) => `  ${session.id.slice(0, 8)} "${session.title.slice(0, 60)}"`)
        .join("\n");
      throw new Error(`Ambiguous session ID prefix. Matching sessions:\n${details}`);
    }
    return matches[0].id;
  }

  /**
   * Force a session save immediately. Safe to call from anywhere,
   * including error handlers and shutdown hooks.
   */
  saveSessionNow(): void {
    this.sessionManager.trySaveSession(this.agent);
    this.lastSavedMessageCount = (this.agent.state.messages as any[]).length;
  }

  /**
   * Start periodic auto-save (every 15s) during agent execution.
   * Only saves when new messages have been added since last save.
   */
  private startAutoSave(): void {
    this.autoSaveTimer = setInterval(() => {
      if (this.agent?.state?.messages) {
        const currentCount = (this.agent.state.messages as any[]).length;
        if (currentCount !== this.lastSavedMessageCount) {
          this.logger.info("AutoSave", `Periodic auto-save (${currentCount} messages, was ${this.lastSavedMessageCount})`);
          this.sessionManager.trySaveSession(this.agent);
          this.lastSavedMessageCount = currentCount;
        }
      }
    }, 15_000);
    this.autoSaveTimer.unref();
  }

  private findLastUserMessageIndex(messages: any[]): number {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i]?.role === "user") return i;
    }
    return -1;
  }

  private recordSubagentExit(agentId: string): void {
    const agentProcess = this.agentSupervisor.get(agentId);
    if (
      !agentProcess
      || agentProcess.role !== "subagent"
      || agentProcess.recording !== "session"
      || !agentProcess.exit
    ) return;
    const runtimeMessages = agentProcess.runtimeSnapshot?.messages ?? [];
    const userMessage = runtimeMessages.find(
      (message: any) => message?.role === "user",
    ) as any;
    const content = userMessage?.content;
    const prompt = typeof content === "string"
      ? content
      : Array.isArray(content)
        ? content
            .filter((block: any) => block?.type === "text")
            .map((block: any) => block.text)
            .join("\n")
        : "";
    const message: AgentSessionMessage = {
      role: "subagent",
      agentId,
      parentAgentId: agentProcess.parentAgentId,
      application: agentProcess.application.name,
      description: agentProcess.description,
      attachment: agentProcess.attachment,
      state: agentProcess.exit.state,
      input: { prompt },
      output: {
        text: agentProcess.exit.output,
        error: agentProcess.exit.error,
      },
      tools: projectTranscriptToolActivities(runtimeMessages, agentId),
      createdAt: agentProcess.createdAt,
      startedAt: agentProcess.startedAt,
      endedAt: agentProcess.exit.endedAt,
    };
    try {
      this.sessionManager.upsertAgentMessage(agentProcess.parentSessionId, message);
      if (this.sessionManager.getCurrentSessionId() === agentProcess.parentSessionId) {
        this.sessionManager.trySaveSession(this.agent);
      }
    } catch (error) {
      this.logger.error("AgentSession", `Failed to persist ${agentId}: ${String(error)}`);
    }
  }

  private linkVisionAgentMessage(
    parentSessionId: string,
    result: ProcessResult,
    prompt: string,
    messageIndex: number,
  ): boolean {
    if (!result.agentId) return false;
    const agentProcess = this.agentSupervisor.get(result.agentId);
    if (!agentProcess?.exit) return false;
    this.sessionManager.upsertAgentMessage(parentSessionId, {
      role: "subagent",
      agentId: result.agentId,
      parentAgentId: agentProcess.parentAgentId,
      application: agentProcess.application.name,
      description: agentProcess.description,
      state: agentProcess.exit.state,
      input: {
        prompt,
        attachments: result.cachedRefs.map((data) => ({
          type: "image" as const,
          data,
        })),
      },
      output: {
        text: agentProcess.exit.output,
        source: result.source,
        error: agentProcess.exit.error,
      },
      messageIndex,
      createdAt: agentProcess.createdAt,
      startedAt: agentProcess.startedAt,
      endedAt: agentProcess.exit.endedAt,
    });
    return true;
  }

  private findLastAssistantMessage(messages: any[]): any | null {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i]?.role === "assistant") return messages[i];
    }
    return null;
  }

  /**
   * Determine if an error message is transient and safe to retry.
   * Permanent errors (auth, invalid model) are never retried.
   */
  private isRetryableError(errorMsg: string): boolean {
    const cfg = this.config.retry;
    const lower = errorMsg.toLowerCase();

    // Never retry auth or configuration errors
    if (
      lower.includes("authentication") ||
      lower.includes("api key") ||
      lower.includes("invalid model") ||
      lower.includes("model not found") ||
      lower.includes("permission denied") ||
      lower.includes("403") ||
      lower.includes("401")
    ) {
      return false;
    }

    // Check specific retry categories
    if (cfg.retryOnTimeout && (
      lower.includes("timeout") ||
      lower.includes("timed out") ||
      lower.includes("deadline exceeded")
    )) {
      return true;
    }

    if (cfg.retryOnRateLimit && (
      lower.includes("rate limit") ||
      lower.includes("429") ||
      lower.includes("too many requests")
    )) {
      return true;
    }

    if (cfg.retryOnServerError && (
      lower.includes("5") ||
      lower.includes("server error") ||
      lower.includes("internal") ||
      lower.includes("service unavailable") ||
      lower.includes("gateway timeout") ||
      lower.includes("bad gateway") ||
      lower.includes("terminated")
    )) {
      return true;
    }

    // Default: retry on generic connection/network errors
    if (
      lower.includes("network") ||
      lower.includes("connection") ||
      lower.includes("econnrefused") ||
      lower.includes("econnreset") ||
      lower.includes("socket") ||
      lower.includes("dns") ||
      lower.includes("eof") ||
      lower.includes("fetch failed") ||
      lower.includes("terminated")
    ) {
      return true;
    }

    return false;
  }

  /**
   * Compute exponential backoff delay with jitter.
   * delay = min(baseDelayMs * 2^(attempt-1) + random(0, 500), maxDelayMs)
   */
  private computeRetryDelay(attempt: number, baseDelayMs: number, maxDelayMs: number): number {
    const jitter = Math.random() * 500;
    const delay = baseDelayMs * Math.pow(2, attempt - 1) + jitter;
    return Math.min(delay, maxDelayMs);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private getAvailableAgentToolNames(): string[] {
    return [...new Set([
      ...this.driverRegistry.getAllTools().map((tool) => tool.name),
      "skill",
      ...AGENT_PROCESS_TOOL_NAMES,
    ])];
  }

  private async refreshMainAgentCapabilities(): Promise<void> {
    await this.agentSupervisor.updateMainCapabilities(
      this.mainAgentId,
      this.getAvailableAgentToolNames(),
    );
  }

  private createSubagentRuntime(
    application: AgentApplicationSnapshot,
    context: ProcessAgentContext,
    agentId: string,
  ): AgentProcessRuntime {
    let modelSelection: { model: Model<Api>; apiKey?: string };
    try {
      modelSelection = this.resolveApplicationModel(application);
    } catch (error) {
      if (
        error instanceof AgentRuntimeFailure
        && application.fallback?.some((fallback) => fallback.on.includes(error.code))
      ) {
        return new FailedAgentRuntime(error);
      }
      throw error;
    }
    const model = modelSelection.model;
    const childContextManager = new ContextManager(this.config.context);
    childContextManager.updateModel(model.contextWindow, model.maxTokens);
    const processTools = makeAgentProcessTools(this.agentSupervisor, agentId);
    const toolsByName = new Map<string, AgentTool<any>>();
    for (const tool of [
      ...this.driverRegistry.getAllTools(),
      this.makeSkillTool(),
      ...processTools,
    ]) {
      toolsByName.set(tool.name, tool);
    }
    const allowed = new Set(context.allowedTools);
    const tools = [...toolsByName.values()].filter((tool) => allowed.has(tool.name));
    const acceptEditRules = application.permissionMode === "acceptEdits"
      ? ["write_file", "overwrite_file", "edit", "edit_undo"].map((tool) => ({
          tool,
          decision: "allow" as const,
          priority: 100,
        }))
      : [];
    const childPermissions = new PermissionManager(
      {
        ...this.config.permissions,
        rules: [...acceptEditRules, ...this.config.permissions.rules],
        defaultDecision: application.permissionMode === "bypassPermissions"
          ? "allow"
          : context.attachment === "background"
          ? "deny"
          : this.config.permissions.defaultDecision,
      },
      async (toolName, preview, args, promptContext) => {
        const toolCallId = promptContext?.toolCallId;
        this.events.emit({
          type: "agent:progress",
          agentId,
          phase: "permission",
          message: `Permission required for ${toolName}`,
          details: {
            kind: "permission",
            status: "waiting",
            executionId: agentId,
            toolCallId,
            toolName,
            preview,
          },
        });
        try {
          return await this.permissionPromptQueue.enqueue(
            () => this.ui.getPromptPermission()(toolName, preview, args, {
              agentId,
              toolCallId,
            }),
          );
        } finally {
          this.events.emit({
            type: "agent:progress",
            agentId,
            phase: "permission",
            message: `Permission resolved for ${toolName}`,
            details: {
              kind: "permission",
              status: "resolved",
              executionId: agentId,
              toolCallId,
              toolName,
            },
          });
        }
      },
      context.cwd,
    );
    const backgroundPermissions = new PermissionManager(
      {
        ...this.config.permissions,
        rules: [...acceptEditRules, ...this.config.permissions.rules],
        defaultDecision: application.permissionMode === "bypassPermissions"
          ? "allow"
          : "deny",
      },
      () => Promise.resolve({
        decision: "deny",
        denyReason: "Background Agent processes cannot open permission prompts",
      }),
      context.cwd,
    );
    const thinkingLevel = typeof application.effort === "number"
      ? application.effort <= 0
        ? "off"
        : application.effort <= 0.33
          ? "low"
          : application.effort <= 0.66
            ? "medium"
            : "high"
      : typeof application.effort === "string"
        && ["off", "minimal", "low", "medium", "high", "xhigh", "max"].includes(application.effort)
        ? application.effort as HarnessConfig["thinkingLevel"]
        : this.config.thinkingLevel;
    const applicationMemory = loadAgentMemory(
      application,
      this.config.configDir,
      context.worktree?.repositoryRoot ?? this.config.projectPath,
    );
    const applicationSkills = this.buildApplicationSkills(application);
    const child = new PiAgentRuntime({
      initialState: {
        systemPrompt: [
          application.systemPrompt,
          `# Runtime Context\n\nAgent ID: ${agentId}\nParent session: ${context.parentSessionId}\nWorking directory: ${context.cwd}`,
          applicationSkills,
          applicationMemory,
        ].filter(Boolean).join("\n\n"),
        model,
        tools,
        thinkingLevel,
      },
      streamFn: (runtimeModel: Model<Api>, runtimeContext: Context, options?: SimpleStreamOptions) =>
        streamSimple(runtimeModel, runtimeContext, {
          ...options,
          apiKey: options?.apiKey ?? modelSelection.apiKey,
          maxTokens: this.config.maxTokens,
          timeoutMs: 120_000,
          maxRetries: this.config.retry.maxRetries,
          maxRetryDelayMs: this.config.retry.maxDelayMs,
        }),
      transformContext: (messages, signal) =>
        childContextManager.transform(messages, signal) as Promise<AgentMessage[]>,
      beforeToolCall: async (toolContext, signal) => {
        const currentContext = this.agentSupervisor.get(agentId)?.context ?? context;
        const capability = checkAgentCapability(
          currentContext,
          toolContext.toolCall.name,
          toolContext.args,
        );
        const permissions = currentContext.attachment === "background"
          ? backgroundPermissions
          : childPermissions;
        return capability ?? await permissions.check(toolContext, signal);
      },
      afterToolCall: async (_toolContext, signal) =>
        signal?.aborted ? { terminate: true } : undefined,
    });
    if (application.maxTurns) {
      let turns = 0;
      child.subscribe((event) => {
        if (event.type === "turn_end" && ++turns >= application.maxTurns!) {
          child.abort();
        }
      });
    }
    return new PiAgentRuntimeAdapter(child, agentId);
  }

  private buildApplicationSkills(application: AgentApplicationSnapshot): string {
    if (!application.skills?.length) return "";
    const sections = application.skills.map((name) => {
      const manifest = this.skillManager.getManifest(name);
      if (!manifest) throw new Error(`Unknown Skill in ${application.name}: ${name}`);
      return [
        `## Skill: ${manifest.name}`,
        manifest.description,
        manifest.instructions ?? "",
      ].filter(Boolean).join("\n\n");
    });
    return ["# Application Skills", ...sections].join("\n\n");
  }

  private resolveApplicationModel(
    application: AgentApplicationSnapshot,
  ): { model: Model<Api>; apiKey?: string } {
    let configured = application.model;
    if (configured && ["haiku", "sonnet", "opus"].includes(configured)) {
      configured = this.config.agentModelAliases?.[
        configured as "haiku" | "sonnet" | "opus"
      ];
    }
    if (!configured || configured === "inherit") {
      return {
        model: this.resolveSubagentModel(this.config.provider, this.config.modelId),
        apiKey: this.config.apiKey,
      };
    }
    if (configured === "vision") {
      const vision = resolveVisionApplicationConfig(application, this.config);
      if (!vision?.provider || !vision.model) {
        throw new AgentRuntimeFailure(
          "model_unavailable",
          "Vision model is not configured",
        );
      }
      return {
        model: this.resolveSubagentModel(vision.provider, vision.model),
        apiKey: vision.key ?? getEnvApiKey(vision.provider),
      };
    }
    const separator = configured.indexOf("/");
    if (separator > 0) {
      const provider = configured.slice(0, separator);
      return {
        model: this.resolveSubagentModel(provider, configured.slice(separator + 1)),
        apiKey: provider === this.config.provider
          ? this.config.apiKey
          : provider === this.config.vision?.provider
          ? this.config.vision.key ?? getEnvApiKey(provider)
          : getEnvApiKey(provider),
      };
    }
    return {
      model: this.resolveSubagentModel(this.config.provider, configured),
      apiKey: this.config.apiKey,
    };
  }

  private resolveSubagentModel(provider: string, modelId: string): Model<Api> {
    try {
      return resolveModel(provider, modelId);
    } catch (error) {
      throw new AgentRuntimeFailure(
        "model_unavailable",
        error instanceof Error ? error.message : String(error),
        { cause: error },
      );
    }
  }

  private async processImagesWithVisionAgent(
    images: ImageContent[],
    text: string,
    options?: ProcessOptions,
    trackActive = false,
  ): Promise<ProcessResult> {
    const visionApplication = this.applicationRegistry.require("vision");
    const visionConfig = resolveVisionApplicationConfig(visionApplication, this.config);
    if (!this.config.agents.enabled) {
      const controller = trackActive ? new AbortController() : undefined;
      const onAbort = () => controller?.abort();
      options?.signal?.addEventListener("abort", onAbort, { once: true });
      if (options?.signal?.aborted) controller?.abort();
      if (trackActive) this.activeVisionAbortController = controller ?? null;
      try {
        return await this.imagePipeline.process(images, text, {
          ...options,
          signal: controller?.signal ?? options?.signal,
          systemPrompt: visionApplication.systemPrompt,
          visionPrompt: text || "Describe the provided images accurately.",
          visionConfig,
        });
      } finally {
        options?.signal?.removeEventListener("abort", onAbort);
        if (trackActive) this.activeVisionAbortController = null;
      }
    }
    const sessionId = this.sessionManager.getCurrentSessionId();
    if (!sessionId) throw new Error("Cannot launch Vision Agent without an active session");
    await this.agentSupervisor.updateParentSession(this.mainAgentId, sessionId);
    options?.onProgress?.({ phase: "compressing", cachedRefs: [] });
    const cachedRefs = await Promise.all(images.map((image) => ImageCache.put(image)));
    options?.onProgress?.({ phase: "compressing", cachedRefs });
    let visionAgentId = "";
    const unsubscribe = this.events.on("agent:progress", (event) => {
      if (event.agentId !== visionAgentId) return;
      const progress = event.details as ProgressInfo | undefined;
      if (progress) options?.onProgress?.(progress);
    });
    try {
      const spawned = await this.agentSupervisor.spawn({
        application: "vision",
        parentAgentId: this.mainAgentId,
        description: "Vision: analyze attached images",
        input: {
          prompt: text,
          displayPrompt: options?.displayPrompt ?? text,
          attachments: cachedRefs.map((data) => ({ type: "image" as const, data })),
        },
        attachment: "foreground",
        signal: options?.signal,
        onSpawn: (agentId) => {
          visionAgentId = agentId;
          if (trackActive) this.activeVisionAgentId = agentId;
          this.events.emit({
            type: "agent:progress",
            agentId,
            phase: "describing",
            message: `describing: ${cachedRefs.length} image(s) cached`,
            details: { phase: "describing", cachedRefs },
          });
        },
      });
      const exit = spawned.result;
      if (!exit) throw new Error("Foreground Vision Agent returned without an exit result");
      if (exit.state === "terminated" || exit.state === "killed") {
        throw new DOMException("The operation was aborted", "AbortError");
      }
      if (exit.state === "failed") throw new Error(exit.error ?? "Vision Agent failed");
      const fallback = exit.details as VisionAgentOutput | undefined;
      if (fallback?.executionSource === "ocr") {
        for (const warning of fallback.warnings ?? []) options?.onWarning?.(warning);
        return {
          agentId: visionAgentId,
          source: fallback.source,
          enrichedText: fallback.enrichedText,
          cachedRefs: fallback.cachedRefs,
        };
      }
      const description = exit.output ?? "";
      this.events.emit({
        type: "agent:progress",
        agentId: visionAgentId,
        phase: "done",
        message: `done: ${cachedRefs.length} image(s) cached`,
        details: { phase: "done", cachedRefs },
      });
      const enrichedText = text
        ? `${text}\n\n<image_description>\n${description}\n</image_description>`
        : `<image_description>\n${description}\n</image_description>`;
      return {
        agentId: visionAgentId,
        source: "vision",
        enrichedText,
        cachedRefs,
      };
    } finally {
      unsubscribe();
      if (trackActive && this.activeVisionAgentId === visionAgentId) {
        this.activeVisionAgentId = null;
      }
    }
  }

  async promptWithImages(
    text: string,
    images: ImageContent[],
    displayText = text,
  ): Promise<void> {
    return this.runMainTurn(() =>
      this.promptWithImagesInternal(text, images, displayText)
    );
  }

  private async promptWithImagesInternal(
    text: string,
    images: ImageContent[],
    displayText: string,
  ): Promise<void> {
    const turnIdx = this.turnIndex++;

    const visionApplication = this.applicationRegistry.require("vision");
    const visionConfig = resolveVisionApplicationConfig(visionApplication, this.config);
    const hasVisionConfig = !!(visionConfig?.provider && visionConfig.model);
    const mainModel = resolveModel(this.config.provider, this.config.modelId);
    if (shouldUseNativeMainImagePath(
      this.config.agents.enabled,
      hasVisionConfig,
      mainModel.input.includes("image"),
    )) {
      await this.promptAndSaveInternal(text, images);
      return;
    }

    this.events.emit({ type: "processing:start" });
    this.events.emit({ type: "ui:info", text: `Analyzing ${images.length} image(s)...` });

    const parentSessionId = this.sessionManager.getCurrentSessionId();
    if (!parentSessionId) throw new Error("Cannot launch Vision Agent without an active session");
    try {
      const result = await this.processImagesWithVisionAgent(
        images,
        text,
        { displayPrompt: displayText },
        true,
      );
      let mainPrompt = result.enrichedText;
      if (result.source === "vision") {
        this.events.emit({ type: "ui:info", text: `Image analysis complete, sending to main model...` });
      } else if (result.source === "ocr") {
        this.events.emit({ type: "ui:info", text: `OCR complete, sending to main model...` });
      } else if (result.source === "none") {
        mainPrompt = text
          ? `${text}\n\n(用户附带了一张图片，但图片中没有可识别的文字内容)`
          : "(用户附带了一张图片，但图片中没有可识别的文字内容)";
      }
      await this.promptAndSaveInternal(mainPrompt);

      const messages = this.agent.state.messages as any[];
      const messageIndex = this.findLastUserMessageIndex(messages);
      const linked = this.linkVisionAgentMessage(
        parentSessionId,
        result,
        displayText,
        messageIndex,
      );
      if (!linked && result.source === "vision") {
        const vMsg: VisionMessage = {
          turnIndex: turnIdx,
          messageIndex,
          images: result.cachedRefs,
          prompt: displayText,
          description: result.enrichedText
            .replace(text ? `${text}\n\n<image_description>\n` : `<image_description>\n`, "")
            .replace("\n</image_description>", ""),
          modelProvider: visionConfig?.provider ?? "",
          modelId: visionConfig?.model ?? "",
          timestamp: Date.now(),
        };
        this.sessionManager.appendVisionMessage(parentSessionId, vMsg);
      }
      if (linked || result.source === "vision") {
        this.restoreUserMessageImages(displayText, result.cachedRefs);
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        this.events.emit({ type: "processing:stop" });
        return;
      }
      throw error;
    }
  }

  /** Abort any in-progress vision/OCR processing AND the current agent run. */
  abort(): void {
    this.activeVisionAbortController?.abort();
    if (this.activeVisionAgentId) {
      void this.agentSupervisor.terminate(this.activeVisionAgentId).catch((error) => {
        this.logger.error("VisionAgent", `Failed to terminate: ${String(error)}`);
      });
    }
    for (const process of this.agentSupervisor.list()) {
      if (
        process.role !== "subagent"
        || process.recording !== "process-only"
        || !["created", "running", "waiting", "stopped"].includes(process.state)
        || process.agentId === this.activeVisionAgentId
      ) continue;
      void this.agentSupervisor.terminate(process.agentId).catch((error) => {
        this.logger.error("AgentProcess", `Failed to terminate ${process.agentId}: ${String(error)}`);
      });
    }
    this.events.emit({ type: "turn:abort", reason: this.shuttingDown ? "system" : "user" });
    this.agent.abort();
  }

  private restoreUserMessageImages(text: string, cachedRefs: ImageRef[]): void {
    const msgs = this.agent.state.messages as any[];
    let userMsg: any = null;
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i]?.role === "user") {
        userMsg = msgs[i];
        break;
      }
    }
    if (userMsg) {
      userMsg.content = text || (cachedRefs.length > 0 ? "📷 Image" : text);
      userMsg.images = cachedRefs.map((ref: ImageRef) => ({
        type: "image_ref" as const,
        hash: ref.hash,
        mimeType: ref.mimeType,
      }));
    }
    this.sessionManager.trySaveSession(this.agent);
    this.lastSavedMessageCount = (this.agent.state.messages as any[]).length;
    // Restore images into agent state for the UI to render
    const restoredImgs: ImageContent[] = [];
    for (const ref of cachedRefs) {
      const cached = ImageCache.getSync(ref);
      if (cached) restoredImgs.push(cached);
    }
    if (restoredImgs.length > 0 && userMsg) {
      userMsg.images = restoredImgs.map((img: ImageContent) => ({
        data: img.data,
        mimeType: img.mimeType,
      }));
    }
  }

  async run(ui?: UiBackend): Promise<void> {
    if (ui) this.ui = ui;
    const model = resolveModel(this.config.provider, this.config.modelId);
    const nativeImageSupport = model.input.includes("image");
    if (!ui) {
      ui = new TuiBackend(this);
    }
    this.ui = ui;
    // Register config change notification → UI
    this.configStore.onChange(() => {
      (this.ui as any).onConfigChange?.();
    });

    await this.ui.start();

    try {
      if (this.config.mcp.length > 0) {
        this.events.emit({ type: "ui:info", text: `Connecting ${this.config.mcp.length} MCP server(s)...` });
        this.mcpManager = new MCPManager(this.config.mcp);
        this.mcpManager.processImages = (images, text, options) =>
          this.processImagesWithVisionAgent(images, text, options);
        // mcpManager is directly accessible via harness.mcpManager
        await this.mcpManager.initialize();
        this.mcpEventUnsubscribe = this.mcpManager.onEvent((event) => this.handleMcpEvent(event));
        await this.mcpManager.registerDrivers(this.driverRegistry);
        (this.ui as any).setMcpManager?.(this.mcpManager);
        (this.ui as any).pushMcpState?.();

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
        this.agent.state.systemPrompt = this.baseSystemPrompt.replace("__DEFERRED_HINT__", this.toolRegistry.buildDeferredToolsHint());
        await this.dumpDebugPrompt();
        const connected = this.mcpManager.getStates().filter((s) => s.status === "connected").length;
        const total = this.config.mcp.length;
        this.events.emit({ type: "ui:info", text: `MCP: ${connected}/${total} connected` });
        if (connected < total) {
          const errors = this.mcpManager.getStates().filter((s) => s.status === "error");
          for (const err of errors) {
            this.events.emit({ type: "ui:info", text: `MCP '${err.config.name}' failed: ${err.error ?? "unknown"}` });
          }
        }
        this.events.emit({ type: "ui:focus:editor" });
      } else {
        this.toolRegistry.initialize(this.makeSkillTool());
        this.agent.state.tools = this.toolRegistry.buildToolsForRequest();
      }
      await this.refreshMainAgentCapabilities();

      // Start periodic auto-save (15s interval) after MCP/agent initialization
      this.startAutoSave();

      if (!this.config.apiKey) {
        this.events.emit({ type: "ui:info", text: [
          "Welcome to DSCode! To get started, configure your API key:",
          "",
          `  /config key your-${this.config.provider}-api-key`,
          "",
          "Then set your preferred model:",
          "",
          `  /config model ${this.config.modelId}`,
          "",
          "Type /config to see all settings.",
        ].join("\n") });
      }

      this.events.emit({ type: "ui:focus:editor" });
      await this.ui.waitForExit();
    } finally {
      await this.shutdown();
    }
  }

  setModel(modelId: string): void {
    const oldModelId = this.config.modelId;
    const model = resolveModel(this.config.provider, modelId);
    const thinkingLevel = getThinkingLevel(this.config.provider, modelId);
    this.configStore.setModelConfig(this.config.provider, modelId, thinkingLevel);
    this.agent.state.model = model;
    this.contextManager.updateModel(model.contextWindow, model.maxTokens);
    this.agent.state.thinkingLevel = thinkingLevel;

    saveUserConfig({ modelId, thinkingLevel });

    // Clear conversation context when switching models to avoid capability mismatch
    // (e.g. image messages from qwen -> deepseek which only supports text)
    if (oldModelId && modelId !== oldModelId) {
      this.agent.reset();
      this.events.emit({ type: "ui:conversation:clear" });
      this.rebuildSystemPrompt();
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

    this.configStore.setModelConfig(providerId, defaultModelId, getThinkingLevel(providerId, defaultModelId));
    this.agent.state.model = model;
    this.agent.state.thinkingLevel = this.config.thinkingLevel;
    this.contextManager.updateModel(model.contextWindow, model.maxTokens);

    saveUserConfig({ provider: providerId, modelId: defaultModelId, thinkingLevel: this.config.thinkingLevel });

    this.agent.reset();
    this.events.emit({ type: "ui:conversation:clear" });
    this.rebuildSystemPrompt();
  }
  setThinking(level: string): void {
    this.configStore.setThinkingLevel(level as any);
    this.agent.state.thinkingLevel = level as any;
    saveUserConfig({ thinkingLevel: level });
  }

  async updateProjectPath(cwd: string): Promise<{ success: boolean; error?: string }> {
    const resolvedPath = resolve(cwd);

    if (!existsSync(resolvedPath)) {
      return { success: false, error: `Path does not exist: ${resolvedPath}` };
    }

    // Save current session before switching
    this.sessionManager.trySaveSession(this.agent);
    this.lastSavedMessageCount = (this.agent.state.messages as any[]).length;

    // Change working directory
    process.chdir(resolvedPath);

    this.configStore.setProjectPath(resolvedPath);
    this.sessionManager.updateProjectPath(this.config.dataDir, resolvedPath);
    this.memoryManager.updateProjectPath(this.config.dataDir, resolvedPath);
    this.processStore.updateProjectPath(resolvedPath);
    await this.applicationRegistry.updateProjectPath(resolvedPath);
    const sessionId = this.sessionManager.getCurrentSessionId();
    if (sessionId) {
      await this.agentSupervisor.updateParentSession(this.mainAgentId, sessionId, resolvedPath);
    }

    // Reload skills from new project directory
    const projectSkillsDir = join(resolvedPath, ".dscode", "skills");
    this.skillManager.reloadDirs(this.config.userSkillsDir, projectSkillsDir, this.driverRegistry);

    // Reload MCP servers from new project settings
    try {
      const userSettings = loadScopedSettings(userSettingsPath());
      const projectSettings = loadScopedSettings(projectSettingsPath(resolvedPath));
      const { servers: mcpServers } = loadMcpServers(userSettings, projectSettings, resolvedPath);

      if (mcpServers.length > 0) {
        this.configStore.setMcpServers(mcpServers);
        this.mcpManager = new MCPManager(mcpServers);
        this.mcpManager.processImages = (images, text, options) =>
          this.processImagesWithVisionAgent(images, text, options);
        await this.mcpManager.initialize();
        await this.mcpManager.registerDrivers(this.driverRegistry);

        // Re-initialize ToolRegistry to pick up new MCP AgentTool objects
        const appOnlyNames = new Set(this.mcpManager.getAppOnlyToolNames());
        this.toolRegistry.initialize(
          this.makeSkillTool(),
          this.mcpManager.getAlwaysLoadToolNames(),
          appOnlyNames,
        );

        if (this.appHostManager) {
          this.appHostManager.setMcpManager(this.mcpManager);
        }
      } else {
        this.configStore.setMcpServers([]);
        this.mcpManager = undefined;

        // Re-initialize ToolRegistry to clear old MCP tools
        this.toolRegistry.initialize(this.makeSkillTool());
      }

      // Notify UI of updated MCP state
      (this.ui as any).setMcpManager?.(this.mcpManager);
      (this.ui as any).pushMcpState?.();
    } catch (err) {
      this.logger.error("McpReload", String(err));
      // Non-fatal: continue with updated path even if MCP reload fails
    }

    // Update agent tools after driver changes
    this.agent.state.tools = this.toolRegistry.buildToolsForRequest();
    await this.refreshMainAgentCapabilities();

    // Refresh system prompt with new project memories and skills
    const memories = this.memoryManager.getRelevantMemories();
    const skillSection = this.skillManager.getSystemPromptSection();
    this.baseSystemPrompt = this.buildSystemPrompt(memories, skillSection, this.commandManager.getSystemPromptSection());
    this.agent.state.systemPrompt = this.baseSystemPrompt.replace("__DEFERRED_HINT__", this.toolRegistry.buildDeferredToolsHint());

    return { success: true };
  }

  private async shutdown(): Promise<void> {
    // Clear auto-save timer before final save
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
      this.autoSaveTimer = undefined;
    }
    // Save session FIRST, before any other shutdown steps.
    // This ensures data is persisted even if later steps fail.
    // Also save regardless of shuttingDown flag — this is the last chance to persist.
    this.sessionManager.trySaveSession(this.agent);
    this.lastSavedMessageCount = (this.agent.state.messages as any[]).length;

    if (this.shuttingDown) return;
    this.shuttingDown = true;

    this.mcpEventUnsubscribe?.();
    this.mcpEventUnsubscribe = undefined;
    try {
      await this.agentSupervisor.shutdown();
    } catch (err) {
      this.logger.error("AgentSupervisorShutdown", String(err));
    }
    try {
      await this.imagePipeline.shutdown();
    } catch (err) {
      this.logger.error("VisionShutdown", String(err));
    }
    // 4.2: Clean up checkpoint directories for this session
    try { shutdownCheckpointSystem(); } catch {}

    if (this.appHostManager) {
      try {
        await this.appHostManager.shutdown();
      } catch (err) {
        this.logger.error("AppHostShutdown", String(err));
      }
    }
    if (this.mcpManager) {
      try {
        await this.mcpManager.shutdown();
      } catch (err) {
        this.logger.error("McpShutdown", String(err));
      }
    }
  }

  rebuildSystemPrompt(): void {
    const memories = this.memoryManager.getRelevantMemories();
    const skillSection = this.skillManager.getSystemPromptSection();
    this.baseSystemPrompt = this.buildSystemPrompt(memories, skillSection, this.commandManager.getSystemPromptSection());
    this.agent.state.systemPrompt = this.baseSystemPrompt.replace("__DEFERRED_HINT__", this.toolRegistry.buildDeferredToolsHint());
  }

  private buildSystemPrompt(memories: string, skillSection: string, commandsSection: string): string {
    let prompt = `# Identity

You are dscode — a digital studio for content-driven creation.

You specialize in turning ideas into clear, compelling, and executable creative output, including writing, storytelling, branding, visual concepts, interactive experiences, and coded products.
You are not just an assistant that responds to requests. You are a creative studio that thinks like an editor, designs like an art director, and builds like a developer.
You help users shape raw thoughts into finished works — works that are not only functional, but expressive, memorable, and alive.

# Soul

You are built in the spirit of Hackers and Painters.
You believe that great creation lives at the intersection of logic and taste, structure and intuition, engineering and art.
You have the maker's discipline and the painter's eye.
You write code not only to make things work, but to make ideas real.
You create not only to solve problems, but to express, move, and transform.
You treat code as a creative medium, words as design material, and interfaces as narrative surfaces.
You value originality over imitation, clarity over noise, taste over clutter, and finished expression over empty capability.
Your goal is not merely to generate output, but to craft meaningful work — work that can communicate sharply, resonate emotionally, and leave a mark on the world.
# Runtime Context

You are working in: ${this.config.projectPath}.

# Tool Use

## Rules

- When the user asks you to create, modify, or delete files, you MUST call the corresponding tool (write_file, bash, etc.) immediately. Never just describe what you plan to do without actually doing it.
- Do not explain your plan before acting. Act first, then briefly explain what you did.
- When multiple tool calls have no data dependency on each other, batch them in a single response for parallel execution. When one call depends on the output of another, split them across sequential responses.
- Prefer file tools over shell: use write_file, edit, read_file, and grep for file operations. Reserve bash for actual shell commands — tests, builds, git, package management — not for sed, cat, or awk on project files.
- Activate Skills first: if a task falls within the domain of any Skill listed in "Active Skills", call the skill tool to load its full instructions before proceeding.
- Loading a Skill is not execution. After loading it, continue through its required tools and deliverables in the same turn when the request has enough information. Do not stop at a plan, summary, or redundant confirmation.
- If a loaded Skill requires SubAgents and \`spawn_agent\` is available, the Skill has not started until you actually call \`spawn_agent\`. Do not end the turn before that call unless essential user input is missing or the Skill explicitly requires confirmation.
- If a task relates to tools listed in the "Discoverable Tools" section below, use \`search_tools\` to discover and load the relevant tools first, before falling back to other methods.
- Answer in the user's language. Be concise and direct.
- When writing code, produce complete, working implementations. Do not leave placeholders or TODOs.

- **Multi-file editing**: When modifying multiple files, complete all operations on one file before moving to the next. Batch operations targeting the same file into a single \`edit\` call where possible (all operations in one call are atomic against the same snapshot). Avoid interleaving reads and edits across different files — read A → edit A → read B → edit B, not read A → read B → edit A → edit B.

| Situation | Recommended Operation |
|-----------|----------------------|
| Change a single line with unique content | \`replace_line\` |
| Change a contiguous block of lines | \`replace_range\` |
| Insert new content between two existing lines | \`insert_after\` / \`insert_before\` |
| Remove a single unique line | \`delete_line\` |
| Remove a contiguous block of lines | \`delete_range\` |
| Target line is repetitive (empty line, \`}\`, boilerplate) | \`replace_range\` wrapping it with unique neighbor anchors |

## Tool Search

You have a \`search_tools\` tool for discovering additional tools. Some tools (especially MCP tools from connected servers) are not loaded by default to save context. These tools are listed in the "Discoverable Tools" section below.

When you need a tool that is listed as discoverable but not yet in your tool list:
1. Call \`search_tools\` with keywords describing what you need
2. The matching tools will become available in your next message
3. Then call the newly loaded tools directly

You can also load tools by exact name using \`select:\`: for example \`search_tools\` with query \`select:ToolA,ToolB\`.

__DEFERRED_HINT__`;

    if (this.config.agentsMdContent) {
      prompt += "\n\n" + this.config.agentsMdContent;
    }

    prompt += `\n\n# Skills`;

    if (skillSection) {
      prompt += "\n\n" + skillSection;
    }

    prompt += `\n\n## Using Skills\n\nYou have a \`skill\` tool available. When you decide to use a skill from the list above, call \`skill\` with the skill name to load its full instructions and allowed tools. Read the instructions, then follow them.`;


    if (commandsSection) {
      prompt += "\n\n# Commands\n\n" + commandsSection;
    }

    if (memories) {
      prompt += "\n\n" + memories;
    }

    return prompt;
  }

  private async dumpDebugPrompt(): Promise<void> {
    if (!this.debug) return;
    const prompt = this.agent?.state?.systemPrompt;
    if (!prompt) return;
    const hash = String(prompt.length);
    if (hash === this.debugPromptLastHash) return;
    this.debugPromptLastHash = hash;
    const { mkdirSync, writeFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const dumpDir = join(this.config.projectPath, "dump");
    mkdirSync(dumpDir, { recursive: true });
    const filePath = join(dumpDir, "system-prompt.md");
    writeFileSync(filePath, prompt, "utf8");
    process.stderr.write("\n[dscode] --debug: system prompt dumped to " + filePath + " (" + prompt.length + " chars)\n\n");
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

        if (!skillManager.isActive(params.name)) {
          return {
            content: [{ type: "text", text: `Error: Skill '${params.name}' is currently deactivated. Use the Skills panel to activate it first.` }],
            details: { error: "inactive" },
          };
        }

        return {
          content: [{ type: "text", text: formatLoadedSkill(manifest) }],
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
        this.events.emit({ type: "ui:info", text: `[MDX] fetchUiResource failed: ${err.message}, falling back to data mode` });
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
      this.events.emit({ type: "ui:info", text: `[MDX] no structuredContent (keys: ${result ? Object.keys(result).join(",") : "null"})` });
      return;
    }

    try {
      const layout = inferLayout(structuredContent, uiInfo.toolName);
      this.events.emit({ type: "ui:info", text: `[MDX] layout: ${layout.mdx.slice(0, 80)}...` });

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
      this.events.emit({ type: "ui:info", text: `[MDX] error: ${e.message}` });
    }
  }



  private bindEvents(): void {
    this.agent.subscribe((event) => {
      switch (event.type) {
        case "message_end": {
          if ((event as any).message?.role === "user") {
            this.logger.info("PreTurnSave", `Saving session pre-turn (${(this.agent.state.messages as any[]).length} messages)`);
            this.sessionManager.trySaveSession(this.agent);
            this.lastSavedMessageCount = (this.agent.state.messages as any[]).length;
          }
          break;
        }
        case "message_update": {
          const ev = event.assistantMessageEvent;
          if (!ev) break;
          switch (ev.type) {
            case "thinking_delta":
              this.events.emit({ type: "llm:thinking:delta", delta: ev.delta });
              break;
            case "text_delta":
              this.events.emit({ type: "llm:text:delta", delta: ev.delta });
              break;
          }
          break;
        }
        case "tool_execution_start":
          this.events.emit({
            type: "tool:start",
            executionId: this.mainAgentId,
            toolCallId: event.toolCallId,
            name: event.toolName,
            args: event.args,
          });
          break;
        case "tool_execution_update": {
          // Partial tool result: show images immediately before vision/OCR
          const payload = this.getToolPayload(event.partialResult);
          const effectiveIsError = this.getEffectiveToolError(event.partialResult, false);
          this.events.emit({
            type: "tool:end",
            executionId: this.mainAgentId,
            toolCallId: event.toolCallId,
            name: event.toolName,
            result: payload,
            isError: effectiveIsError,
          });
          break;
        }
        case "tool_execution_end": {
          const payload = this.getToolPayload(event.result);
          const effectiveIsError = this.getEffectiveToolError(event.result, event.isError);
          this.events.emit({
            type: "tool:end",
            executionId: this.mainAgentId,
            toolCallId: event.toolCallId,
            name: event.toolName,
            result: payload,
            isError: effectiveIsError,
          });
          this.checkAndRegisterApp(event.toolName, event.result);
          break;
        }
      }
    });

    this.agent.subscribe(async (event) => {
      try {
        if (event.type === "agent_end") {
          this.events.emit({ type: "processing:stop" });
          // Session is saved by promptAndSave after retries are resolved.
          // This save is a safety net for non-promptAndSave code paths.
          this.sessionManager.trySaveSession(this.agent);
          this.lastSavedMessageCount = (this.agent.state.messages as any[]).length;
        }
        if (event.type === "agent_start") {
          this.events.emit({ type: "turn:streaming:start" });
        }
        if (event.type === "turn_end") {
          // Save session before broadcasting so sidebar gets fresh metadata
          this.sessionManager.trySaveSession(this.agent);
          this.lastSavedMessageCount = (this.agent.state.messages as any[]).length;
          const turnEndMsg = event.message as AssistantMessage;
          const rawUsage = turnEndMsg?.usage;
          this.events.emit({ type: "turn:end", stopReason: turnEndMsg?.stopReason, usage: rawUsage ? { input: rawUsage.input, output: rawUsage.output, cacheRead: rawUsage.cacheRead, cacheWrite: rawUsage.cacheWrite, total: rawUsage.totalTokens, cost: { total: rawUsage.cost.total } } : undefined });
          const msg = turnEndMsg;
          if (msg?.stopReason === "length") {
            this.events.emit({ type: "ui:info", text: "Output truncated (hit max_tokens). Continue from where you left off." });
          }
          if (msg?.stopReason === "error" && msg?.errorMessage) {
            // Don't display here — promptAndSave handles UI and retry logic.
          }
        }
      } catch (err) {
        // If the event handler fails, still try to save session
        this.logger.error("AgentEvent", String(err));
        this.sessionManager.trySaveSession(this.agent);
        this.lastSavedMessageCount = (this.agent.state.messages as any[]).length;
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

        // Emit harness event for inline progress bars (Web UI)
        if (event.toolName) {
          this.events.emit({
            type: "mcp:tool:progress",
            toolName: `mcp__${event.serverName}__${event.toolName}`,
            serverName: event.serverName,
            progress: event.params.progress,
            total: event.params.total,
            message: event.params.message,
          });
        }
        return;
      }
      case "message": {
        const level = (event.params.level ?? "info").toLowerCase();
        const prefix = `MCP ${event.serverName}`;
        const text = this.stringifyMcpMessage(event.params.data);
        const label = event.params.logger ? `${event.params.logger}: ` : "";
        if (level === "error") {
          this.events.emit({ type: "ui:error", text: `${prefix}: ${label}${text}` });
        } else if (level === "warning" || level === "warn") {
          this.events.emit({ type: "ui:info", text: `${prefix} warning: ${label}${text}` });
        } else {
          this.events.emit({ type: "ui:info", text: `${prefix}: ${label}${text}` });
        }
        return;
      }
      case "tools_list_changed":
        this.events.emit({ type: "ui:info", text: `MCP ${event.serverName}: refreshing tool list...` });
        return;
      case "tools_refreshed":
        // Successful refreshes are routine (including after idle reconnects) and
        // should not add persistent system messages to the conversation.
        return;
      case "tools_refresh_failed":
        this.events.emit({ type: "ui:error", text: `MCP ${event.serverName}: tool refresh failed: ${event.error}` });
        return;
      case "resources_list_changed":
        this.events.emit({ type: "ui:info", text: `MCP ${event.serverName}: resources updated` });
        return;
      case "cancelled":
        this.events.emit({ type: "ui:info", text: `MCP ${event.serverName}: request cancelled` + (event.params.reason ? ` (${event.params.reason})` : "") });
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
