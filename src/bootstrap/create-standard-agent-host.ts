import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { Agent as PiAgentRuntime } from "@earendil-works/pi-agent-core";

import { AgentApplicationRegistry } from "../agents/definitions/registry.js";
import { AgentProcessStore } from "../agents/process/store.js";
import type {
  HarnessAPI,
  UserInteractionPort,
} from "../application/harness-api.js";
import {
  AgentHostStartError,
  type AgentHostState,
} from "../application/agent-host.js";
import type { AgentDefinition } from "../agents/definitions/types.js";
import type { McpAppResourceProxy } from "../mcp/app/types.js";
import { SettingsRepository } from "../config/settings-repository.js";
import { RuntimeConfigStore } from "../config/runtime-config-store.js";
import { SettingsService } from "../config/settings-service.js";
import type { RuntimeConfig } from "../config/types.js";
import { ContextManager } from "../context/manager.js";
import {
  loadConfig,
  projectSettingsPath,
} from "../config/loader.js";
import {
  Harness,
  type HarnessDependencies,
} from "../application/harness.js";
import { HarnessEventBus } from "../application/events.js";
import { makeDiscoveryDriver } from "../drivers/discovery.js";
import { DriverRegistry } from "../drivers/registry.js";
import { ToolRegistry } from "../drivers/tool-registry.js";
import { ImagePipeline } from "../drivers/vision/pipeline.js";
import { MCPManager } from "../mcp/manager.js";
import { AppHostManager } from "../mcp/app/host.js";
import { MemoryManager } from "../memory/manager.js";
import { PermissionManager } from "../permissions/manager.js";
import { SessionManager } from "../session/manager.js";
import { SkillManager } from "../skills/manager.js";
import { CommandManager } from "../slash-commands/manager.js";
import { HOST_LOGGER_FACILITY, type Logger } from "../kernel/logger.js";
import { ServiceSupervisor } from "../services/service-supervisor.js";
import { prepareOpenDesignRuntime } from "../integrations/open-design/index.js";
import { createIntegrationSettingsSource } from "../integrations/open-design/settings.js";
import type { IntegrationRuntimeOverride } from "../integrations/open-design/types.js";
import { HostFacilityRegistry } from "../kernel/host-facilities.js";
import {
  CHECKPOINT_FACILITY,
  CheckpointSystem,
} from "../checkpoint/index.js";
import {
  ANCHOR_INVALIDATION_FACILITY,
  AnchorInvalidationStore,
} from "../context/anchor-invalidation.js";
import {
  UNDO_STORE_FACILITY,
  UndoSnapshotStore,
} from "../drivers/edit/undo-store.js";
import {
  IMAGE_CACHE_FACILITY,
  ImageCacheStore,
} from "../drivers/vision/cache.js";
import {
  readClipboardImage,
  readClipboardImageNonBlocking,
  readImageFile,
} from "../drivers/vision/reader.js";
import { PermissionSuggestionStore } from "../permissions/fuzzy-llm.js";

export interface StandardAgentHostOptions {
  config: RuntimeConfig;
  logger: Logger;
  debug?: boolean;
  environment: Readonly<Record<string, string | undefined>>;
  homeDirectory: string;
  integrationOverrides?: readonly IntegrationRuntimeOverride[];
  id?: string;
  agentDefinitions?: readonly AgentDefinition[];
}

export interface StandardAgentHost {
  readonly id: string;
  readonly api: HarnessAPI;
  state(): AgentHostState;
  initialize(): Promise<void>;
  start(): Promise<void>;
  shutdown(): Promise<void>;
  bindUserInteraction(port: UserInteractionPort): void;
  save(): void;
  appResourceProxy(): McpAppResourceProxy | undefined;
}

export async function createStandardAgentHost(
  options: StandardAgentHostOptions,
): Promise<StandardAgentHost> {
  const { logger } = options;
  const hostId = options.id ?? `host-${randomUUID()}`;
  const services = new ServiceSupervisor(logger, {
    environment: options.environment,
  });
  const prepareProjectRuntime = async (
    projectPath: string,
    overrides: readonly IntegrationRuntimeOverride[] = [],
  ): Promise<RuntimeConfig> => {
    const baseConfig = projectPath === options.config.projectPath
      ? options.config
      : loadConfig(projectPath, {
          environment: options.environment,
          currentWorkingDirectory: options.config.startupPath,
          configDir: options.config.configDir,
          dataDir: options.config.dataDir,
          userMcpFile: join(options.homeDirectory, ".mcp.json"),
          warn: (message) => logger.warn("Config", message.trim()),
        });
    const source = createIntegrationSettingsSource({
      projectPath,
      environment: options.environment,
    });
    return (await prepareOpenDesignRuntime(
      baseConfig,
      source,
      services,
      logger,
      overrides.find((override) => override.id === "open-design"),
    )).config;
  };
  const config = await prepareProjectRuntime(
    options.config.projectPath,
    options.integrationOverrides,
  );
  const events = new HarnessEventBus(logger);
  const facilities = new HostFacilityRegistry();
  const checkpointSystem = new CheckpointSystem(
    hostId,
    join(config.dataDir, "checkpoints"),
  );
  facilities.register(HOST_LOGGER_FACILITY, logger);
  facilities.register(CHECKPOINT_FACILITY, checkpointSystem);
  facilities.register(
    ANCHOR_INVALIDATION_FACILITY,
    new AnchorInvalidationStore(),
  );
  facilities.register(UNDO_STORE_FACILITY, new UndoSnapshotStore());
  const imageStore = new ImageCacheStore(
    join(config.dataDir, "images"),
    logger,
  );
  facilities.register(IMAGE_CACHE_FACILITY, imageStore);
  const configStore = new RuntimeConfigStore(config);
  const driverRegistry = new DriverRegistry();
  const toolRegistry = new ToolRegistry(driverRegistry);
  const dependencies: HarnessDependencies = {
    hostId,
    facilities,
    environment: options.environment,
    checkpointSystem,
    events,
    configStore,
    createSettings: (onApplied) => new SettingsService({
      repository: new SettingsRepository(),
      runtimeStore: configStore,
      paths: {
        userConfig: join(config.configDir, "config.json"),
        userSettings: join(config.configDir, "settings.json"),
        projectSettings: (projectPath) => projectSettingsPath(projectPath),
      },
      resolveRuntimeConfig: (projectPath) => loadConfig(projectPath, {
        environment: options.environment,
        currentWorkingDirectory: config.startupPath,
        configDir: config.configDir,
        dataDir: config.dataDir,
        userMcpFile: join(options.homeDirectory, ".mcp.json"),
        warn: (message) => logger.warn("Config", message.trim()),
      }),
      onApplied,
    }),
    applicationRegistry: new AgentApplicationRegistry({
      projectPath: config.projectPath,
      configDir: config.configDir,
      managedDir: config.managedAgentsDir,
      definitions: options.agentDefinitions,
    }),
    processStore: new AgentProcessStore(config.dataDir, config.projectPath),
    sessionManager: new SessionManager(
      config.dataDir,
      config.projectPath,
      logger,
      imageStore,
    ),
    contextManager: new ContextManager(config.context),
    memoryManager: new MemoryManager(
      config.dataDir,
      config.projectPath,
      config.memory,
    ),
    driverRegistry,
    toolRegistry,
    discoveryDriver: makeDiscoveryDriver(toolRegistry),
    commandManager: new CommandManager(
      config.userCommandsDir,
      config.projectCommandsDir,
    ),
    skillManager: new SkillManager(
      config.userSkillsDir,
      config.projectSkillsDir,
    ),
    createPermissionManager: (request, settings) =>
      new PermissionManager(
        config.permissions,
        request,
        settings,
        () => {},
      ),
    permissionSuggestions: new PermissionSuggestionStore(),
    imagePipeline: new ImagePipeline({
      visionConfig: config.vision,
      fallbackApiKey: config.apiKey,
      environment: options.environment,
      onWarning: (message) =>
        events.emit({ type: "ui:warning", text: message }),
    }),
    imageStore,
    imageInput: {
      readFile: readImageFile,
      readClipboard: readClipboardImage,
      readClipboardNonBlocking: readClipboardImageNonBlocking,
    },
    createMcpManager: (servers) =>
      new MCPManager([...servers], options.environment, imageStore),
    createAppHostManager: () => new AppHostManager(),
    createMainAgent: (agentOptions) => new PiAgentRuntime(agentOptions),
    prepareProjectRuntime,
  };
  const harness = new Harness(
    config,
    logger,
    dependencies,
    options.debug,
  );
  let state: AgentHostState = "created";
  let initialized = false;
  let initializePromise: Promise<void> | undefined;
  let startPromise: Promise<void> | undefined;
  let shutdownPromise: Promise<void> | undefined;
  let releasePromise: Promise<void> | undefined;
  const release = async (): Promise<void> => {
    releasePromise ??= (async () => {
      try {
        await harness.shutdown();
      } finally {
        await services.shutdown();
        facilities.clear();
      }
    })();
    return releasePromise;
  };
  const initialize = (): Promise<void> => {
    if (initialized) return Promise.resolve();
    initializePromise ??= (async () => {
      try {
        await harness.initialize();
        initialized = true;
      } catch (error) {
        state = "failed";
        await release();
        throw error;
      }
    })();
    return initializePromise;
  };
  const shutdown = (): Promise<void> => {
    if (shutdownPromise) return shutdownPromise;
    shutdownPromise = (async () => {
      if (state === "stopped") return;
      state = "stopping";
      await release();
      state = "stopped";
    })();
    return shutdownPromise;
  };
  return Object.freeze({
    id: hostId,
    api: harness.api,
    state: () => state,
    initialize,
    start: () => {
      if (state === "running") return Promise.resolve();
      if (state === "stopped" || state === "stopping") {
        return Promise.reject(
          new Error(`Agent Host ${hostId} is already stopped`),
        );
      }
      if (startPromise) return startPromise;
      state = "starting";
      startPromise = (async () => {
        try {
          await initialize();
          await harness.start();
          state = "running";
        } catch (error) {
          await release();
          state = "failed";
          throw new AgentHostStartError(hostId, { cause: error });
        }
      })();
      return startPromise;
    },
    shutdown,
    bindUserInteraction: (port: UserInteractionPort) =>
      harness.bindUserInteraction(port),
    save: () => harness.saveSessionNow(),
    appResourceProxy: () => harness.appHostManager,
  });
}
