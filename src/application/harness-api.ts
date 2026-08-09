import type { ImageContent } from "@earendil-works/pi-ai";

import type {
  SerializedAgentProcess,
  SpawnAgentRequest,
  SpawnAgentResult,
} from "../agents/process/types.js";
import type { CommandManifest } from "../commands/types.js";
import type {
  PublicRuntimeConfigSnapshot,
  RuntimeConfig,
} from "../config/types.js";
import type { UsageCategory } from "../context/manager.js";
import type { HarnessEvent, HarnessEventType } from "../core/events.js";
import type { MemoryEntry } from "../memory/types.js";
import type { MCPServerState } from "../mcp/types.js";
import type { PermissionRuleConfig } from "../permissions/types.js";
import type { LlmSuggestion } from "../permissions/fuzzy-llm.js";
import type {
  PermissionPromptContext,
  PermissionPromptResult,
} from "../permissions/types.js";
import type {
  AgentSessionMessage,
  PendingPermission,
  SerializedSession,
  SessionMetadata,
  SwitchSessionRequest,
  SwitchSessionResult,
} from "../session/types.js";
import type { ImageRef } from "../resources/images/types.js";

export interface ApplicationEventSource {
  on<E extends HarnessEventType>(
    type: E,
    handler: (event: Extract<HarnessEvent, { type: E }>) => void,
  ): () => void;
}

export interface UserInteractionPort {
  requestPermission(
    toolName: string,
    preview: string,
    args: unknown,
    context?: PermissionPromptContext,
  ): Promise<PermissionPromptResult>;
}

export interface ConversationSnapshot {
  readonly messages: readonly unknown[];
  readonly agentMessages: readonly AgentSessionMessage[];
  readonly modelName: string;
}

export interface ContextUsageSnapshot {
  readonly total: number;
  readonly used: number;
  readonly free: number;
  readonly categories: Readonly<Record<UsageCategory, number>>;
}

export interface ConversationApplicationPort {
  prompt(text: string, images?: readonly ImageContent[]): Promise<void>;
  promptWithImages(
    text: string,
    images: readonly ImageContent[],
    displayText?: string,
  ): Promise<void>;
  abort(): void;
  reset(): void;
  save(): void;
  snapshot(): ConversationSnapshot;
  compact(): Promise<{ readonly before: number; readonly after: number }>;
  discardPendingToolCall(): readonly unknown[];
  estimateTokens(): number;
  contextUsage(
    tools?: readonly { readonly name: string; readonly result: string }[],
  ): ContextUsageSnapshot;
  toolResult(
    owner: "session" | "agent",
    ownerId: string | undefined,
    toolCallId: string,
  ): string | undefined;
  resolveImage(
    ref: ImageRef,
  ): { readonly data: string; readonly mimeType: string } | undefined;
  streamText(
    request: {
      readonly systemPrompt: string;
      readonly userPrompt: string;
      readonly maxTokens?: number;
    },
    onEvent: (event: {
      readonly type: "text" | "error";
      readonly text: string;
    }) => void,
  ): Promise<string>;
}

export interface SessionApplicationPort {
  list(options?: { readonly all?: boolean }): readonly SessionMetadata[];
  currentId(): string | undefined;
  currentMetadata(): SessionMetadata | undefined;
  totalActiveMs(): number;
  setTitleIntent(intent: string): void;
  save(pendingPermission?: PendingPermission): void;
  clearPendingPermission(): void;
  switch(request: SwitchSessionRequest): Promise<SwitchSessionResult>;
  delete(id: string): { readonly success: boolean; readonly error?: string };
  resolve(idOrPrefix: string): SessionMetadata | undefined;
  loadSerialized(id: string): Promise<SerializedSession | undefined>;
}

export interface SettingsApplicationPort {
  get(): PublicRuntimeConfigSnapshot;
  setModel(modelId: string): Promise<void>;
  setProvider(provider: string): Promise<void>;
  setThinking(level: string): Promise<void>;
  setApiKey(apiKey: string): Promise<void>;
  setVisionProvider(provider: string): Promise<void>;
  setVisionModel(model: string): Promise<void>;
  setVisionKey(key: string): Promise<void>;
  clearVision(): Promise<void>;
  providers(): readonly string[];
  models(provider: string): readonly {
    readonly id: string;
    readonly name: string;
  }[];
  visionProviders(): readonly string[];
  visionModels(provider: string): readonly {
    readonly id: string;
    readonly name: string;
  }[];
  modelInfo(provider?: string, modelId?: string): {
    readonly id: string;
    readonly name: string;
    readonly supportsImages: boolean;
  };
}

export interface ProjectApplicationPort {
  setPath(path: string): Promise<{ readonly success: boolean; readonly error?: string }>;
  resolveAtFiles(text: string): AtFileResolution;
  resolveFiles(fileRefs: readonly string[]): AtFileResolution;
  listFiles(prefix: string, maxResults?: number): readonly ProjectFileItem[];
  isImagePath(path: string): boolean;
}

export interface AtFileResolution {
  readonly text: string;
  readonly warnings: readonly {
    readonly type: string;
    readonly path?: string;
    readonly detail?: string;
  }[];
  readonly images: readonly {
    readonly data: string;
    readonly mimeType: string;
  }[];
  readonly reject: boolean;
}

export interface ProjectFileItem {
  readonly path: string;
  readonly name: string;
  readonly isDir: boolean;
  readonly depth: number;
}

export interface MemoryApplicationPort {
  list(scope?: "global" | "project"): readonly MemoryEntry[];
  add(content: string, scope: "global" | "project", sessionId: string): void;
  remove(id: string): void;
  clear(scope?: "global" | "project"): void;
}

export interface SkillSnapshot {
  readonly name: string;
  readonly description: string;
  readonly source: "user" | "project";
  readonly active: boolean;
  readonly toolNames: readonly string[];
}

export interface SkillApplicationPort {
  list(): readonly SkillSnapshot[];
  setEnabled(
    name: string,
    enabled: boolean,
  ): Promise<{ readonly toolNames: readonly string[] }>;
}

export interface DriverSnapshot {
  readonly name: string;
  readonly description: string;
  readonly source: "builtin" | "mcp";
  readonly toolNames: readonly string[];
}

export interface DriverQueryPort {
  list(): readonly DriverSnapshot[];
}

export interface CommandQueryPort {
  list(): readonly CommandManifest[];
  get(name: string): CommandManifest | undefined;
}

export interface PermissionApplicationPort {
  sessionGrants(): readonly string[];
  grantForSession(toolName: string): void;
  persistRule(rule: PermissionRuleConfig): Promise<void>;
  suggestions(toolName: string, args: unknown): readonly LlmSuggestion[];
  prefetchSuggestions(
    toolName: string,
    args: unknown,
    preview: string,
  ): void;
  fuzzy(toolName: string, args?: unknown): {
    readonly toolPattern: string | null;
    readonly argPattern: string | null;
    readonly argDescription: string | null;
  };
}

export interface McpToolSnapshot {
  readonly name: string;
  readonly label: string;
  readonly description: string;
  readonly state: "loaded" | "discoverable";
}

export interface McpServerSnapshot {
  readonly name: string;
  readonly description: string;
  readonly status: MCPServerState["status"];
  readonly error?: string;
  readonly toolCount: number;
  readonly tools: readonly McpToolSnapshot[];
  readonly transport?: string;
  readonly protocolVersion?: string;
  readonly compatibilityMode?: string;
  readonly refreshState?: string;
  readonly refreshError?: string;
}

export interface McpApplicationPort {
  list(): readonly McpServerSnapshot[];
  refresh(): Promise<void>;
  connect(serverName: string): Promise<void>;
  disconnect(serverName: string): Promise<void>;
}

export interface AgentProcessApplicationPort {
  list(): readonly SerializedAgentProcess[];
  get(agentId: string): SerializedAgentProcess | undefined;
  loadPersisted(
    agentIds: readonly string[],
  ): Promise<ReadonlyMap<string, SerializedAgentProcess>>;
  spawn(request: SpawnAgentRequest): Promise<SpawnAgentResult>;
}

export interface EvalApplicationPort {
  readonly agents: AgentProcessApplicationPort;
  currentSessionId(): string | undefined;
  hostId(): string;
  currentProjectPath(): string;
  saveCurrentSession(): void;
  resolveSession(idOrPrefix: string): SessionMetadata | undefined;
  loadSession(id: string): Promise<SerializedSession | undefined>;
  publish(event: Extract<HarnessEvent, { type: "eval:dashboard" }>): void;
  run(sessionId?: string): Promise<void>;
}

export interface ToolApplicationPort {
  deferredNames(): readonly string[];
}

export interface ImageInputApplicationPort {
  readFile(path: string): Promise<ImageContent>;
  readClipboard(): Promise<ImageContent | null>;
  readClipboardNonBlocking(): Promise<ImageContent | null>;
}

export interface HarnessAPI {
  readonly events: ApplicationEventSource;
  readonly conversation: ConversationApplicationPort;
  readonly sessions: SessionApplicationPort;
  readonly settings: SettingsApplicationPort;
  readonly project: ProjectApplicationPort;
  readonly memory: MemoryApplicationPort;
  readonly skills: SkillApplicationPort;
  readonly drivers: DriverQueryPort;
  readonly commands: CommandQueryPort;
  readonly permissions: PermissionApplicationPort;
  readonly mcp: McpApplicationPort;
  readonly agents: AgentProcessApplicationPort;
  readonly eval: EvalApplicationPort;
  readonly tools: ToolApplicationPort;
  readonly images: ImageInputApplicationPort;
}

export type InternalRuntimeConfig = Readonly<RuntimeConfig>;
