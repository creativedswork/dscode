import type { AgentApplicationSnapshot } from "../application/types.js";
import type {
  AgentAttachment as AgentInputAttachment,
  AgentProcessRuntime,
  AgentRuntimeSnapshot,
} from "../runtimes/runtime.js";

export type AgentProcessState =
  | "created"
  | "running"
  | "waiting"
  | "stopped"
  | "completed"
  | "failed"
  | "terminated"
  | "killed";

export type AgentAttachment = "foreground" | "background";
export type AgentContextMode = "minimal" | "selected" | "fork";

export type ContextSelectionItem =
  | { type: "message"; messageId: string }
  | { type: "tool_result"; toolCallId: string }
  | { type: "file"; path: string; lineStart?: number; lineEnd?: number }
  | {
      type: "diff";
      scope: "working-tree" | "staged" | "commit";
      ref?: string;
      paths?: string[];
    };

export interface ContextSelection {
  items: ContextSelectionItem[];
  maxBytes?: number;
  overflow?: "error" | "truncate-tail";
}

export interface ContextSelectionSnapshot {
  items: ContextSelectionItem[];
  content: string;
  digest: string;
  bytes: number;
  truncated: boolean;
}

export interface AgentContext {
  agentId: string;
  cwd: string;
  parentSessionId: string;
  depth: number;
  attachment: AgentAttachment;
  allowedTools: readonly string[];
  deniedTools: readonly string[];
  worktree?: {
    repositoryRoot: string;
    path: string;
    branch: string;
    baseline: string;
  };
}

export interface AgentExitResult<T = unknown> {
  agentId: string;
  state: Extract<AgentProcessState, "completed" | "failed" | "terminated" | "killed">;
  output?: string;
  details?: T;
  error?: string;
  startedAt: number;
  endedAt: number;
}

export interface AgentProcess<T = unknown> {
  agentId: string;
  parentAgentId?: string;
  parentSessionId: string;
  application: AgentApplicationSnapshot;
  role: "main" | "subagent";
  state: AgentProcessState;
  attachment: AgentAttachment;
  contextMode: AgentContextMode;
  contextSelection?: ContextSelectionSnapshot;
  context: AgentContext;
  runtime: AgentProcessRuntime<T>;
  createdAt: number;
  startedAt?: number;
  endedAt?: number;
  exit?: AgentExitResult<T>;
  runtimeSnapshot?: AgentRuntimeSnapshot;
}

export interface SerializedAgentProcess {
  version: 1;
  agentId: string;
  parentAgentId?: string;
  parentSessionId: string;
  application: AgentApplicationSnapshot;
  role: "main" | "subagent";
  state: AgentProcessState;
  attachment: AgentAttachment;
  contextMode: AgentContextMode;
  contextSelection?: ContextSelectionSnapshot;
  context: AgentContext;
  createdAt: number;
  startedAt?: number;
  endedAt?: number;
  exit?: AgentExitResult;
  runtimeSnapshot?: AgentRuntimeSnapshot;
}

export type AgentRuntimeFactory = (
  application: AgentApplicationSnapshot,
  context: AgentContext,
  agentId: string,
) => AgentProcessRuntime;

export interface SpawnAgentRequest {
  application: string;
  parentAgentId: string;
  input: {
    prompt: string;
    attachments?: AgentInputAttachment[];
  };
  attachment?: AgentAttachment;
  contextMode?: AgentContextMode;
  contextSelection?: ContextSelection;
  cwd?: string;
  onSpawn?: (agentId: string) => void;
  signal?: AbortSignal;
}

export type { AgentInputAttachment };

export interface SpawnAgentResult {
  agentId: string;
  result?: AgentExitResult;
}
