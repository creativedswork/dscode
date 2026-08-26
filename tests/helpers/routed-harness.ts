import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  Agent as PiAgentRuntime,
  type StreamFn,
} from "@earendil-works/pi-agent-core";
import type { ImageContent } from "@earendil-works/pi-ai";
import { vi } from "vitest";

import type { AgentDefinition } from "../../src/agents/definitions/types.js";
import { AgentApplicationRegistry } from "../../src/agents/definitions/registry.js";
import type { AgentProcessStore } from "../../src/agents/process/store.js";
import {
  Harness,
  type HarnessDependencies,
} from "../../src/application/harness.js";
import { HarnessEventBus } from "../../src/application/events.js";
import { CheckpointSystem } from "../../src/checkpoint/index.js";
import { RuntimeConfigStore } from "../../src/config/runtime-config-store.js";
import { SettingsRepository } from "../../src/config/settings-repository.js";
import { SettingsService } from "../../src/config/settings-service.js";
import type { RuntimeConfig } from "../../src/config/types.js";
import { ContextManager } from "../../src/context/manager.js";
import { makeDiscoveryDriver } from "../../src/drivers/discovery.js";
import { DriverRegistry } from "../../src/drivers/registry.js";
import { ToolRegistry } from "../../src/drivers/tool-registry.js";
import type {
  ImageProcessingPort,
  ImageStorePort,
  ProcessResult,
} from "../../src/drivers/vision/types.js";
import { HostFacilityRegistry } from "../../src/kernel/host-facilities.js";
import { Logger } from "../../src/kernel/logger.js";
import { MCPManager } from "../../src/mcp/manager.js";
import { MemoryManager } from "../../src/memory/manager.js";
import { PermissionManager } from "../../src/permissions/manager.js";
import { PermissionSuggestionStore } from "../../src/permissions/fuzzy-llm.js";
import type { ImageRef } from "../../src/resources/images/types.js";
import { SessionManager } from "../../src/session/manager.js";
import { SkillManager } from "../../src/skills/manager.js";
import { CommandManager } from "../../src/slash-commands/manager.js";

export interface RoutedHarnessFixture {
  root: string;
  harness: Harness;
  drivers: DriverRegistry;
  imagePipeline: ImageProcessingPort & {
    process: ReturnType<typeof vi.fn>;
  };
  imageStore: ImageStorePort & {
    put: ReturnType<typeof vi.fn>;
    putSync: ReturnType<typeof vi.fn>;
  };
  cleanup(): Promise<void>;
}

interface FixtureOptions {
  streamFn: StreamFn;
  agentsEnabled?: boolean;
  vision?: RuntimeConfig["vision"];
  definitions?: readonly AgentDefinition[];
  configureDrivers?(drivers: DriverRegistry): void;
  configureDeferredDrivers?(drivers: DriverRegistry): void;
}

function makeConfig(
  root: string,
  options: FixtureOptions,
): RuntimeConfig {
  return {
    provider: "deepseek",
    modelId: "deepseek-v4-flash",
    apiKey: "test-key",
    thinkingLevel: "off",
    maxTokens: 1024,
    startupPath: root,
    projectPath: root,
    configDir: join(root, "config"),
    dataDir: join(root, "data"),
    userSkillsDir: join(root, "config", "skills"),
    projectSkillsDir: join(root, ".dscode", "skills"),
    userCommandsDir: join(root, "config", "commands"),
    projectCommandsDir: join(root, ".dscode", "commands"),
    context: {
      strategy: "sliding-window",
      targetUtilization: 0.85,
      minRetainedMessages: 6,
    },
    memory: {
      enabled: false,
      autoExtract: false,
      maxGlobalEntries: 10,
      maxProjectEntries: 10,
    },
    permissions: {
      defaultDecision: "allow",
      rules: [],
      denyPatterns: [],
    },
    skills: [],
    disabledSkills: [],
    mcp: [],
    appHost: { enabled: false },
    agents: { enabled: options.agentsEnabled ?? true },
    vision: options.vision,
    retry: {
      maxRetries: 0,
      baseDelayMs: 1,
      maxDelayMs: 1,
      retryOnTimeout: false,
      retryOnRateLimit: false,
      retryOnServerError: false,
    },
  };
}

function makeImageStore(): RoutedHarnessFixture["imageStore"] {
  const images = new Map<string, ImageContent>();
  let sequence = 0;
  const store = {
    put: vi.fn(async (image: ImageContent): Promise<ImageRef> => {
      const ref = {
        type: "image_ref" as const,
        hash: `image-${++sequence}`,
        mimeType: image.mimeType,
      };
      images.set(ref.hash, image);
      return ref;
    }),
    get: vi.fn(async (ref: ImageRef) => images.get(ref.hash) ?? null),
    getSync: vi.fn((ref: ImageRef) => images.get(ref.hash) ?? null),
    putSync: vi.fn((image: ImageContent): ImageRef => {
      const ref = {
        type: "image_ref" as const,
        hash: `image-${++sequence}`,
        mimeType: image.mimeType,
      };
      images.set(ref.hash, image);
      return ref;
    }),
  };
  return store;
}

export async function createRoutedHarnessFixture(
  options: FixtureOptions,
): Promise<RoutedHarnessFixture> {
  const root = mkdtempSync(join(tmpdir(), "dscode-routing-"));
  const config = makeConfig(root, options);
  const logger = new Logger({
    type: "test",
    id: "routing",
    directory: join(root, "logs"),
  });
  const events = new HarnessEventBus(logger);
  const drivers = new DriverRegistry();
  options.configureDrivers?.(drivers);
  const tools = new ToolRegistry(drivers);
  const configStore = new RuntimeConfigStore(config);
  const imageStore = makeImageStore();
  const imagePipeline = {
    process: vi.fn(async (
      _images: ImageContent[],
      text: string,
    ): Promise<ProcessResult> => ({
      source: "ocr",
      enrichedText: `${text}\n\n<image_text>\nvisible text\n</image_text>`,
      cachedRefs: [],
    })),
    updateConfig: vi.fn(),
    shutdown: vi.fn(async () => {}),
  };
  const checkpointSystem = new CheckpointSystem(
    "routing-test",
    join(root, "checkpoints"),
  );
  const processStore = {
    save: vi.fn(async () => {}),
    loadMany: vi.fn(async (agentIds: readonly string[]) => ({
      found: new Map(),
      missing: [...agentIds],
    })),
    updateProjectPath: vi.fn(),
  } as unknown as AgentProcessStore;
  const dependencies: HarnessDependencies = {
    hostId: "routing-test",
    facilities: new HostFacilityRegistry(),
    environment: {},
    checkpointSystem,
    events,
    configStore,
    createSettings: (onApplied) => new SettingsService({
      repository: new SettingsRepository(),
      runtimeStore: configStore,
      paths: {
        userConfig: join(config.configDir, "config.json"),
        userSettings: join(config.configDir, "settings.json"),
        projectSettings: () => join(root, ".dscode", "settings.json"),
      },
      resolveRuntimeConfig: () => config,
      onApplied,
    }),
    applicationRegistry: new AgentApplicationRegistry({
      projectPath: root,
      configDir: config.configDir,
      homeDir: root,
      definitions: options.definitions,
    }),
    processStore,
    sessionManager: new SessionManager(config.dataDir, root, logger, imageStore),
    contextManager: new ContextManager(config.context),
    memoryManager: new MemoryManager(config.dataDir, root, config.memory),
    driverRegistry: drivers,
    toolRegistry: tools,
    discoveryDriver: makeDiscoveryDriver(tools),
    commandManager: new CommandManager(
      config.userCommandsDir,
      config.projectCommandsDir,
    ),
    skillManager: new SkillManager(
      config.userSkillsDir,
      config.projectSkillsDir,
    ),
    createPermissionManager: (request, settings) =>
      new PermissionManager(config.permissions, request, settings),
    permissionSuggestions: new PermissionSuggestionStore(),
    imagePipeline,
    imageStore,
    imageInput: {
      readFile: async () => {
        throw new Error("unused");
      },
      readClipboard: async () => null,
      readClipboardNonBlocking: async () => null,
    },
    createMcpManager: (servers) =>
      new MCPManager([...servers], {}, imageStore),
    createAppHostManager: () => ({}) as never,
    createMainAgent: (agentOptions) =>
      new PiAgentRuntime({ ...agentOptions, streamFn: options.streamFn }),
    prepareProjectRuntime: async () => config,
  };
  const harness = new Harness(config, logger, dependencies);
  await harness.initialize();
  await harness.start();
  if (options.configureDeferredDrivers) {
    options.configureDeferredDrivers(drivers);
    const skillTool = harness.agent.state.tools.find(
      (tool) => tool.name === "skill",
    );
    if (!skillTool) throw new Error("Harness skill tool is unavailable");
    tools.initialize(skillTool);
  }
  return {
    root,
    harness,
    drivers,
    imagePipeline,
    imageStore,
    cleanup: async () => {
      await harness.shutdown();
      rmSync(root, { recursive: true, force: true });
    },
  };
}
