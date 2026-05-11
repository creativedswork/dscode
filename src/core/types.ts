import type { AgentTool } from "@mariozechner/pi-agent-core";
import type { MCPServerConfig } from "../mcp/types.js";

// --- Config ---

export type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh";
export type CompactionStrategy = "drop-oldest" | "sliding-window" | "summarize-prefix";

export interface HarnessConfig {
  provider: string;
  modelId: string;
  apiKey?: string;
  thinkingLevel: ThinkingLevel;
  maxTokens: number;
  projectPath: string;
  configDir: string;
  dataDir: string;
  userSkillsDir: string;
  projectSkillsDir: string;
  context: ContextConfig;
  memory: MemoryConfig;
  permissions: PermissionsConfig;
  skills: string[];
  mcp: MCPServerConfig[];
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

// --- UI ---

export type PromptUserFn = (toolName: string, preview: string) => Promise<{
  decision: "allow" | "deny";
  rememberForSession: boolean;
}>;
