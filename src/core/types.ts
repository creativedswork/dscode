import type { AgentTool } from "@earendil-works/pi-agent-core";
import type { MCPServerConfig } from "../mcp/types.js";

// Re-export session data layer types
export type {
  ImageRef,
  VisionMessage,
  SessionMetadata,
  PendingPermission,
  SerializedSession,
  DisplayMessage,
} from "../session/types.js";

// --- Config ---

export type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh";
export type CompactionStrategy = "drop-oldest" | "sliding-window" | "summarize-prefix";

export interface HarnessConfig {
  provider: string;
  modelId: string;
  apiKey?: string;
  thinkingLevel: ThinkingLevel;
  maxTokens: number;
  startupPath: string;
  projectPath: string;
  configDir: string;
  dataDir: string;
  userSkillsDir: string;
  projectSkillsDir: string;
  userCommandsDir: string;
  projectCommandsDir: string;
  context: ContextConfig;
  memory: MemoryConfig;
  permissions: PermissionsConfig;
  skills: string[];
  mcp: MCPServerConfig[];
  appHost: AppHostConfig;
  agentsMdContent?: string;
  atFile?: AtFileConfig;
  vision?: VisionConfig;
  retry: RetryConfig;
}

export interface AtFileConfig {
  maxFiles: number;
  maxFileSize: number;
  maxTotalSize: number;
}


export interface VisionConfig {
  provider: string;
  model: string;
  key?: string;
}

export interface AppHostConfig {
  enabled: boolean;
}

export interface ContextConfig {
  strategy: CompactionStrategy;
  targetUtilization: number;
  minRetainedMessages: number;
}

export interface MemoryConfig {
  enabled: boolean;
  autoExtract: boolean;
  maxGlobalEntries: number;
  maxProjectEntries: number;
}

export interface PermissionsConfig {
  defaultDecision: PermissionDecision;
  rules: PermissionRuleConfig[];
  denyPatterns: string[];
}

export interface PermissionRuleConfig {
  tool: string;
  argPattern?: string;
  decision: PermissionDecision;
  reason?: string;
  priority?: number;
}

// --- Retry ---

export interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  retryOnTimeout: boolean;
  retryOnRateLimit: boolean;
  retryOnServerError: boolean;
}

export interface RetryInfo {
  attempt: number;
  maxRetries: number;
  delayMs: number;
  error: string;
  level: "stream" | "turn";
}

// --- Memory ---

export interface MemoryEntry {
  id: string;
  scope: "global" | "project";
  category: "preference" | "fact" | "instruction";
  content: string;
  source: { sessionId: string; timestamp: number };
}

// --- Permissions ---

export type PermissionDecision = "allow" | "deny" | "ask";

export interface PermissionRule {
  tool: string;
  argPattern?: RegExp;
  decision: PermissionDecision;
  reason?: string;
  priority: number;
}

// --- Drivers (kernel modules, always loaded) ---

export interface Driver {
  name: string;
  description: string;
  tools: AgentTool<any>[];
  source: "builtin" | "mcp";
}

// --- Skills (user-space programs, on-demand activation, SKILL.md) ---

export interface Skill {
  name: string;
  description: string;
  tools: AgentTool<any>[];
  instructions?: string;
  source: "user" | "project";
}

export interface SkillManifest {
  name: string;
  description: string;
  // Tool names this skill is allowed to use (from DriverRegistry).
  // If empty/undefined, defaults to safe read-only tools.
  tools?: string[];
  instructions?: string;
  source: "user" | "project";
  path: string;
}

// --- Commands (user-defined prompt templates, /-triggered, .dscode/commands/<name>.md or <subdir>/<name>.md)

export interface CommandManifest {
  name: string;
  description: string;
  body: string;
  source: "user" | "project";
  path: string;
}

// --- UI ---

export interface PermissionPromptResult {
  decision: "allow" | "deny";
  rememberForSession?: boolean;
  persistRule?: PermissionRuleConfig;
  sessionGrantPattern?: string;
  denyReason?: string;
}

export type PromptUserFn = (
  toolName: string,
  preview: string,
  args: unknown,
) => Promise<PermissionPromptResult>;
