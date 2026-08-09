// --- MCP JSON-RPC Protocol Types ---

export type MCPProtocolVersion = "2024-11-05" | "2025-03-26" | "2025-11-25";
export type MCPTransport = "stdio" | "streamable-http" | "sse";
export type MCPCompatibilityMode = "native" | "downgraded" | "legacy-sse";
export type MCPRefreshState = "idle" | "refreshing" | "error";

export const DEFAULT_MCP_PROTOCOL_VERSION: MCPProtocolVersion = "2025-11-25";
export const LEGACY_MCP_PROTOCOL_VERSION: MCPProtocolVersion = "2024-11-05";

export interface MCPRequest {
  jsonrpc: "2.0";
  id: string | number;
  method: string;
  params?: unknown;
}

export interface MCPResponse {
  jsonrpc: "2.0";
  id?: string | number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export interface MCPNotification {
  jsonrpc: "2.0";
  method: string;
  params?: unknown;
}

// --- MCP Server Configuration ---

export interface MCPServerConfig {
  name: string;
  description?: string;
  transport: MCPTransport;
  command?: string;
  args?: string[];
  url?: string;
  env?: Record<string, string>;
  headers?: Record<string, string>;
  preferredProtocolVersion?: MCPProtocolVersion;
  allowLegacySseFallback?: boolean;
  requestTimeoutMs?: number;
  connectTimeoutMs?: number;
}

// --- MCP Protocol Messages ---

export interface MCPImplementationInfo {
  name: string;
  version: string;
  title?: string;
  description?: string;
  websiteUrl?: string;
  icons?: MCPIcon[];
}

export interface MCPInitializeParams {
  protocolVersion: string;
  capabilities: Record<string, unknown>;
  clientInfo: MCPImplementationInfo;
}

export interface MCPInitializeResult {
  protocolVersion: string;
  capabilities?: Record<string, unknown>;
  serverInfo?: MCPImplementationInfo;
  instructions?: string;
}

export interface MCPIcon {
  src: string;
  mimeType?: string;
  sizes?: string[];
  theme?: "light" | "dark";
}

export type MCPJsonSchema = Record<string, unknown>;

export interface MCPToolDefinition {
  name: string;
  title?: string;
  description?: string;
  icons?: MCPIcon[];
  inputSchema: MCPJsonSchema;
  outputSchema?: MCPJsonSchema;
  annotations?: Record<string, unknown>;
  execution?: {
    taskSupport?: "forbidden" | "optional" | "required";
  };
  alwaysLoad?: boolean;
  _meta?: {
    ui?: {
      resourceUri?: string;
      visibility?: Array<"model" | "app">;
    };
    /** @deprecated Use ui.resourceUri */
    "ui/resourceUri"?: string;
    [key: string]: unknown;
  };
}

export interface MCPTextContent {
  type: "text";
  text: string;
  annotations?: Record<string, unknown>;
}

export interface MCPImageContent {
  type: "image";
  data?: string;
  mimeType?: string;
  annotations?: Record<string, unknown>;
}

export interface MCPAudioContent {
  type: "audio";
  data?: string;
  mimeType?: string;
  annotations?: Record<string, unknown>;
}

export interface MCPEmbeddedResource {
  uri: string;
  mimeType?: string;
  text?: string;
  blob?: string;
  annotations?: Record<string, unknown>;
}

export interface MCPEmbeddedResourceContent {
  type: "resource";
  resource: MCPEmbeddedResource;
}

export interface MCPResourceLinkContent {
  type: "resource_link";
  uri: string;
  name?: string;
  description?: string;
  mimeType?: string;
  annotations?: Record<string, unknown>;
}

export type MCPToolContent =
  | MCPTextContent
  | MCPImageContent
  | MCPAudioContent
  | MCPEmbeddedResourceContent
  | MCPResourceLinkContent;

export interface MCPToolResult {
  content?: MCPToolContent[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
  _meta?: Record<string, unknown>;
}

export interface MCPToolsListResult {
  tools: MCPToolDefinition[];
  nextCursor?: string;
}

export interface MCPResourcesReadResult {
  contents?: Array<{
    uri: string;
    mimeType?: string;
    text?: string;
    blob?: string;
    _meta?: Record<string, unknown>;
  }>;
  _meta?: Record<string, unknown>;
}

export interface MCPProgressNotificationParams {
  progressToken: string | number;
  progress: number;
  total?: number;
  message?: string;
}

export interface MCPLoggingMessageNotificationParams {
  level: string;
  logger?: string;
  data?: unknown;
}

export interface MCPCancelledNotificationParams {
  requestId: string | number;
  reason?: string;
}

export type MCPClientEvent =
  | { type: "progress"; serverName: string; params: MCPProgressNotificationParams; toolName?: string }
  | { type: "message"; serverName: string; params: MCPLoggingMessageNotificationParams }
  | { type: "cancelled"; serverName: string; params: MCPCancelledNotificationParams }
  | { type: "tools_list_changed"; serverName: string }
  | { type: "tools_refreshed"; serverName: string; toolCount: number }
  | { type: "tools_refresh_failed"; serverName: string; error: string }
  | { type: "resources_list_changed"; serverName: string }
  | { type: "transport"; serverName: string; transport: MCPTransport; compatibilityMode: MCPCompatibilityMode }
  | { type: "disconnected"; serverName: string; reason: string }
  | { type: "protocol"; serverName: string; protocolVersion: string; compatibilityMode: MCPCompatibilityMode };

// --- MCP Server Status ---

export type MCPServerStatus = "disconnected" | "connecting" | "connected" | "reconnecting" | "error";

export interface MCPServerState {
  config: MCPServerConfig;
  status: MCPServerStatus;
  error?: string;
  toolCount: number;
  negotiatedProtocolVersion?: string;
  resolvedTransport?: MCPTransport;
  compatibilityMode?: MCPCompatibilityMode;
  lastRefreshAt?: number;
  refreshState?: MCPRefreshState;
  refreshError?: string;
}

export type McpStateEvent = {
  type: "mcp:state";
  servers: readonly MCPServerState[];
};

// --- Error Classification ---

export type ErrorClass = "transient" | "session_expired" | "permanent";
