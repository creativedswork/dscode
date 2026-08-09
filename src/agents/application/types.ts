export type AgentApplicationSourceKind =
  | "internal"
  | "bundled"
  | "user-claude"
  | "user-dscode"
  | "project-claude"
  | "project-dscode"
  | "managed";

export interface AgentApplicationSource {
  kind: AgentApplicationSourceKind;
  path: string;
  packageVersion?: string;
}

export type AgentFailureCode =
  | "model_unavailable"
  | "model_error"
  | "empty_output";

export interface AgentFallbackSpec {
  handler: string;
  on: AgentFailureCode[];
}

export interface AgentDefinition {
  name: string;
  description?: string;
  systemPrompt: string;
  tools?: string[];
  disallowedTools?: string[];
  model?: string;
  effort?: string | number;
  permissionMode?: "default" | "acceptEdits" | "plan" | "bypassPermissions";
  maxTurns?: number;
  skills?: string[];
  initialPrompt?: string;
  memory?: "user" | "project" | "local";
  background?: boolean;
  isolation?: "worktree";
  color?: string;
  mcpServers?: Record<string, unknown>;
  hooks?: Record<string, unknown>;
  fallback?: AgentFallbackSpec[];
}

export interface AgentApplication extends AgentDefinition {
  description: string;
  source: AgentApplicationSource;
  digest: string;
  registryGeneration: number;
}

export interface AgentApplicationDraft extends Omit<AgentDefinition, "name"> {
  name?: string;
}

export interface AgentApplicationDiagnostic {
  level: "warning" | "error";
  source: AgentApplicationSource;
  message: string;
}

export interface AgentApplicationSummary {
  readonly name: string;
  readonly description: string;
  readonly source: Readonly<AgentApplicationSource>;
}

export type AgentApplicationSnapshot = Readonly<AgentApplication>;
