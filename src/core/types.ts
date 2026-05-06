import type { AgentTool } from "@mariozechner/pi-agent-core";

// --- Config ---

export type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh";
export type CompactionStrategy = "drop-oldest" | "sliding-window" | "summarize-prefix";

export interface HarnessConfig {
  provider: string;
  modelId: string;
  thinkingLevel: ThinkingLevel;
  maxTokens: number;
  projectPath: string;
  configDir: string;
  dataDir: string;
  context: ContextConfig;
  memory: MemoryConfig;
  permissions: PermissionsConfig;
  skills: string[];
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

// --- Session ---

export interface SessionMetadata {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  modelProvider: string;
  modelId: string;
  messageCount: number;
}

export interface SerializedSession {
  version: 1;
  metadata: SessionMetadata;
  messages: unknown[];
  compactedPrefix?: string;
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

// --- Skills ---

export interface Skill {
  name: string;
  description: string;
  tools: AgentTool<any>[];
  systemPromptAddition?: string;
}

// --- UI ---

export interface Renderer {
  renderTextDelta(delta: string): void;
  renderThinkingStart(): void;
  renderThinkingDelta(delta: string): void;
  renderThinkingEnd(): void;
  renderToolStart(name: string, args: unknown): void;
  renderToolEnd(name: string, result: unknown, isError: boolean): void;
  renderError(message: string): void;
  renderInfo(message: string): void;
}

export type PromptUserFn = (toolName: string, preview: string) => Promise<{
  decision: "allow" | "deny";
  rememberForSession: boolean;
}>;
