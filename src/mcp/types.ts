// --- MCP JSON-RPC Protocol Types ---

export interface MCPRequest {
  jsonrpc: "2.0";
  id: number;
  method: string;
  params?: unknown;
}

export interface MCPResponse {
  jsonrpc: "2.0";
  id: number;
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
  transport: "stdio" | "sse";
  command?: string;
  args?: string[];
  cwd?: string;
  url?: string;
  env?: Record<string, string>;
}

// --- MCP Protocol Messages ---

export interface MCPInitializeParams {
  protocolVersion: string;
  capabilities: Record<string, unknown>;
  clientInfo: { name: string; version: string };
}

export interface MCPToolDefinition {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
}

// --- MCP Server Status ---

export type MCPServerStatus = "disconnected" | "connecting" | "connected" | "error";

export interface MCPServerState {
  config: MCPServerConfig;
  status: MCPServerStatus;
  error?: string;
  toolCount: number;
}
