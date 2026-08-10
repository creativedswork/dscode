import type { HarnessAPI } from "../../src/application/harness-api.js";
import { HarnessEventBus } from "../../src/application/events.js";

export function createHarnessApiFixture(
  overrides: Partial<HarnessAPI> = {},
): HarnessAPI {
  const events = new HarnessEventBus({ error: () => {} } as any);
  const config = {
    provider: "test",
    modelId: "model",
    apiKey: "(not set)",
    thinkingLevel: "off" as const,
    maxTokens: 8192,
    projectPath: "/project",
    skills: [],
    disabledSkills: [],
  };
  const agents: HarnessAPI["agents"] = {
    list: () => [],
    get: () => undefined,
    loadPersisted: async () => new Map(),
    spawn: async () => {
      throw new Error("Agent spawn is not configured");
    },
  };
  const fixture: HarnessAPI = {
    events,
    conversation: {
      prompt: async () => {},
      promptWithImages: async () => {},
      abort: () => {},
      reset: () => {},
      save: () => {},
      snapshot: () => ({
        messages: [],
        agentMessages: [],
        modelName: "model",
      }),
      compact: async () => ({ before: 0, after: 0 }),
      discardPendingToolCall: () => [],
      estimateTokens: () => 0,
      contextUsage: () => ({
        total: 0,
        used: 0,
        free: 0,
        categories: {
          system: 0,
          rules: 0,
          user: 0,
          thinking: 0,
          readwrite: 0,
          edit: 0,
          shell: 0,
          skill: 0,
          mcp: 0,
          other: 0,
        },
      }),
      toolResult: () => undefined,
      resolveImage: () => undefined,
      streamText: async () => "",
    },
    sessions: {
      list: () => [],
      currentId: () => undefined,
      currentMetadata: () => undefined,
      totalActiveMs: () => 0,
      setTitleIntent: () => {},
      save: () => {},
      clearPendingPermission: () => {},
      switch: async () => {
        throw new Error("Session switch is not configured");
      },
      delete: () => ({ success: true }),
      resolve: () => undefined,
      loadSerialized: async () => undefined,
    },
    settings: {
      get: () => config,
      setModel: async () => {},
      setProvider: async () => {},
      setThinking: async () => {},
      setApiKey: async () => {},
      setVisionProvider: async () => {},
      setVisionModel: async () => {},
      setVisionKey: async () => {},
      clearVision: async () => {},
      providers: () => [],
      models: () => [],
      visionProviders: () => [],
      visionModels: () => [],
      modelInfo: (_provider, modelId) => ({
        id: modelId ?? "model",
        name: modelId ?? "model",
        supportsImages: false,
      }),
    },
    project: {
      setPath: async () => ({ success: true }),
      resolveAtFiles: (text) => ({
        text,
        warnings: [],
        images: [],
        reject: false,
      }),
      resolveFiles: () => ({
        text: "",
        warnings: [],
        images: [],
        reject: false,
      }),
      listFiles: () => [],
      isImagePath: () => false,
    },
    memory: {
      list: () => [],
      add: () => {},
      remove: () => {},
      clear: () => {},
    },
    skills: {
      list: () => [],
      setEnabled: async () => ({ toolNames: [] }),
    },
    drivers: { list: () => [] },
    commands: {
      list: () => [],
      get: () => undefined,
    },
    permissions: {
      sessionGrants: () => [],
      grantForSession: () => {},
      persistRule: async () => {},
      suggestions: () => [],
      prefetchSuggestions: () => {},
      fuzzy: (toolName) => ({
        toolPattern: toolName,
        argPattern: null,
        argDescription: null,
      }),
    },
    mcp: {
      list: () => [],
      refresh: async () => {},
      connect: async () => {},
      disconnect: async () => {},
    },
    agents,
    eval: {
      agents,
      hostId: () => "host-test",
      currentSessionId: () => undefined,
      currentProjectPath: () => config.projectPath,
      saveCurrentSession: () => {},
      resolveSession: () => undefined,
      loadSession: async () => undefined,
      publish: () => {},
      run: async () => {},
    },
    tools: { deferredNames: () => [] },
    images: {
      readFile: async () => ({
        type: "image",
        data: "",
        mimeType: "image/png",
      }),
      readClipboard: async () => null,
      readClipboardNonBlocking: async () => null,
    },
  };
  return Object.assign(fixture, overrides);
}
