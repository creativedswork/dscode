// MCP Apps (SEP-1865) types — io.modelcontextprotocol/ui extension

export interface McpUiToolMeta {
  resourceUri?: string;
  visibility?: Array<"model" | "app">;
}

export interface McpUiResourceCsp {
  connectDomains?: string[];
  resourceDomains?: string[];
  frameDomains?: string[];
  baseUriDomains?: string[];
}

export interface McpUiResourcePermissions {
  camera?: {};
  microphone?: {};
  geolocation?: {};
  clipboardWrite?: {};
}

export interface UIResourceMeta {
  csp?: McpUiResourceCsp;
  permissions?: McpUiResourcePermissions;
  domain?: string;
  prefersBorder?: boolean;
}

export interface AppInstance {
  id: string;
  resourceUri: string;
  toolName: string;
  serverName: string;
  html: string;
  csp?: McpUiResourceCsp;
  permissions?: McpUiResourcePermissions;
  localUrl: string;
  createdAt: number;
}

export interface ToolUiInfo {
  resourceUri: string;
  toolName: string;
  serverName: string;
}
