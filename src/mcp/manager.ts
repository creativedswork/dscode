import type { AgentTool } from "@mariozechner/pi-agent-core";
import { Type } from "@mariozechner/pi-ai";

import type {
  MCPClientEvent,
  MCPJsonSchema,
  MCPServerConfig,
  MCPServerState,
  MCPToolContent,
  MCPToolDefinition,
  MCPToolResult,
} from "./types.js";
import type { ToolUiInfo, McpUiResourceCsp, McpUiResourcePermissions } from "./app/types.js";
import { MCPClient } from "./client.js";
import type { DriverRegistry } from "../drivers/registry.js";
import type { Driver } from "../core/types.js";

function extractToolResultText(result: unknown): string {
  if (typeof result === "string") return result;

  if (result && typeof result === "object") {
    const obj = result as MCPToolResult;
    if (Array.isArray(obj.content)) {
      const parts: string[] = [];
      const nonText: string[] = [];

      for (const item of obj.content as MCPToolContent[]) {
        if (item.type === "text" && item.text) {
          parts.push(item.text);
        } else if (item.type === "image") {
          nonText.push(`[Image: ${item.mimeType ?? "unknown"}]`);
        } else if (item.type === "audio") {
          nonText.push(`[Audio: ${item.mimeType ?? "unknown"}]`);
        } else if (item.type === "resource") {
          nonText.push(`[Resource: ${item.resource?.uri ?? "unknown"}]`);
        } else if (item.type === "resource_link") {
          nonText.push(`[Resource Link: ${item.uri}]`);
        }
      }

      if (nonText.length > 0) {
        parts.push(`\nAlso received: ${nonText.join(", ")}`);
      }

      return parts.length > 0 ? parts.join("\n") : JSON.stringify(obj.content);
    }
  }

  return JSON.stringify(result, null, 2);
}

function convertJsonSchema(inputSchema: MCPJsonSchema): any {
  return convertSchemaNode(inputSchema, "root");
}

function convertSchemaOptions(schema: Record<string, unknown>, description?: string): Record<string, unknown> {
  const options: Record<string, unknown> = {};
  if (description) {
    options.description = description;
  }
  if (schema.default !== undefined) {
    options.default = schema.default;
  }
  return options;
}

function normalizeSchemaVariants(value: unknown): MCPJsonSchema[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is MCPJsonSchema => Boolean(item) && typeof item === "object" && !Array.isArray(item));
}

function convertUnionSchema(variants: MCPJsonSchema[], description?: string): any {
  if (variants.length === 0) {
    return Type.Any(description ? { description } : undefined);
  }
  if (variants.length === 1) {
    return convertSchemaNode(variants[0], "union");
  }
  return Type.Union(variants.map((variant, index) => convertSchemaNode(variant, `union.${index}`)), description ? { description } : undefined);
}

function convertSchemaNode(schema: MCPJsonSchema | undefined, key: string): any {
  if (!schema || typeof schema !== "object") {
    return Type.Any();
  }

  const typed = schema as Record<string, unknown>;
  const description = typeof typed.description === "string" ? typed.description : undefined;
  const options = convertSchemaOptions(typed, description);
  const enumValues = Array.isArray(typed.enum) ? typed.enum.filter((value) => ["string", "number", "boolean"].includes(typeof value)) : undefined;
  const anyOf = normalizeSchemaVariants(typed.anyOf);
  const oneOf = normalizeSchemaVariants(typed.oneOf);

  if (enumValues && enumValues.length > 0) {
    return Type.Union(enumValues.map((value) => Type.Literal(value as string | number | boolean)), options);
  }
  if (anyOf.length > 0) {
    return convertUnionSchema(anyOf, description);
  }
  if (oneOf.length > 0) {
    return convertUnionSchema(oneOf, description);
  }
  if (Array.isArray(typed.type)) {
    const variants = typed.type
      .filter((value): value is string => typeof value === "string")
      .map((value) => convertSchemaNode({ ...typed, type: value }, `${key}.${value}`));
    if (variants.length === 0) {
      return Type.Any(options);
    }
    if (variants.length === 1) {
      return variants[0];
    }
    return Type.Union(variants, options);
  }

  switch (typed.type) {
    case "number":
    case "integer":
      return Type.Number(options);
    case "boolean":
      return Type.Boolean(options);
    case "null":
      return Type.Null(options);
    case "array": {
      const items = typed.items && typeof typed.items === "object" && !Array.isArray(typed.items)
        ? convertSchemaNode(typed.items as MCPJsonSchema, `${key}.item`)
        : Type.Any();
      return Type.Array(items, options);
    }
    case "object": {
      const props = typed.properties && typeof typed.properties === "object" && !Array.isArray(typed.properties)
        ? typed.properties as Record<string, MCPJsonSchema>
        : {};
      const required = Array.isArray(typed.required) ? new Set(typed.required.filter((value): value is string => typeof value === "string")) : new Set<string>();
      const schemaProps: Record<string, any> = {};
      for (const [name, prop] of Object.entries(props)) {
        const node = convertSchemaNode(prop, name);
        schemaProps[name] = required.has(name) ? node : Type.Optional(node);
      }
      const objectSchema = Type.Object(schemaProps, options) as any;
      const additionalProperties = typed.additionalProperties;
      if (additionalProperties === true) {
        objectSchema.additionalProperties = true;
      } else if (additionalProperties && typeof additionalProperties === "object" && !Array.isArray(additionalProperties)) {
        objectSchema.additionalProperties = convertSchemaNode(additionalProperties as MCPJsonSchema, `${key}.additionalProperties`);
      }
      return objectSchema;
    }
    case "string":
      return Type.String(options);
    default: {
      const props = typed.properties;
      if (props && typeof props === "object" && !Array.isArray(props)) {
        return convertSchemaNode({ ...typed, type: "object" }, key);
      }
      return Type.Any(options);
    }
  }
}

function normalizeHtmlMimeType(mimeType: string | undefined): string {
  if (!mimeType) return "";
  return mimeType
    .split(";")
    .map((part) => part.trim())
    .sort()
    .join(";");
}

export class MCPManager {
  private clients = new Map<string, MCPClient>();
  private states = new Map<string, MCPServerState>();
  private alwaysLoadToolNames = new Set<string>();
  private uiToolMap = new Map<string, ToolUiInfo>();
  private eventListeners = new Set<(event: MCPClientEvent) => void>();
  private driverRegistry?: DriverRegistry;

  constructor(private configs: MCPServerConfig[]) {
    for (const cfg of configs) {
      this.states.set(cfg.name, {
        config: cfg,
        status: "disconnected",
        toolCount: 0,
        refreshState: "idle",
      });
    }
  }

  onEvent(listener: (event: MCPClientEvent) => void): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  getStates(): MCPServerState[] {
    return Array.from(this.states.values());
  }

  getState(name: string): MCPServerState | undefined {
    return this.states.get(name);
  }

  getAlwaysLoadToolNames(): Set<string> {
    return this.alwaysLoadToolNames;
  }

  getAppOnlyToolNames(): string[] {
    const names: string[] = [];
    for (const [serverName, client] of this.clients) {
      for (const def of client.getAllToolDefs()) {
        const visibility = def._meta?.ui?.visibility;
        if (visibility && visibility.length === 1 && visibility[0] === "app") {
          names.push(`mcp_${serverName}_${def.name}`);
        }
      }
    }
    return names;
  }

  getUiToolMap(): Map<string, ToolUiInfo> {
    return this.uiToolMap;
  }

  getClient(name: string): MCPClient | undefined {
    return this.clients.get(name);
  }

  async fetchUiResource(
    serverName: string,
    resourceUri: string,
  ): Promise<{ html: string; csp?: McpUiResourceCsp; permissions?: McpUiResourcePermissions }> {
    const client = this.clients.get(serverName);
    if (!client) throw new Error(`Server ${serverName} not connected`);

    const result = await client.readResource(resourceUri);
    const contents = result?.contents;
    if (!contents || contents.length === 0) {
      throw new Error(`Empty resource: ${resourceUri}`);
    }

    const content = contents[0];
    const mimeType = normalizeHtmlMimeType(content.mimeType);
    if (!mimeType.includes("text/html") || !mimeType.includes("profile=mcp-app")) {
      throw new Error(`Unsupported MIME type for UI resource: ${content.mimeType}`);
    }

    const html = content.blob
      ? Buffer.from(content.blob, "base64").toString("utf-8")
      : content.text ?? "";

    const uiMeta = (content._meta as any)?.ui ?? (result as any)?._meta?.ui ?? {};
    return {
      html,
      csp: uiMeta.csp,
      permissions: uiMeta.permissions,
    };
  }

  async initialize(): Promise<void> {
    const results = await Promise.allSettled(
      this.configs.map(async (cfg) => {
        const client = new MCPClient(cfg);
        client.onEvent((event) => this.handleClientEvent(event));
        await client.connect();
        this.clients.set(cfg.name, client);
        this.states.set(cfg.name, {
          config: cfg,
          status: "connected",
          toolCount: 0,
          negotiatedProtocolVersion: client.getNegotiatedProtocolVersion() ?? undefined,
          resolvedTransport: client.getResolvedTransport(),
          compatibilityMode: client.getCompatibilityMode(),
          refreshState: "idle",
        });
      }),
    );

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const cfg = this.configs[i];
      if (result.status === "rejected") {
        this.states.set(cfg.name, {
          config: cfg,
          status: "error",
          error: result.reason?.message ?? "Unknown error",
          toolCount: 0,
          refreshState: "error",
          refreshError: result.reason?.message ?? "Unknown error",
        });
      }
    }
  }

  async registerDrivers(registry: DriverRegistry): Promise<void> {
    this.driverRegistry = registry;
    for (const [name, client] of this.clients) {
      try {
        const tools = await client.listTools();
        this.registerDriver(name, tools);
        const state = this.states.get(name)!;
        state.toolCount = tools.length;
        state.lastRefreshAt = Date.now();
        state.refreshState = "idle";
        state.refreshError = undefined;
      } catch (err: any) {
        const state = this.states.get(name)!;
        state.status = "error";
        state.error = err.message ?? "Unknown error";
        state.refreshState = "error";
        state.refreshError = err.message ?? "Unknown error";
      }
    }
  }

  async shutdown(): Promise<void> {
    await Promise.allSettled(
      Array.from(this.clients.entries()).map(async ([name, client]) => {
        await client.close();
        this.states.set(name, {
          config: this.states.get(name)!.config,
          status: "disconnected",
          toolCount: 0,
          negotiatedProtocolVersion: this.states.get(name)?.negotiatedProtocolVersion,
          resolvedTransport: this.states.get(name)?.resolvedTransport,
          compatibilityMode: this.states.get(name)?.compatibilityMode,
          refreshState: "idle",
        });
      }),
    );

    this.clients.clear();
  }

  private buildAgentTool(serverName: string, def: MCPToolDefinition, client: MCPClient): AgentTool<any> {
    const toolName = `mcp_${serverName}_${def.name}`;
    if (def.alwaysLoad) {
      this.alwaysLoadToolNames.add(toolName);
    }

    const resourceUri = def._meta?.ui?.resourceUri ?? def._meta?.["ui/resourceUri"];
    if (resourceUri) {
      this.uiToolMap.set(toolName, { resourceUri, toolName: def.name, serverName });
      this.alwaysLoadToolNames.add(toolName);
    }

    return {
      name: toolName,
      label: `${serverName}: ${def.title ?? def.name}`,
      description: def.description ?? "",
      parameters: convertJsonSchema(def.inputSchema),
      execute: async (_id: string, args: any) => {
        try {
          const result = await client.callTool(def.name, args) as MCPToolResult;
          const text = extractToolResultText(result);
          const structuredContent = result?.structuredContent;
          const isError = Boolean(result?.isError);
          return {
            content: [{ type: "text", text: text.slice(0, 50000) }],
            details: {
              server: serverName,
              tool: def.name,
              error: isError,
              structuredContent,
              mcpResult: result,
            },
            terminate: false,
          };
        } catch (err: any) {
          return {
            content: [{ type: "text", text: `Error: ${err.message}` }],
            details: { server: serverName, tool: def.name, error: true },
          };
        }
      },
    };
  }

  private registerDriver(serverName: string, tools: MCPToolDefinition[]): void {
    if (!this.driverRegistry) return;
    const client = this.clients.get(serverName);
    if (!client) return;

    const state = this.states.get(serverName);
    if (state) {
      state.toolCount = tools.length;
    }

    const agentTools = tools.map((t) => this.buildAgentTool(serverName, t, client));
    const description = this.configs.find((c) => c.name === serverName)?.description ?? "";

    const driver: Driver = {
      name: `mcp_${serverName}`,
      description: `MCP: ${description || serverName}`,
      tools: agentTools,
      source: "mcp",
    };

    this.driverRegistry.register(driver);
  }

  private handleClientEvent(event: MCPClientEvent): void {
    const state = this.states.get(event.serverName);
    if (state) {
      if (event.type === "transport") {
        state.resolvedTransport = event.transport;
        state.compatibilityMode = event.compatibilityMode;
      }
      if (event.type === "protocol") {
        state.negotiatedProtocolVersion = event.protocolVersion;
        state.compatibilityMode = event.compatibilityMode;
      }
      if (event.type === "tools_list_changed") {
        state.refreshState = "refreshing";
        void this.refreshTools(event.serverName);
      }
      if (event.type === "resources_list_changed") {
        state.lastRefreshAt = Date.now();
      }
    }

    for (const listener of this.eventListeners) {
      listener(event);
    }
  }

  private async refreshTools(serverName: string): Promise<void> {
    const client = this.clients.get(serverName);
    const state = this.states.get(serverName);
    if (!client || !state) return;

    try {
      const tools = await client.listTools();
      this.registerDriver(serverName, tools);
      state.toolCount = tools.length;
      state.refreshState = "idle";
      state.refreshError = undefined;
      state.lastRefreshAt = Date.now();
      this.emit({ type: "tools_refreshed", serverName, toolCount: tools.length });
    } catch (err: any) {
      const error = err.message ?? "Unknown error";
      state.refreshState = "error";
      state.refreshError = error;
      this.emit({ type: "tools_refresh_failed", serverName, error });
    }
  }

  private emit(event: MCPClientEvent): void {
    for (const listener of this.eventListeners) {
      listener(event);
    }
  }
}
