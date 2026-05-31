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

// ── MCP ──

export interface McpToolInfo {
  name: string;
  label: string;
  description: string;
  state: "loaded" | "discoverable";
}

export interface McpServerInfo {
  name: string;
  description: string;
  status: "connected" | "connecting" | "error" | "disconnected";
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
}

// ── Conversation messages ──

export interface ConversationMessage {
  role: "user" | "assistant" | "system";
  content: string;
  thinking?: string;
  tools?: ToolCallEntry[];
  images?: (ImageAttachment | ImageRef)[];
}

export interface UIMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  thinking?: string;
  tools?: ToolCallEntry[];
  isStreaming?: boolean;
  images?: (ImageAttachment | ImageRef)[];
}

// ── Permissions ──

export type PermissionDecision = "allow" | "deny" | "ask";

export interface PermissionPrompt {
  toolName: string;
  preview: string;
}

export interface PermOption {
  value: "allow" | "always_allow" | "deny";
  label: string;
  key: string;
}

// ── Wire protocol ──

export type ClientCommand =
  | { type: "chat"; text: string; images?: ImageAttachment[]; clipboardImages?: ImageAttachment[] }
  | { type: "abort" }
  | { type: "permission"; decision: "allow" | "always_allow" | "deny"; persistRule?: boolean }
  | { type: "permission_response"; decision: "allow" | "always_allow" | "deny"; denyReason?: string }
  | { type: "slash"; command: string }
  | { type: "command"; text: string }
  | { type: "config"; action: "set_model"; value: string }
  | { type: "config"; action: "set_thinking"; value: string }
  | { type: "config"; action: "set_key"; value: string }
  | { type: "config"; action: "set_provider"; value: string }
  | { type: "config"; action: "set_vision_provider"; value: string }
  | { type: "config"; action: "set_vision_model"; value: string }
  | { type: "config"; action: "set_vision_key"; value: string }
  | { type: "config"; action: "set_vision_delete" }
  | { type: "config"; action: "set_project_path"; value: string }
  | { type: "session"; action: "list" | "save" | "load" | "delete"; id?: string }
  | { type: "mcp"; action: "list" | "refresh" | "connect" | "disconnect"; serverName?: string }
  | { type: "file_list"; prefix: string }
  | { type: "mcp_app"; action: "rpc"; appId: string; message: object };

export type ServerEvent =
  | { type: "ready"; model: string; config: ConfigData; messages: ConversationMessage[] }
  | { type: "user_message"; text: string; images?: ImageAttachment[] }
  | { type: "assistant_start" }
  | { type: "thinking_delta"; delta: string }
  | { type: "text_delta"; delta: string }
  | { type: "tool_start"; name: string; args: unknown }
  | { type: "tool_end"; name: string; result: string; isError: boolean; images?: ImageAttachment[] }
  | { type: "assistant_end" }
  | { type: "info"; text: string }
  | { type: "error"; text: string }
  | { type: "retry"; info: { attempt: number; maxRetries: number; delayMs: number; error: string; level: "stream" | "turn" } }
  | { type: "permission_prompt"; toolName: string; preview: string }
  | { type: "loader"; state: "show" | "hide"; text?: string }
  | { type: "config"; data: ConfigData }
  | { type: "sessions"; data: SessionInfo[]; currentSessionId?: string }
  | { type: "mcp_state"; servers: McpServerInfo[] }
  | { type: "model"; name: string }
  | { type: "slash_result"; text: string }
  | { type: "mcp_app"; app: McpAppInfo }
  | { type: "clear_conversation" }
  | { type: "file_list_result"; prefix: string; items: FileListItem[] }
  | { type: "processing"; processing: boolean };
