import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "@earendil-works/pi-ai";
import type { TextContent, ImageContent } from "@earendil-works/pi-ai";

import type {
  MCPClientEvent,
  MCPJsonSchema,
  MCPServerConfig,
  MCPServerState,
  MCPToolContent,
  MCPToolDefinition,
  MCPToolResult,
  ErrorClass,
  MCPTransport,
} from "./types.js";
import { mcpDriverName, mcpToolName } from "./names.js";
import type { ToolUiInfo, McpUiResourceCsp, McpUiResourcePermissions } from "./app/types.js";
import { MCPClient } from "./client.js";
import type { DriverRegistry } from "../drivers/registry.js";
import type { Driver } from "../core/types.js";
import { ImageCache } from "../utils/image-cache.js";
import type { ImagePipeline } from "../drivers/vision/pipeline.js";
import type { AgentToolUpdateCallback } from "@earendil-works/pi-agent-core";

function extractToolResultPreview(result: unknown): string {
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

async function buildToolResultContent(result: unknown): Promise<(TextContent | ImageContent)[]> {
  if (typeof result === "string") {
    return [{ type: "text", text: result.slice(0, 50000) }];
  }

  if (result && typeof result === "object") {
    const obj = result as MCPToolResult;
    if (Array.isArray(obj.content)) {
      const items: (TextContent | ImageContent)[] = [];
      for (const item of obj.content as MCPToolContent[]) {
        if (item.type === "text" && item.text) {
          items.push({ type: "text", text: item.text });
        } else if (item.type === "image" && item.data) {
          try {
            const img: ImageContent = { type: "image", data: item.data, mimeType: item.mimeType ?? "image/png" };
            const cached = await ImageCache.put(img);
            const compressed = ImageCache.getSync(cached);
            if (compressed) {
              items.push(compressed);
            } else {
              items.push(img);
            }
          } catch {
            items.push({ type: "image", data: item.data, mimeType: item.mimeType ?? "image/png" });
          }
        }
      }
      if (items.length > 0) return items;
    }
  }

  return [{ type: "text", text: JSON.stringify(result, null, 2).slice(0, 50000) }];
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

function classifyError(err: Error, transport: MCPTransport, statusCode?: number): ErrorClass {
  const msg = err.message ?? "";

  // ECONNREFUSED, ETIMEDOUT → transient
  if (/ECONNREFUSED|ETIMEDOUT/i.test(msg)) return "transient";

  // HTTP status codes
  if (statusCode !== undefined) {
    if (statusCode === 502 || statusCode === 503 || statusCode === 504) return "transient";
    if (statusCode === 401 || statusCode === 403) return "permanent";
    if (statusCode === 404 || statusCode === 410) return "session_expired";
  }

  // ENOTFOUND / unresolvable host → permanent
  if (/ENOTFOUND/i.test(msg)) return "permanent";

  // Process exit → transient (for stdio)
  if (transport === "stdio" && /exited/i.test(msg)) return "transient";

  // SSE closed unexpectedly → transient
  if (transport === "sse" && /connection closed/i.test(msg)) return "transient";

  // Invalid config → permanent
  if (/invalid|no command|no url/i.test(msg)) return "permanent";

  // Default: treat unknown errors as transient (safer to retry)
  return "transient";
}

export class MCPManager {
  private clients = new Map<string, MCPClient>();
  private states = new Map<string, MCPServerState>();
  private alwaysLoadToolNames = new Set<string>();
  private uiToolMap = new Map<string, ToolUiInfo>();
  private eventListeners = new Set<(event: MCPClientEvent) => void>();
  private driverRegistry?: DriverRegistry;
  public imagePipeline?: ImagePipeline;

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
          names.push(mcpToolName(serverName, def.name));
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

  /**
   * Attempt to reconnect a server whose client connection is dead.
   * Closes the old client, creates a fresh one, and re-registers tools.
   * Returns true on success, false on failure.
   */
  private async reconnectServer(name: string): Promise<boolean> {
    const state = this.states.get(name)!;
    const cfg = this.configs.find((c) => c.name === name);
    if (!cfg) return false;

    // Close and remove dead client
    const oldClient = this.clients.get(name);
    if (oldClient) {
      try { await oldClient.close(); } catch { /* best-effort */ }
      this.clients.delete(name);
    }

    // Unregister stale driver
    if (this.driverRegistry) {
      this.driverRegistry.unregister(mcpDriverName(name));
    }

    state.status = "reconnecting";

    const client = new MCPClient(cfg);
    client.onEvent((event) => this.handleClientEvent(event));
    await client.connect();
    this.clients.set(name, client);

    const tools = await client.listTools();
    this.registerDriver(name, tools);

    state.status = "connected";
    state.error = undefined;
    state.toolCount = tools.length;
    state.negotiatedProtocolVersion = client.getNegotiatedProtocolVersion() ?? undefined;
    state.resolvedTransport = client.getResolvedTransport();
    state.compatibilityMode = client.getCompatibilityMode();
    state.refreshState = "idle";
    state.refreshError = undefined;
    state.lastRefreshAt = Date.now();
    return true;
  }

  private reconnectTimers = new Map<string, NodeJS.Timeout>();

  private scheduleReconnect(name: string, attempt: number): void {
    const state = this.states.get(name);
    if (!state) return;

    // Guard: skip if user explicitly disconnected
    if (state.status === "disconnected") return;

    // Guard: max retries exhausted
    if (attempt >= 10) {
      state.status = "error";
      state.error = "Reconnect attempts exhausted";
      state.refreshState = "error";
      state.refreshError = "Reconnect attempts exhausted";
      this.emit({ type: "tools_refresh_failed", serverName: name, error: "Reconnect attempts exhausted" });
      return;
    }

    state.status = "reconnecting";

    const delay = Math.min(30000, 1000 * Math.pow(2, attempt)) + Math.random() * 500;

    const timer = setTimeout(async () => {
      this.reconnectTimers.delete(name);

      try {
        await this.reconnectServer(name);
        // Success
        state.refreshState = "idle";
        state.refreshError = undefined;
        this.emit({ type: "tools_refreshed", serverName: name, toolCount: state.toolCount });
      } catch (err: any) {
        const cfg = this.configs.find((c) => c.name === name);
        const errorClass = classifyError(err, cfg?.transport ?? "stdio");

        if (errorClass === "permanent" || errorClass === "session_expired") {
          // For session_expired, reset counter and try fresh
          if (errorClass === "session_expired") {
            this.scheduleReconnect(name, 0);
            return;
          }
          state.status = "error";
          state.error = err.message ?? "Unknown error";
          state.refreshState = "error";
          state.refreshError = err.message ?? "Unknown error";
          state.toolCount = 0;
          this.emit({ type: "tools_refresh_failed", serverName: name, error: err.message ?? "Unknown error" });
          return;
        }

        // Transient error: schedule next attempt
        this.scheduleReconnect(name, attempt + 1);
      }
    }, delay);

    this.reconnectTimers.set(name, timer);
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
        // Only attempt reconnect if the server was in a state where
        // we expect connectivity — not if the user explicitly disconnected.
        if (state.status === "connected" || state.status === "error") {
          this.scheduleReconnect(name, 0);
        } else {
          state.status = "error";
          state.error = err.message ?? "Unknown error";
          state.refreshState = "error";
          state.refreshError = err.message ?? "Unknown error";
        }
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

    // Cancel all pending reconnect timers
    for (const timer of this.reconnectTimers.values()) {
      clearTimeout(timer);
    }
    this.reconnectTimers.clear();
  }

  async connectServer(name: string): Promise<void> {
    const existing = this.clients.get(name);
    const state = this.states.get(name)!;

    // Allow reconnection if the server is in error state with a stale client.
    // Otherwise, skip if already connected or connecting.
    if (existing && state.status !== "error") return;
    if (existing && state.status === "error") {
      try { await existing.close(); } catch { /* best-effort */ }
      this.clients.delete(name);
      if (this.driverRegistry) {
        this.driverRegistry.unregister(mcpDriverName(name));
      }
    }

    const cfg = this.configs.find((c) => c.name === name);
    if (!cfg) throw new Error(`MCP server "${name}" not found in config`);

    state.status = "connecting";

    try {
      const client = new MCPClient(cfg);
      client.onEvent((event) => this.handleClientEvent(event));
      await client.connect();
      this.clients.set(name, client);

      const tools = await client.listTools();
      this.registerDriver(name, tools);

      state.status = "connected";
      state.error = undefined;
      state.toolCount = tools.length;
      state.negotiatedProtocolVersion = client.getNegotiatedProtocolVersion() ?? undefined;
      state.resolvedTransport = client.getResolvedTransport();
      state.compatibilityMode = client.getCompatibilityMode();
      state.refreshState = "idle";
      state.refreshError = undefined;
      state.lastRefreshAt = Date.now();
    } catch (err: any) {
      state.status = "error";
      state.error = err.message ?? "Unknown error";
      state.refreshState = "error";
      state.refreshError = err.message ?? "Unknown error";
      state.toolCount = 0;
      throw err;
    }
  }

  async disconnectServer(name: string): Promise<void> {
    const client = this.clients.get(name);
    if (!client) return;

    const state = this.states.get(name)!;

    try {
      await client.close();
    } catch {
      // best-effort close
    }

    this.clients.delete(name);
    if (this.driverRegistry) {
      this.driverRegistry.unregister(mcpDriverName(name));
    }

    state.status = "disconnected";
    state.error = undefined;
    state.toolCount = 0;
    state.refreshState = "idle";
    state.refreshError = undefined;
  }

  private buildAgentTool(serverName: string, def: MCPToolDefinition, client: MCPClient): AgentTool<any> {
    const toolName = mcpToolName(serverName, def.name);
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
      execute: async (_id: string, args: any, signal?: AbortSignal, onUpdate?: AgentToolUpdateCallback) => {
        try {
          const result = await client.callTool(def.name, args, signal) as MCPToolResult;
          const structuredContent = result?.structuredContent;
          const isError = Boolean(result?.isError);

          const hasImages = Array.isArray(result?.content) &&
            result.content.some((c: any) => c.type === "image" && c.data);

          if (hasImages && this.imagePipeline) {
            const rawContent = result.content as MCPToolContent[];
            const textBlocks = rawContent
              .filter((c) => c.type === "text" && c.text)
              .map((c) => ({ type: "text" as const, text: (c as any).text }));
            const imageBlocks = rawContent
              .filter((c) => c.type === "image" && c.data)
              .map((c) => ({ type: "image" as const, data: (c as any).data, mimeType: (c as any).mimeType ?? "image/png" } as ImageContent));

            // Unified image processing via ImagePipeline
            const pipeResult = await this.imagePipeline.process(imageBlocks, "", {
              onProgress: (info: { phase: string; cachedRefs: any[] }) => {
                if (onUpdate && info.cachedRefs.length > 0) {
                  onUpdate({
                    content: [
                      ...textBlocks,
                      { type: "text", text: "\n[Analyzing " + imageBlocks.length + " image(s)...]" },
                    ],
                    details: { server: serverName, tool: def.name, error: isError, structuredContent, mcpResult: result },
                  });
                }
              },
            });

            if (pipeResult.source === "vision" || pipeResult.source === "ocr") {
              const description = pipeResult.enrichedText.replace(/<image_(description|text)>\n?/g, "").replace(/\n?<\/image_(description|text)>/g, "");
              return {
                content: [
                  ...textBlocks,
                  { type: "text", text: "\n[Description:\n" + description + "\n]" },
                ],
                details: { server: serverName, tool: def.name, error: isError, structuredContent, mcpResult: result },
                terminate: false,
              };
            } else {
              return {
                content: [
                  ...textBlocks,
                  { type: "text", text: "\n[Received " + imageBlocks.length + " image(s). Could not process images.]" },
                ],
                details: { server: serverName, tool: def.name, error: isError, structuredContent, mcpResult: result },
                terminate: false,
              };
            }
          }

          const content = await buildToolResultContent(result);
          return { content, details: { server: serverName, tool: def.name, error: isError, structuredContent, mcpResult: result }, terminate: false };
        } catch (err: any) {
          if (err instanceof DOMException && err.name === "AbortError") {
            return { content: [{ type: "text", text: "Tool call aborted by user." }], details: { server: serverName, tool: def.name, error: true }, terminate: true };
          }
          return { content: [{ type: "text", text: `Error: ${err.message}` }], details: { server: serverName, tool: def.name, error: true } };
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
      name: mcpDriverName(serverName),
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
      if (event.type === "disconnected") {
        state.status = "reconnecting";
        this.scheduleReconnect(event.serverName, 0);
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
