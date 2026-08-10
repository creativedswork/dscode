import { existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { Agent as PiAgentRuntime } from "@earendil-works/pi-agent-core";
import type { AfterToolCallContext, AfterToolCallResult, AgentMessage, AgentTool, BeforeToolCallContext } from "@earendil-works/pi-agent-core";
import { Type } from "@earendil-works/pi-ai";
import type { Api, AssistantMessage, Context, ImageContent, Model, SimpleStreamOptions } from "@earendil-works/pi-ai";

import {
  getAllModels,
  getAllProviders,
  getVisionModels,
  getVisionProviders,
  streamSimple,
} from "../models/index.js";
import type {
  RuntimeConfig,
  RuntimeConfigSnapshot,
} from "../config/types.js";
import {
  SettingsService,
  type SettingsChangeReason,
} from "../config/settings-service.js";
import { RuntimeConfigStore } from "../config/runtime-config-store.js";
import {
  SessionManager,
  setTitleIntent,
} from "../session/manager.js";
import { ContextManager } from "../context/manager.js";
import { MemoryManager } from "../memory/manager.js";
import { formatLoadedSkill, SkillManager } from "../skills/manager.js";
import { CommandManager } from "../commands/manager.js";
import {
  PermissionManager,
  PermissionPromptQueue,
} from "../permissions/manager.js";
import { MCPManager } from "../mcp/manager.js";
import { mcpDriverName } from "../mcp/names.js";
import { AppHostManager } from "../mcp/app/host.js";
import { inferLayout } from "../mcp/app/mdx-inference.js";
import { findToolResultText } from "../application/tool-result-text.js";
import type {
  HarnessAPI,
  UserInteractionPort,
} from "../application/harness-api.js";
import { ConversationCoordinator } from "../application/conversation-coordinator.js";
import { SessionCoordinator } from "../application/session-coordinator.js";
import { McpController } from "../application/mcp-controller.js";
import { ProjectCoordinator } from "../application/project-coordinator.js";
import { AgentRuntimeCoordinator } from "../application/agent-runtime-coordinator.js";
import { resolveModel } from "../models/index.js";
import {
  isImagePath,
  listProjectFiles,
  resolveAtFileRefs,
  resolveFileRefs,
} from "../utils/at-file-resolver.js";
import {
  deriveFuzzyArgPattern,
  deriveFuzzyPattern,
  describeFuzzyArgPattern,
} from "../permissions/fuzzy.js";
import { runEval } from "../eval/index.js";
import type { ProcessOptions, ProcessResult, ProgressInfo } from "../drivers/vision/types.js";
import type { ImageRef } from "../resources/images/types.js";
import type {
  AgentSessionMessage,
  SwitchSessionRequest,
  SwitchSessionResult,
  VisionMessage,
} from "../session/types.js";
import {
  initCheckpointSystem,
  shutdownCheckpointSystem,
  type CheckpointSystem,
} from "../checkpoint/index.js";
import { recordInvalidation, consumePendingNotices } from "../context/anchor-invalidation.js";
import { runWithExecutionContext } from "../kernel/execution-context.js";
import type { HostFacilities } from "../kernel/host-facilities.js";
import { HarnessEventBus } from "./events.js";
import type { Logger } from "../utils/logger.js";
import { AgentApplicationRegistry } from "../agents/application/registry.js";
import type { AgentApplicationSnapshot } from "../agents/application/types.js";
import { PiAgentRuntimeAdapter } from "../agents/runtimes/pi-agent-runtime.js";
import {
  OcrFallbackHandler,
  type VisionAgentOutput,
} from "../agents/runtimes/ocr-fallback.js";
import { resolveVisionApplicationConfig } from "../agents/runtimes/vision-model.js";
import {
  AgentProcessStore,
  serializeAgentProcess,
} from "../agents/process/store.js";
import { AgentSupervisor } from "../agents/process/supervisor.js";
import { AgentFallbackRegistry } from "../agents/process/fallback.js";
import { createMainAgentContext } from "../agents/process/context.js";
import { formatSubagentLabel } from "../agents/process/label.js";
import { extractAgentToolExecutions } from "../agents/process/transcript.js";
import type { AgentExitResult } from "../agents/process/types.js";
import {
  AGENT_PROCESS_TOOL_NAMES,
  makeAgentProcessTools,
} from "../agents/tools/process-tools.js";

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

export interface HarnessDependencies {
  hostId: string;
  facilities: HostFacilities;
  environment: Readonly<Record<string, string | undefined>>;
  checkpointSystem: CheckpointSystem;
  events: HarnessEventBus;
  configStore: RuntimeConfigStore;
  createSettings(
    onApplied: (
      previous: RuntimeConfigSnapshot,
      next: RuntimeConfigSnapshot,
      reason: SettingsChangeReason,
    ) => void,
  ): SettingsService;
  applicationRegistry: AgentApplicationRegistry;
  processStore: AgentProcessStore;
  sessionManager: SessionManager;
  contextManager: ContextManager;
  memoryManager: MemoryManager;
  driverRegistry: import("../drivers/types.js").DriverRegistryPort;
  toolRegistry: import("../drivers/types.js").ToolCatalogPort;
  discoveryDriver: import("../drivers/types.js").Driver;
  commandManager: CommandManager;
  skillManager: SkillManager;
  createPermissionManager(
    request: ConstructorParameters<typeof PermissionManager>[1],
    settings: SettingsService,
  ): PermissionManager;
  permissionSuggestions: import("../permissions/fuzzy-llm.js").PermissionSuggestionPort;
  imageInput: import("../application/harness-api.js").ImageInputApplicationPort;
  imagePipeline: import("../drivers/vision/types.js").ImageProcessingPort;
  imageStore: import("../drivers/vision/types.js").ImageStorePort;
  createMcpManager(
    servers: readonly import("../mcp/types.js").MCPServerConfig[],
  ): MCPManager;
  createAppHostManager(): AppHostManager;
  createMainAgent(
    options: ConstructorParameters<typeof PiAgentRuntime>[0],
  ): PiAgentRuntime;
  prepareProjectRuntime(projectPath: string): Promise<RuntimeConfig>;
}
export class Harness {
  private piAgentRuntime!: PiAgentRuntime;
  sessionManager: SessionManager;
  contextManager: ContextManager;
  memoryManager: MemoryManager;
  driverRegistry: import("../drivers/types.js").DriverRegistryPort;
  toolRegistry: import("../drivers/types.js").ToolCatalogPort;
  skillManager: SkillManager;
  commandManager: CommandManager;
  permissionManager: PermissionManager;
  appHostManager?: AppHostManager;
  configStore: RuntimeConfigStore;
  readonly settings: SettingsService;
  readonly logger: Logger;
  readonly events: HarnessEventBus;
  readonly api: HarnessAPI;
  imagePipeline: import("../drivers/vision/types.js").ImageProcessingPort;
  private readonly imageStore: import("../drivers/vision/types.js").ImageStorePort;
  applicationRegistry: AgentApplicationRegistry;
  agentSupervisor!: AgentSupervisor;
  private processStore: AgentProcessStore;
  private mainAgentId = "";
  private agentProcessDriverRegistered = false;
  private userInteraction: UserInteractionPort = {
    requestPermission: async () => ({ decision: "deny" }),
  };
  private baseSystemPrompt = "";
  private debug = false;
  private debugPromptLastHash = "";
  private readonly mcpController: McpController;
  private readonly projectCoordinator: ProjectCoordinator;
  private readonly agentRuntimeCoordinator: AgentRuntimeCoordinator;
  private readonly createAppHostManager: () => AppHostManager;
  private readonly createMainAgent: HarnessDependencies["createMainAgent"];
  private readonly discoveryDriver: import("../drivers/types.js").Driver;
  private readonly hostId: string;
  private readonly facilities: HostFacilities;
  private readonly checkpointSystem: CheckpointSystem;
  private readonly permissionSuggestions: import("../permissions/fuzzy-llm.js").PermissionSuggestionPort;
  private readonly imageInput: import("../application/harness-api.js").ImageInputApplicationPort;
  private shuttingDown = false;
  private turnIndex = 0;
  private activeVisionAgentId: string | null = null;
  private activeVisionAbortController: AbortController | null = null;
  private readonly conversationCoordinator: ConversationCoordinator;
  private readonly sessionCoordinator: SessionCoordinator;
  private readonly permissionPromptQueue = new PermissionPromptQueue();

  get agent(): PiAgentRuntime {
    return this.piAgentRuntime;
  }

  get mcpManager(): MCPManager | undefined {
    return this.mcpController.manager;
  }

  get config(): RuntimeConfig {
    return this.configStore.get() as RuntimeConfig;
  }

  constructor(
    _config: RuntimeConfig,
    logger: Logger,
    dependencies: HarnessDependencies,
    debug?: boolean,
  ) {
    this.hostId = dependencies.hostId;
    this.facilities = dependencies.facilities;
    this.checkpointSystem = dependencies.checkpointSystem;
    this.permissionSuggestions = dependencies.permissionSuggestions;
    this.imageInput = dependencies.imageInput;
    this.logger = logger;
    this.events = dependencies.events;
    this.configStore = dependencies.configStore;
    this.settings = dependencies.createSettings(
      (previous, next, reason) =>
        this.applySettingsSnapshot(previous, next, reason),
    );
    this.debug = debug ?? false;
    this.applicationRegistry = dependencies.applicationRegistry;
    this.processStore = dependencies.processStore;
    this.sessionManager = dependencies.sessionManager;
    this.conversationCoordinator = new ConversationCoordinator();
    this.sessionCoordinator = new SessionCoordinator({
      sessionManager: this.sessionManager,
      agentSupervisor: () => this.agentSupervisor,
      mainAgentId: () => this.mainAgentId,
      agent: () => this.agent,
      projectPath: () => this.config.projectPath,
      abort: () => this.abort(),
      conversation: this.conversationCoordinator,
      logger,
      isShuttingDown: () => this.shuttingDown,
      resumeNotifications: (notifications) =>
        this.promptAndSaveInternal(
          this.formatAgentNotifications(notifications),
        ),
      publish: (event) => this.events.emit(event),
    });
    this.contextManager = dependencies.contextManager;
    this.sessionManager.bindEvents(this.events);
    this.memoryManager = dependencies.memoryManager;
    this.driverRegistry = dependencies.driverRegistry;
    this.toolRegistry = dependencies.toolRegistry;
    this.discoveryDriver = dependencies.discoveryDriver;
    this.commandManager = dependencies.commandManager;
    this.skillManager = dependencies.skillManager;
    this.permissionManager = dependencies.createPermissionManager(
      (toolName, preview, args) => this.permissionPromptQueue.enqueue(
        () => this.userInteraction.requestPermission(toolName, preview, args),
      ),
      this.settings,
    );
    this.imagePipeline = dependencies.imagePipeline;
    this.imageStore = dependencies.imageStore;
    this.createAppHostManager = dependencies.createAppHostManager;
    this.createMainAgent = dependencies.createMainAgent;
    this.agentRuntimeCoordinator = new AgentRuntimeCoordinator({
      config: () => this.config,
      environment: dependencies.environment,
      drivers: this.driverRegistry,
      supervisor: () => this.agentSupervisor,
      skillTool: () => this.makeSkillTool(),
      skillManifest: (name) => this.skillManager.getManifest(name),
      requestPermission: (toolName, preview, args, context) =>
        this.permissionPromptQueue.enqueue(() =>
          this.userInteraction.requestPermission(
            toolName,
            preview,
            args,
            context,
          )
        ),
      publish: (event) => this.events.emit(event),
    });
    this.mcpController = new McpController({
      createManager: dependencies.createMcpManager,
      drivers: this.driverRegistry,
      tools: this.toolRegistry,
      makeSkillTool: () => this.makeSkillTool(),
      processImages: (images, text, options) =>
        this.processImagesWithVisionAgent(images, text, options),
      applyTools: (tools, deferredHint) => {
        this.agent.state.tools = [...tools];
        this.agent.state.systemPrompt = this.baseSystemPrompt.replace(
          "__DEFERRED_HINT__",
          deferredHint,
        );
      },
      refreshCapabilities: () => this.refreshMainAgentCapabilities(),
      publish: (event) => this.events.emit(event),
      bindManager: (manager) => {
        if (manager && this.appHostManager) {
          this.appHostManager.setMcpManager(manager);
        }
      },
      afterCatalogChange: () => this.dumpDebugPrompt(),
    });
    this.projectCoordinator = new ProjectCoordinator({
      resolve,
      exists: existsSync,
      currentRuntime: () => this.config as RuntimeConfig,
      prepareRuntime: dependencies.prepareProjectRuntime,
      beginTransition: () =>
        this.conversationCoordinator.beginTransition("project"),
      endTransition: () =>
        this.conversationCoordinator.endTransition("project"),
      quiesce: () => this.conversationCoordinator.quiesce(
        () => this.abort(),
      ),
      saveCurrentSession: () => this.sessionCoordinator.saveNow(),
      reloadMcp: (servers) => this.mcpController.reload(servers),
      updateSessionProject: (dataDir, projectPath) =>
        this.sessionManager.updateProjectPath(dataDir, projectPath),
      updateMemoryProject: (dataDir, projectPath) =>
        this.memoryManager.updateProjectPath(dataDir, projectPath),
      updateProcessProject: (projectPath) =>
        this.processStore.updateProjectPath(projectPath),
      updateApplications: (projectPath) =>
        this.applicationRegistry.updateProjectPath(projectPath),
      rebindMainSession: async (projectPath) => {
        const sessionId = this.sessionManager.getCurrentSessionId();
        if (sessionId) {
          await this.agentSupervisor.updateParentSession(
            this.mainAgentId,
            sessionId,
            projectPath,
          );
        }
      },
      replaceRuntime: (next) => this.settings.replaceProjectRuntime(next)
        .then(() => undefined),
      reportError: (scope, error) =>
        this.logger.error(scope, String(error)),
    });
    this.api = this.createApplicationApi();
  }

  bindUserInteraction(port: UserInteractionPort): void {
    this.userInteraction = port;
  }

  private createApplicationApi(): HarnessAPI {
    const events = Object.freeze<HarnessAPI["events"]>({
      on: this.events.on.bind(this.events),
    });
    const agents = Object.freeze<HarnessAPI["agents"]>({
      list: () => Object.freeze(
        this.agentSupervisor.list().map((process) =>
          Object.freeze(serializeAgentProcess(process))
        ),
      ),
      get: (agentId) => {
        const process = this.agentSupervisor.get(agentId);
        return process
          ? Object.freeze(serializeAgentProcess(process))
          : undefined;
      },
      loadPersisted: async (agentIds) => {
        const { found } = await this.agentSupervisor.loadPersisted(agentIds);
        return found;
      },
      spawn: (request) => this.agentSupervisor.spawn(request),
    });

    const api: HarnessAPI = {
      events,
      conversation: Object.freeze<HarnessAPI["conversation"]>({
        prompt: (text, images) =>
          this.promptAndSave(text, images ? [...images] : undefined),
        promptWithImages: (text, images, displayText) =>
          this.promptWithImages(text, [...images], displayText),
        abort: () => this.abort(),
        reset: () => {
          this.sessionManager.trySaveSession(this.agent);
          const config = this.settings.getPublicSnapshot();
          this.sessionManager.createSession(config.provider, config.modelId);
          this.sessionManager.persistEmptySession();
          this.agent.reset();
          this.rebuildSystemPrompt();
        },
        save: () => this.saveSessionNow(),
        snapshot: () => Object.freeze({
          messages: Object.freeze(structuredClone(
            this.agent.state.messages as unknown[],
          )),
          agentMessages: Object.freeze(structuredClone(
            this.sessionManager.agentMessages,
          )),
          modelName: (this.agent.state.model as { name?: string } | undefined)
            ?.name ?? this.config.modelId,
        }),
        compact: async () => {
          const before = this.agent.state.messages.length;
          this.agent.state.messages = await this.contextManager.transform(
            this.agent.state.messages,
          ) as AgentMessage[];
          return Object.freeze({
            before,
            after: this.agent.state.messages.length,
          });
        },
        discardPendingToolCall: () => {
          const messages = this.agent.state.messages as unknown[];
          for (let index = messages.length - 1; index >= 0; index--) {
            const message = messages[index] as {
              role?: unknown;
              content?: unknown;
            };
            if (
              message.role === "assistant"
              && Array.isArray(message.content)
              && message.content.some((block) =>
                !!block
                && typeof block === "object"
                && (block as { type?: unknown }).type === "toolCall"
              )
            ) {
              messages.length = index;
              break;
            }
          }
          return Object.freeze(structuredClone(messages));
        },
        estimateTokens: () =>
          this.contextManager.getEstimatedTokens(this.agent.state.messages),
        contextUsage: (tools = []) => {
          const skillNames = new Set(this.skillManager.listAllSkillNames());
          const snapshot = this.contextManager.getCategoryBreakdown(
            this.agent.state.messages,
            [...tools],
            skillNames,
          );
          return Object.freeze({
            ...snapshot,
            categories: Object.freeze({ ...snapshot.categories }),
          });
        },
        toolResult: (owner, ownerId, toolCallId) => {
          const messages = owner === "session"
            ? this.agent.state.messages
            : ownerId
              ? (
                this.agentSupervisor.get(ownerId)?.runtime.snapshot?.().messages
                ?? this.agentSupervisor.get(ownerId)?.runtimeSnapshot?.messages
              )
              : undefined;
          return messages
            ? findToolResultText(messages, toolCallId)
            : undefined;
        },
        resolveImage: (ref) => {
          const image = this.imageStore.getSync(ref);
          return image
            ? Object.freeze({
                data: image.data,
                mimeType: image.mimeType,
              })
            : undefined;
        },
        streamText: async (request, onEvent) => {
          const model = resolveModel(
            this.config.provider,
            this.config.modelId,
          );
          let text = "";
          const stream = streamSimple(model, {
            systemPrompt: request.systemPrompt,
            messages: [{
              role: "user",
              content: request.userPrompt,
              timestamp: Date.now(),
            }],
          }, {
            apiKey: this.config.apiKey,
            maxTokens: request.maxTokens ?? this.config.maxTokens,
            timeoutMs: 120_000,
            maxRetries: 1,
          });
          for await (const event of stream) {
            if (event.type === "text_delta") {
              text += event.delta;
              onEvent({ type: "text", text: event.delta });
            } else if (event.type === "error") {
              onEvent({
                type: "error",
                text: (event.error as { errorMessage?: string })
                  .errorMessage ?? "Unknown error",
              });
            }
          }
          return text;
        },
      }),
      sessions: Object.freeze<HarnessAPI["sessions"]>({
        list: (options) => Object.freeze(structuredClone(
          options?.all
            ? this.sessionManager.listAllSessions()
            : this.sessionManager.listSessions(),
        )),
        currentId: () =>
          this.sessionManager.getCurrentSessionId() ?? undefined,
        currentMetadata: () => {
          const metadata = this.sessionManager.getCurrentMetadata();
          return metadata
            ? Object.freeze(structuredClone(metadata))
            : undefined;
        },
        totalActiveMs: () => this.sessionManager.getTotalActiveMs(),
        setTitleIntent: (intent) => setTitleIntent(intent),
        save: (pendingPermission) => {
          if (pendingPermission) {
            this.sessionManager.saveSession(this.agent, pendingPermission);
          } else {
            this.saveSessionNow();
          }
        },
        clearPendingPermission: () => {
          this.sessionManager.setPendingPermission(undefined);
          this.saveSessionNow();
        },
        switch: (request) => this.switchSession(request),
        delete: (id) => Object.freeze(this.sessionManager.deleteSession(id)),
        resolve: (idOrPrefix) => {
          const found = this.sessionManager.getSessionFilePath(idOrPrefix);
          return found
            ? Object.freeze(structuredClone(found.metadata))
            : undefined;
        },
        loadSerialized: async (id) => {
          const session = await this.sessionManager.loadSessionFile(id);
          return session
            ? Object.freeze(structuredClone(session))
            : undefined;
        },
      }),
      settings: Object.freeze<HarnessAPI["settings"]>({
        get: () => this.settings.getPublicSnapshot(),
        setModel: (modelId) => this.setModel(modelId),
        setProvider: (provider) => this.setProvider(provider),
        setThinking: (level) => this.setThinking(level),
        setApiKey: async (apiKey) => {
          await this.settings.setApiKey(apiKey);
        },
        setVisionProvider: async (provider) => {
          await this.settings.setVisionProvider(provider);
        },
        setVisionModel: async (model) => {
          await this.settings.setVisionModel(model);
        },
        setVisionKey: async (key) => {
          await this.settings.setVisionKey(key);
        },
        clearVision: async () => {
          await this.settings.clearVision();
        },
        providers: () => Object.freeze(getAllProviders()),
        models: (provider) => Object.freeze(getAllModels(provider)),
        visionProviders: () => Object.freeze(getVisionProviders()),
        visionModels: (provider) =>
          Object.freeze(getVisionModels(provider)),
        modelInfo: (provider, modelId) => {
          const model = resolveModel(
            provider ?? this.config.provider,
            modelId ?? this.config.modelId,
          );
          return Object.freeze({
            id: model.id,
            name: model.name,
            supportsImages: model.input.includes("image"),
          });
        },
      }),
      project: Object.freeze<HarnessAPI["project"]>({
        setPath: (path) => this.updateProjectPath(path),
        resolveAtFiles: (text) => resolveAtFileRefs(
          this.config.projectPath,
          text,
          this.config.atFile,
        ),
        resolveFiles: (fileRefs) => resolveFileRefs(
          this.config.projectPath,
          [...fileRefs],
          this.config.atFile,
        ),
        listFiles: (prefix, maxResults) => listProjectFiles(
          this.config.projectPath,
          prefix,
          maxResults,
        ),
        isImagePath,
      }),
      memory: Object.freeze<HarnessAPI["memory"]>({
        list: (scope) => Object.freeze(structuredClone(
          this.memoryManager.listMemories(scope),
        )),
        add: (content, scope, sessionId) =>
          this.memoryManager.addMemory(content, scope, sessionId),
        remove: (id) => this.memoryManager.removeMemory(id),
        clear: (scope) => this.memoryManager.clearMemories(scope),
      }),
      skills: Object.freeze<HarnessAPI["skills"]>({
        list: () => Object.freeze(this.skillManager.listAll().map(
          ({ skill, active }) => Object.freeze({
            name: skill.name,
            description: skill.description,
            source: skill.source,
            active,
            toolNames: Object.freeze((skill.tools ?? []).map((tool) =>
              typeof tool === "string" ? tool : tool.name
            )),
          }),
        )),
        setEnabled: async (name, enabled) => {
          await this.settings.setSkillEnabled(name, enabled);
          let toolNames: readonly string[] = [];
          if (enabled) {
            const skill = this.skillManager.activate(name, this.driverRegistry);
            toolNames = Object.freeze(skill.tools.map((tool) => tool.name));
          } else {
            this.skillManager.deactivate(name);
          }
          this.agent.state.tools = this.toolRegistry.buildToolsForRequest();
          return Object.freeze({ toolNames });
        },
      }),
      drivers: Object.freeze<HarnessAPI["drivers"]>({
        list: () => Object.freeze(this.driverRegistry.listAll().map(
          (driver) => Object.freeze({
            name: driver.name,
            description: driver.description,
            source: driver.source,
            toolNames: Object.freeze(driver.tools.map((tool) => tool.name)),
          }),
        )),
      }),
      commands: Object.freeze<HarnessAPI["commands"]>({
        list: () => Object.freeze(structuredClone(
          this.commandManager.listManifests(),
        )),
        get: (name) => {
          const manifest = this.commandManager.getManifest(name);
          return manifest
            ? Object.freeze(structuredClone(manifest))
            : undefined;
        },
      }),
      permissions: Object.freeze<HarnessAPI["permissions"]>({
        sessionGrants: () => Object.freeze([
          ...this.permissionManager.getSessionGrants(),
        ]),
        grantForSession: (toolName) =>
          this.permissionManager.grantForSession(toolName),
        persistRule: (rule) => this.settings.persistRule(rule),
        suggestions: (toolName, args) =>
          this.permissionSuggestions.get(toolName, args),
        prefetchSuggestions: (toolName, args, preview) => {
          try {
            this.permissionSuggestions.prefetch(
              resolveModel(this.config.provider, this.config.modelId),
              toolName,
              args,
              preview,
            );
          } catch {
            // Suggestions are best-effort and never gate permission prompts.
          }
        },
        fuzzy: (toolName, args) => Object.freeze({
          toolPattern: deriveFuzzyPattern(toolName),
          argPattern: deriveFuzzyArgPattern(toolName, args),
          argDescription: describeFuzzyArgPattern(toolName, args),
        }),
      }),
      mcp: Object.freeze<HarnessAPI["mcp"]>({
        list: () => {
          if (!this.mcpManager) return Object.freeze([]);
          const deferred = new Set(this.toolRegistry.getDeferredToolNames());
          const discovered = this.toolRegistry.getDiscoveredToolNames();
          return Object.freeze(this.mcpManager.getStates().map((state) => {
            const driver = this.driverRegistry.get(
              mcpDriverName(state.config.name),
            );
            return Object.freeze({
              name: state.config.name,
              description: state.config.description ?? "",
              status: state.status,
              error: state.error,
              toolCount: state.toolCount,
              tools: Object.freeze((driver?.tools ?? []).map((tool) =>
                Object.freeze({
                  name: tool.name,
                  label: tool.label ?? tool.name,
                  description: tool.description ?? "",
                  state: deferred.has(tool.name) && !discovered.has(tool.name)
                    ? "discoverable" as const
                    : "loaded" as const,
                })
              )),
              transport: state.resolvedTransport,
              protocolVersion: state.negotiatedProtocolVersion,
              compatibilityMode: state.compatibilityMode,
              refreshState: state.refreshState,
              refreshError: state.refreshError,
            });
          }));
        },
        refresh: () => this.mcpController.refresh(),
        connect: (serverName) => this.mcpController.connect(serverName),
        disconnect: (serverName) =>
          this.mcpController.disconnect(serverName),
      }),
      agents,
      eval: Object.freeze<HarnessAPI["eval"]>({
        agents,
        hostId: () => this.hostId,
        currentSessionId: () =>
          this.sessionManager.getCurrentSessionId() ?? undefined,
        currentProjectPath: () => this.config.projectPath,
        saveCurrentSession: () => this.saveSessionNow(),
        resolveSession: (idOrPrefix) => {
          const found = this.sessionManager.getSessionFilePath(idOrPrefix);
          return found
            ? Object.freeze(structuredClone(found.metadata))
            : undefined;
        },
        loadSession: async (id) => {
          const session = await this.sessionManager.loadSessionFile(id);
          return session
            ? Object.freeze(structuredClone(session))
            : undefined;
        },
        publish: (event) => this.events.emit(event),
        run: (sessionId) => runWithExecutionContext(
          {
            hostId: this.hostId,
            processId: this.mainAgentId,
            sessionId: this.sessionManager.getCurrentSessionId() ?? "unknown",
            application: "eval",
            cwd: this.config.projectPath,
            facilities: this.facilities,
          },
          () => runEval(sessionId ?? null, {
            harness: this.api.eval,
            ui: {
              addInfo: (text) => this.events.emit({
                type: "ui:info",
                text,
              }),
              addError: (text) => this.events.emit({
                type: "ui:error",
                text,
              }),
            },
          }),
        ),
      }),
      tools: Object.freeze<HarnessAPI["tools"]>({
        deferredNames: () => Object.freeze(
          this.toolRegistry.getDeferredToolNames(),
        ),
      }),
      images: Object.freeze(this.imageInput),
    };
    return Object.freeze(api);
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
    initCheckpointSystem(
      this.config.projectPath,
      sessionId,
      this.checkpointSystem,
    );
    this.driverRegistry.register(this.discoveryDriver);

    if (this.config.appHost?.enabled) {
      this.appHostManager = this.createAppHostManager();
      await this.appHostManager.start();
    }

    const memories = this.memoryManager.getRelevantMemories();
    const skillSection = this.skillManager.getSystemPromptSection();
    this.baseSystemPrompt = this.buildSystemPrompt(memories, skillSection, this.commandManager.getSystemPromptSection());
    const systemPrompt = this.baseSystemPrompt.replace("__DEFERRED_HINT__", this.toolRegistry.buildDeferredToolsHint());

    const model = resolveModel(this.config.provider, this.config.modelId);
    this.contextManager.updateModel(model.contextWindow, model.maxTokens);

    const self = this;
    this.piAgentRuntime = this.createMainAgent({
      initialState: {
        systemPrompt,
        model,
        tools: [this.makeSkillTool()],
        thinkingLevel: this.config.thinkingLevel,
      },
      streamFn: (m: Model<Api>, ctx: Context, opts?: SimpleStreamOptions) => streamSimple(m, ctx, {
        ...opts,
        apiKey: opts?.apiKey ?? self.config.apiKey,
        maxTokens: self.config.maxTokens,
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
    const fallbackRegistry = new AgentFallbackRegistry();
    fallbackRegistry.register(new OcrFallbackHandler(this.events));
    this.agentSupervisor = new AgentSupervisor(
      this.applicationRegistry,
      (application, context, agentId) =>
        this.agentRuntimeCoordinator.create(application, context, agentId),
      this.processStore,
      this.events,
      this.logger,
      () => this.agentRuntimeCoordinator.availableToolNames(
        AGENT_PROCESS_TOOL_NAMES,
      ),
      1,
      fallbackRegistry,
      this.hostId,
      this.facilities,
    );
    this.events.on("agent:exit", (event) => {
      this.recordSubagentExit(event.result.agentId);
      this.sessionCoordinator.scheduleBackgroundProcess(
        this.agentSupervisor.get(event.result.agentId),
      );
    });
    const mainContext = createMainAgentContext(
      this.config.projectPath,
      session.id,
      this.agentRuntimeCoordinator.availableToolNames(AGENT_PROCESS_TOOL_NAMES),
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
    await this.syncAgentProcessDriver(this.config.agents.enabled);
    await this.dumpDebugPrompt();
  }

  /**
   * Prompt the agent with retry logic for transient errors.
   * On success, saves the session. On failure, retries up to maxRetries
   * with exponential backoff, then saves the failed state.
   */
  async promptAndSave(text: string, images?: ImageContent[]): Promise<void> {
    return this.conversationCoordinator.prompt(
      this.conversationPromptOptions(text, images),
    );
  }

  private async promptAndSaveInternal(text: string, images?: ImageContent[]): Promise<void> {
    return this.conversationCoordinator.executePrompt(
      this.conversationPromptOptions(text, images),
    );
  }

  private conversationPromptOptions(text: string, images?: ImageContent[]) {
    return {
      text,
      images,
      maxRetries: this.config.retry.maxRetries,
      baseDelayMs: this.config.retry.baseDelayMs,
      maxDelayMs: this.config.retry.maxDelayMs,
      messageCount: () => this.agent.state.messages.length,
      truncateMessages: (length: number) => {
        this.agent.state.messages.length = length;
      },
      prompt: (promptText: string, promptImages?: readonly ImageContent[]) =>
        runWithExecutionContext(
          {
            hostId: this.hostId,
            processId: this.mainAgentId,
            sessionId: this.sessionManager.getCurrentSessionId() ?? "unknown",
            application: "main",
            cwd: this.config.projectPath,
            facilities: this.facilities,
          },
          () => this.agent.prompt(
            promptText,
            promptImages ? [...promptImages] : undefined,
          ),
        ),
      lastError: () => {
        const message = this.findLastAssistantMessage(
          this.agent.state.messages as any[],
        );
        return message?.stopReason === "error"
          ? message.errorMessage ?? "Unknown model error"
          : undefined;
      },
      isRetryable: (error: string) => this.isRetryableError(error),
      save: () => this.sessionCoordinator.saveNow(),
      publish: (event: Parameters<HarnessEventBus["emit"]>[0]) =>
        this.events.emit(event),
    };
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

  async switchSession(request: SwitchSessionRequest): Promise<SwitchSessionResult> {
    return this.sessionCoordinator.switch(request);
  }

  /**
   * Force a session save immediately. Safe to call from anywhere,
   * including error handlers and shutdown hooks.
   */
  saveSessionNow(): void {
    this.sessionCoordinator.saveNow();
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
      tools: extractAgentToolExecutions(runtimeMessages),
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

  private async refreshMainAgentCapabilities(): Promise<void> {
    await this.agentRuntimeCoordinator.refreshMain(
      this.mainAgentId,
      AGENT_PROCESS_TOOL_NAMES,
    );
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
    const cachedRefs = await Promise.all(
      images.map((image) => this.imageStore.put(image)),
    );
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
    return this.conversationCoordinator.run(() =>
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
    this.conversationCoordinator.abort(() => this.abortRuntime());
  }

  private abortRuntime(): void {
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
    this.sessionCoordinator.noteSavedMessageCount();
    // Restore images into agent state for the UI to render
    const restoredImgs: ImageContent[] = [];
    for (const ref of cachedRefs) {
      const cached = this.imageStore.getSync(ref);
      if (cached) restoredImgs.push(cached);
    }
    if (restoredImgs.length > 0 && userMsg) {
      userMsg.images = restoredImgs.map((img: ImageContent) => ({
        data: img.data,
        mimeType: img.mimeType,
      }));
    }
  }

  async start(): Promise<void> {
    await this.mcpController.start(this.config.mcp);
    this.sessionCoordinator.startAutoSave();

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
  }

  async setModel(modelId: string): Promise<void> {
    await this.settings.setModel(modelId);
  }


  async setProvider(providerId: string): Promise<void> {
    if (this.config.provider === providerId) return;
    await this.settings.setProvider(providerId);
  }

  async setThinking(level: string): Promise<void> {
    await this.settings.setThinking(level);
  }

  private async applySettingsSnapshot(
    previous: RuntimeConfigSnapshot,
    next: RuntimeConfigSnapshot,
    reason: SettingsChangeReason,
  ): Promise<void> {
    const modelChanged = Boolean(this.piAgentRuntime) && (
      previous.provider !== next.provider
      || previous.modelId !== next.modelId
    );
    const model = modelChanged
      ? resolveModel(next.provider, next.modelId)
      : undefined;

    this.permissionManager.updateConfig(
      next.permissions as RuntimeConfig["permissions"],
    );
    this.imagePipeline?.updateConfig({
      visionConfig: next.vision as RuntimeConfig["vision"],
      fallbackApiKey: next.apiKey,
    });
    this.contextManager.updateConfig(
      next.context as RuntimeConfig["context"],
    );
    this.memoryManager.updateConfig(
      next.memory as RuntimeConfig["memory"],
    );
    if (
      previous.userCommandsDir !== next.userCommandsDir
      || previous.projectCommandsDir !== next.projectCommandsDir
    ) {
      this.commandManager.reloadDirs(
        next.userCommandsDir,
        next.projectCommandsDir,
      );
    }
    if (
      reason === "project"
      || reason === "runtime"
      || reason === "rollback"
      || reason === "skill"
      || previous.userSkillsDir !== next.userSkillsDir
      || previous.projectSkillsDir !== next.projectSkillsDir
    ) {
      this.skillManager.reloadDirs(
        next.userSkillsDir,
        next.projectSkillsDir,
        this.driverRegistry,
      );
      const disabled = new Set(next.disabledSkills);
      for (const name of this.skillManager.listAllSkillNames()) {
        if (disabled.has(name)) {
          this.skillManager.deactivate(name);
        } else {
          this.skillManager.activate(name, this.driverRegistry);
        }
      }
      for (const name of next.skills) {
        if (!disabled.has(name) && this.skillManager.getManifest(name)) {
          this.skillManager.activate(name, this.driverRegistry);
        }
      }
    }
    await this.syncAgentProcessDriver(next.agents.enabled);

    if (model) {
      this.agent.state.model = model;
      this.contextManager.updateModel(model.contextWindow, model.maxTokens);
      this.agent.reset();
      this.events.emit({ type: "ui:conversation:clear" });
    }
    if (
      this.piAgentRuntime
      && (
        modelChanged
        || previous.thinkingLevel !== next.thinkingLevel
      )
    ) {
      this.agent.state.thinkingLevel = next.thinkingLevel;
    }
    if (
      modelChanged
      || reason === "project"
      || reason === "runtime"
      || reason === "rollback"
      || reason === "skill"
    ) {
      this.rebuildSystemPrompt();
    }

    if (reason !== "rollback") {
      this.events.emit({
        type: "config:change",
        data: this.settings.getPublicSnapshot(),
      });
    }
  }

  async updateProjectPath(cwd: string): Promise<{ success: boolean; error?: string }> {
    return this.projectCoordinator.switchProject(cwd);
  }

  private async syncAgentProcessDriver(enabled: boolean): Promise<void> {
    if (!this.agentSupervisor || !this.mainAgentId) return;
    if (enabled && !this.agentProcessDriverRegistered) {
      this.driverRegistry.register({
        name: "agent-process",
        description: "Agent process creation, inspection, waiting, signalling, and IPC",
        tools: makeAgentProcessTools(this.agentSupervisor, this.mainAgentId),
        source: "builtin",
      });
      this.agentProcessDriverRegistered = true;
    } else if (!enabled && this.agentProcessDriverRegistered) {
      this.driverRegistry.unregister("agent-process");
      this.agentProcessDriverRegistered = false;
    } else {
      return;
    }

    if (this.piAgentRuntime) {
      await this.mcpController.refreshCatalog();
    }
  }

  async shutdown(): Promise<void> {
    this.sessionCoordinator.stopAutoSave();
    // Save session FIRST, before any other shutdown steps.
    // This ensures data is persisted even if later steps fail.
    // Also save regardless of shuttingDown flag — this is the last chance to persist.
    if (this.piAgentRuntime) {
      this.sessionManager.trySaveSession(this.agent);
      this.sessionCoordinator.noteSavedMessageCount();
    }

    if (this.shuttingDown) return;
    this.shuttingDown = true;

    try {
      await this.mcpController.shutdown();
    } catch (err) {
      this.logger.error("McpShutdown", String(err));
    }
    if (this.agentSupervisor) {
      try {
        await this.agentSupervisor.shutdown();
      } catch (err) {
        this.logger.error("AgentSupervisorShutdown", String(err));
      }
    }
    try {
      await this.imagePipeline.shutdown();
    } catch (err) {
      this.logger.error("VisionShutdown", String(err));
    }
    // 4.2: Clean up checkpoint directories for this session
    try { shutdownCheckpointSystem(this.checkpointSystem); } catch {}
    this.permissionSuggestions.clear();

    if (this.appHostManager) {
      try {
        await this.appHostManager.shutdown();
      } catch (err) {
        this.logger.error("AppHostShutdown", String(err));
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
        this.events.emit({ type: "mcp:app:registered", app });
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
      this.events.emit({ type: "mcp:app:registered", app });

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
            this.sessionCoordinator.noteSavedMessageCount();
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
          this.sessionCoordinator.noteSavedMessageCount();
        }
        if (event.type === "agent_start") {
          this.events.emit({ type: "turn:streaming:start" });
        }
        if (event.type === "turn_end") {
          // Save session before broadcasting so sidebar gets fresh metadata
          this.sessionManager.trySaveSession(this.agent);
          this.sessionCoordinator.noteSavedMessageCount();
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
        this.sessionCoordinator.noteSavedMessageCount();
      }
    });
  }

}
