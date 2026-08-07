// ── Shared UI Data Model ──
// Canonical types consumed by both TUI and Web UI.
// MUST remain pure TypeScript — zero Node.js / server dependencies.

// ── Image ──

export interface ImageAttachment {
  data: string; // base64
  mimeType: string;
}

export interface ImageRef {
  type: "image_ref";
  hash: string;
  mimeType: string;
}

export interface FileAttachment {
  name: string;
  size: number;
  mimeType: string;
  path: string; // absolute filesystem path
}

// ── MCP ──

export interface McpToolInfo {
  name: string;
  label: string;
  description: string;
  state: "loaded" | "discoverable";
}

// ── Skills ──

export interface SkillInfo {
  name: string;
  description: string;
  active: boolean;
  source: "user" | "project";
  toolsCount: number;
}

export interface McpServerInfo {
  name: string;
  description: string;
  status: "connected" | "connecting" | "reconnecting" | "error" | "disconnected";
  error?: string;
  toolCount: number;
  tools: McpToolInfo[];
  transport?: string;
  protocolVersion?: string;
}

export interface McpAppInfo {
  toolName: string;
  appUrl: string;
  resourceUri: string;
}

// ── Context window ──

export interface ContextWindowData {
  total: number;
  used: number;
  free: number;
  categories: {
    system: number;
    rules: number;
    user: number;
    thinking: number;
    readwrite: number;
    edit: number;
    shell: number;
    skill: number;
    mcp: number;
    other: number;
  };
}

// ── Config ──

export interface ConfigData {
  provider: string;
  modelId: string;
  apiKey: string; // masked
  thinkingLevel: string;
  projectPath: string;
  maxTokens: number;
  providers: string[];
  models: { id: string; name: string }[];
  vision?: { provider: string; model: string; key?: string };
  visionProviders: string[];
  visionModels: { id: string; name: string }[];
}

// ── Session ──

export interface SessionInfo {
  id: string;
  title: string;
  updatedAt: number;
  createdAt: number;
  modelProvider: string;
  modelId: string;
  projectPath: string;
  preview: string;
  messageCount: number;
  totalActiveMs: number;
  contentHash: string;
  pendingPermission?: { toolName: string; preview: string; fuzzyPattern?: string | null };
}

// ── File listing ──

export interface FileListItem {
  path: string;
  isDir: boolean;
  name: string;
  depth: number;
}

// ── Tool calls ──

export interface ToolCallEntry {
  name: string;
  args: string;
  result: string;
  isError: boolean;
  images?: ImageAttachment[];
  mcpApp?: McpAppInfo;
  progress?: number;
  progressTotal?: number;
  progressMessage?: string;
}

// ── Conversation messages ──

export type AgentActivityState =
  | "created"
  | "running"
  | "waiting"
  | "stopped"
  | "completed"
  | "failed"
  | "terminated"
  | "killed";

export interface AgentActivityProgress {
  phase?: string;
  current?: number;
  total?: number;
  message?: string;
}

export type AgentToolActivityState =
  | "running"
  | "permission"
  | "completed"
  | "failed";

export interface AgentToolActivity {
  toolCallId: string;
  name: string;
  status: AgentToolActivityState;
  summary?: string;
  startedAt: number;
  endedAt?: number;
  isError?: boolean;
}

export interface AgentPermissionActivity {
  toolName: string;
  preview: string;
  toolCallId?: string;
}

export interface AgentActivity {
  agentId: string;
  executionId?: string;
  parentAgentId?: string;
  parentSessionId: string;
  label?: string;
  application: string;
  attachment: "foreground" | "background";
  state: AgentActivityState;
  input: string;
  output?: string;
  error?: string;
  progress?: AgentActivityProgress;
  tools?: AgentToolActivity[];
  permission?: AgentPermissionActivity;
  createdAt: number;
  startedAt?: number;
  endedAt?: number;
}

export interface ConversationMessage {
  role: "user" | "assistant" | "system" | "agent";
  content: string;
  thinking?: string;
  tools?: ToolCallEntry[];
  images?: ImageAttachment[];
  createdAt?: number;
  agentActivity?: AgentActivity;
}

export interface UIMessage {
  id: string;
  role: "user" | "assistant" | "system" | "agent";
  content: string;
  thinking?: string;
  tools?: ToolCallEntry[];
  agentActivity?: AgentActivity;
  isStreaming?: boolean;
  images?: (ImageAttachment | ImageRef)[];
  createdAt?: number; // epoch ms
  thinkingStartedAt?: number; // epoch ms — first thinking_delta of the current segment; cleared when the segment ends
  thinkingUpdatedAt?: number; // epoch ms — last thinking_delta (stall detection)
  thinkingFinalMs?: number; // frozen elapsed of the last completed thinking segment
}
// ── Permissions ──

export type PermissionDecision = "allow" | "deny" | "ask";

export interface PermissionPrompt {
  toolName: string;
  preview: string;
  agentId?: string;
  toolCallId?: string;
  fuzzyPattern?: string | null;
  fuzzyArgDesc?: string | null;
  llmSuggestions?: { label: string; toolPattern: string | null; argPattern: string | null }[];
}

export interface PermOption {
  value: "allow" | "always_allow" | "always_allow_save" | "deny";
  label: string;
  key: string;
}

// ── Eval Dashboard ──

export type EvalDashboardStage =
  | "prepare"
  | "graph"
  | "oracle"
  | "backtrack"
  | "attribution"
  | "rules"
  | "dashboard";

export interface EvalDashboardEvidenceSummary {
  totalActors: number;
  subagentCount: number;
  fullTranscripts: number;
  summaryTranscripts: number;
  missingTranscripts: number;
  completeness: "complete" | "partial";
  affectedAgentIds: string[];
}

export type EvalDashboardServerEvent =
  | {
      type: "eval_dashboard";
      status: "starting";
      requestedSessionId?: string;
      startedAt: number;
    }
  | {
      type: "eval_dashboard";
      status: "running";
      targetSessionId: string;
      runId: string;
      stage: EvalDashboardStage;
      stageStatus: "running" | "done" | "failed";
      index: number;
      total: number;
      application: string;
      workerAgentId?: string;
      retryCount?: number;
      durationMs?: number;
      message: string;
      startedAt: number;
      actorCount: number;
      stepCount: number;
      evidence: EvalDashboardEvidenceSummary;
    }
  | {
      type: "eval_dashboard";
      status: "completed";
      targetSessionId: string;
      runId: string;
      html: string;
      generatedAt: number;
    }
  | {
      type: "eval_dashboard";
      status: "failed";
      requestedSessionId?: string;
      targetSessionId?: string;
      runId?: string;
      stage?: EvalDashboardStage;
      error: string;
    };

// ── Wire protocol ──

export type ClientCommand =
  | { type: "chat"; text: string; images?: ImageAttachment[]; clipboardImages?: ImageAttachment[]; fileRefs?: string[]; uploadedFiles?: { name: string; content: string }[] }
  | { type: "abort" }
  | { type: "permission"; decision: "allow" | "always_allow" | "always_allow_save" | "deny"; persistRule?: boolean; toolNamePattern?: string; fuzzyMode?: number; sessionGrantPattern?: string }
  | { type: "permission_response"; decision: "allow" | "always_allow" | "always_allow_save" | "deny"; denyReason?: string; toolNamePattern?: string }
  | { type: "slash"; command: string }
  | { type: "command"; text: string }
  | { type: "config"; action: "set_model"; value: string }
  | { type: "config"; action: "set_thinking"; value: string }
  | { type: "config"; action: "set_key"; value: string }
  | { type: "config"; action: "set_provider"; value: string }

  | { type: "skill"; action: "toggle"; name: string }
  | { type: "config"; action: "set_vision_provider"; value: string }
  | { type: "config"; action: "set_vision_model"; value: string }
  | { type: "config"; action: "set_vision_key"; value: string }
  | { type: "config"; action: "set_vision_delete" }
  | { type: "config"; action: "set_project_path"; value: string }
  | { type: "session"; action: "list" | "save" | "load" | "delete"; id?: string }
  | { type: "mcp"; action: "list" | "refresh" | "connect" | "disconnect"; serverName?: string }
  | { type: "file_list"; prefix: string }
  | { type: "mcp_app"; action: "rpc"; appId: string; message: object }
  | { type: "cache"; action: "size" | "clear" }
  | { type: "artifact"; action: "generate" | "update"; context?: string; instruction?: string };

export type ServerEvent =
  | { type: "ready"; model: string; config: ConfigData; messages: ConversationMessage[] }
  | { type: "agent_activity"; activity: AgentActivity }
  | { type: "user_message"; text: string; images?: ImageAttachment[] }
  | { type: "assistant_start" }
  | { type: "thinking_delta"; delta: string }
  | { type: "text_delta"; delta: string }
  | { type: "tool_start"; name: string; args: unknown }
  | { type: "tool_progress"; name: string; progress: number; total?: number; message?: string }
  | { type: "context_window"; total: number; used: number; free: number; categories: { system: number; rules: number; user: number; thinking: number; readwrite: number; edit: number; shell: number; skill: number; mcp: number; other: number } }

  | { type: "tool_end"; name: string; result: string; isError: boolean; images?: ImageAttachment[] }
  | { type: "assistant_end" }
  | { type: "info"; text: string; display: "toast" | "panel" }
  | { type: "warning"; text: string }
  | { type: "error"; text: string }
  | { type: "retry"; info: { attempt: number; maxRetries: number; delayMs: number; error: string; level: "stream" | "turn" } }
  | {
      type: "permission_prompt";
      toolName: string;
      preview: string;
      agentId?: string;
      toolCallId?: string;
      fuzzyPattern?: string | null;
      fuzzyArgDesc?: string | null;
      llmSuggestions?: {
        label: string;
        toolPattern: string | null;
        argPattern: string | null;
      }[];
    }
  | { type: "loader"; state: "show" | "hide"; text?: string }
  | { type: "config"; data: ConfigData }
  | { type: "sessions"; data: SessionInfo[]; currentSessionId?: string; isProcessing?: boolean }
  | { type: "mcp_state"; servers: McpServerInfo[] }

  | { type: "skill_state"; skills: SkillInfo[] }
  | { type: "model"; name: string }
  | { type: "slash_result"; text: string }
  | { type: "mcp_app"; app: McpAppInfo }
  | { type: "clear_conversation" }
  | { type: "file_list_result"; prefix: string; items: FileListItem[] }
  | { type: "processing"; processing: boolean }
  | { type: "session_time"; totalActiveMs: number }
  | { type: "artifact_start" }
  | { type: "artifact_delta"; delta: string }
  | { type: "artifact_end" }
  | EvalDashboardServerEvent
  | { type: "cache_size"; totalBytes: number; fileCount: number; sessionCount: number }
  | { type: "mcp_open_browser" }
