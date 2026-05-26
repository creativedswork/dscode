// ── Client → Server Commands ──

export interface ImageAttachment {
  data: string; // base64
  mimeType: string;
}

export type ClientCommand =
  | { type: "chat"; text: string; images?: ImageAttachment[] }
  | { type: "abort" }
  | { type: "permission"; decision: "allow" | "always_allow" | "deny"; persistRule?: boolean }
  | { type: "slash"; command: string }
  | { type: "config"; action: "set_model"; value: string }
  | { type: "config"; action: "set_thinking"; value: string }
  | { type: "config"; action: "set_key"; value: string }
  | { type: "session"; action: "list" | "save" | "load" | "delete"; id?: string }
  | { type: "mcp"; action: "list" | "refresh" };

// ── Server → Client Events ──

export interface SessionInfo {
  id: string;
  title: string;
  updatedAt: number;
  messageCount: number;
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

export interface McpToolInfo {
  name: string;
  label: string;
  description: string;
  state: "loaded" | "discoverable";
}

export interface ConfigData {
  provider: string;
  modelId: string;
  apiKey: string; // masked
  thinkingLevel: string;
  projectPath: string;
  maxTokens: number;
}

export interface McpAppInfo {
  toolName: string;
  appUrl: string;
  resourceUri: string;
}

export type ServerEvent =
  | { type: "ready"; model: string; config: ConfigData; messages: ConversationMessage[] }
  | { type: "user_message"; text: string }
  | { type: "assistant_start" }
  | { type: "thinking_delta"; delta: string }
  | { type: "text_delta"; delta: string }
  | { type: "tool_start"; name: string; args: unknown }
  | { type: "tool_end"; name: string; result: string; isError: boolean }
  | { type: "assistant_end" }
  | { type: "info"; text: string }
  | { type: "error"; text: string }
  | { type: "permission_prompt"; toolName: string; preview: string }
  | { type: "loader"; state: "show" | "hide"; text?: string }
  | { type: "config"; data: ConfigData }
  | { type: "sessions"; data: SessionInfo[] }
  | { type: "mcp_state"; servers: McpServerInfo[] }
  | { type: "model"; name: string }
  | { type: "slash_result"; text: string }
  | { type: "mcp_app"; app: McpAppInfo }
  | { type: "clear_conversation" };

export interface ConversationMessage {
  role: "user" | "assistant" | "system";
  content: string;
  thinking?: string;
  tools?: ToolCallEntry[];
}

export interface ToolCallEntry {
  name: string;
  args: string;
  result: string;
  isError: boolean;
  mcpApp?: McpAppInfo;
}
