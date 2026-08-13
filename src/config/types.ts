import type { ContextConfig } from "../context/types.js";
import type { VisionConfig } from "../drivers/vision/types.js";
import type { MCPServerConfig } from "../mcp/types.js";
import type { MemoryConfig } from "../memory/types.js";
import type { RetryConfig, ThinkingLevel } from "../models/types.js";
import type { PermissionsConfig } from "../permissions/types.js";

export type DeepReadonly<T> =
  T extends (...args: never[]) => unknown ? T
  : T extends readonly (infer Item)[] ? readonly DeepReadonly<Item>[]
  : T extends object ? { readonly [Key in keyof T]: DeepReadonly<T[Key]> }
  : T;

export interface AtFileConfig {
  maxFiles: number;
  maxFileSize: number;
  maxTotalSize: number;
  maxImageSize: number;
}

export interface AppHostConfig {
  enabled: boolean;
}

export interface RuntimeConfig {
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
  disabledSkills: string[];
  mcp: MCPServerConfig[];
  appHost: AppHostConfig;
  agents: { enabled: boolean };
  managedAgentsDir?: string;
  agentsMdContent?: string;
  atFile?: AtFileConfig;
  vision?: VisionConfig;
  agentModelAliases?: Partial<Record<"haiku" | "sonnet" | "opus", string>>;
  retry: RetryConfig;
}

export type RuntimeConfigSnapshot = DeepReadonly<RuntimeConfig>;

export interface PublicRuntimeConfigSnapshot {
  readonly provider: string;
  readonly modelId: string;
  readonly apiKey: string;
  readonly thinkingLevel: ThinkingLevel;
  readonly maxTokens: number;
  readonly projectPath: string;
  readonly skills: readonly string[];
  readonly disabledSkills: readonly string[];
  readonly atFile?: Readonly<AtFileConfig>;
  readonly vision?: {
    readonly provider: string;
    readonly model: string;
    readonly key: string;
  };
}

export type ConfigChangeEvent = {
  type: "config:change";
  data: PublicRuntimeConfigSnapshot;
};

/** @deprecated Use RuntimeConfig from the configuration owner. */
export type HarnessConfig = RuntimeConfig;
