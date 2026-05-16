import type { IncomingMessage, ServerResponse } from "node:http";
import type { AppInstance, McpUiResourceCsp, McpUiResourcePermissions } from "../mcp/app-types.js";

export type { AppInstance, McpUiResourceCsp, McpUiResourcePermissions };

export interface SseClient {
  id: string;
  res: ServerResponse;
}

export interface AppHostConfig {
  enabled: boolean;
  port?: number;
}

export type BridgeHandler = (
  req: IncomingMessage,
  res: ServerResponse,
  appId: string,
) => Promise<void>;

export interface BridgeMessage {
  jsonrpc: "2.0";
  id?: number;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { code: number; message: string };
}
