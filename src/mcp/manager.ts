import type { AgentTool } from "@mariozechner/pi-agent-core";
import { Type } from "@mariozechner/pi-ai";

import type { MCPServerConfig, MCPServerState, MCPToolDefinition } from "./types.js";
import { MCPClient } from "./client.js";
import type { DriverRegistry } from "../drivers/registry.js";
import type { Driver } from "../core/types.js";

interface MCPContent {
  type: string;
  text?: string;
  data?: string;
  mimeType?: string;
  resource?: { uri: string; mimeType?: string };
}

function extractToolResultText(result: unknown): string {
  if (typeof result === "string") return result;

  if (result && typeof result === "object") {
    const obj = result as any;
    if (Array.isArray(obj.content)) {
      const parts: string[] = [];
      const nonText: string[] = [];

      for (const item of obj.content as MCPContent[]) {
        if (item.type === "text" && item.text) {
          parts.push(item.text);
        } else if (item.type === "image") {
          nonText.push(`[Image: ${item.mimeType ?? "unknown"}]`);
        } else if (item.type === "resource") {
          nonText.push(`[Resource: ${item.resource?.uri ?? "unknown"}]`);
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

function convertJsonSchema(inputSchema: Record<string, unknown>): any {
  const props = (inputSchema as any)?.properties;
  if (!props || typeof props !== "object") {
    return Type.Object({});
  }

  const schemaProps: Record<string, any> = {};
  for (const [name, prop] of Object.entries(props)) {
    const p = prop as any;
    const desc = p.description ?? "";
    switch (p.type) {
      case "number":
      case "integer":
        schemaProps[name] = Type.Number({ description: desc });
        break;
      case "boolean":
        schemaProps[name] = Type.Boolean({ description: desc });
        break;
      case "array":
        schemaProps[name] = Type.Array(Type.Any({ description: desc }));
        break;
      case "object":
        schemaProps[name] = Type.Object({}, { description: desc });
        break;
      default:
        schemaProps[name] = Type.String({ description: desc });
    }
  }

  return Type.Object(schemaProps);
}

export class MCPManager {
  private clients = new Map<string, MCPClient>();
  private states = new Map<string, MCPServerState>();
  private alwaysLoadToolNames = new Set<string>();

  constructor(private configs: MCPServerConfig[]) {
    for (const cfg of configs) {
      this.states.set(cfg.name, {
        config: cfg,
        status: "disconnected",
        toolCount: 0,
      });
    }
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

  async initialize(): Promise<void> {
    const results = await Promise.allSettled(
      this.configs.map(async (cfg) => {
        const client = new MCPClient(cfg);
        await client.connect();
        this.clients.set(cfg.name, client);
        this.states.set(cfg.name, {
          config: cfg,
          status: "connected",
          toolCount: 0,
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
        });
      }
    }
  }


  async registerDrivers(registry: DriverRegistry): Promise<void> {
    for (const [name, client] of this.clients) {
      try {
        const tools = await client.listTools();
        const state = this.states.get(name)!;
        state.toolCount = tools.length;

        const agentTools = tools.map((t) => this.buildAgentTool(name, t, client));
        const description = this.configs.find((c) => c.name === name)?.description ?? "";

        const driver: Driver = {
          name: `mcp_${name}`,
          description: `MCP: ${description || name}`,
          tools: agentTools,
          source: "mcp",
        };

        registry.register(driver);
      } catch (err: any) {
        const state = this.states.get(name)!;
        state.status = "error";
        state.error = err.message ?? "Unknown error";
      }
    }
  }

  async shutdown(): Promise<void> {
    const results = await Promise.allSettled(
      Array.from(this.clients.entries()).map(async ([name, client]) => {
        await client.close();
        this.states.set(name, {
          config: this.states.get(name)!.config,
          status: "disconnected",
          toolCount: 0,
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

    return {
      name: toolName,
      label: `${serverName}: ${def.name}`,
      description: def.description ?? "",
      parameters: convertJsonSchema(def.inputSchema),
      execute: async (_id: string, args: any) => {
        try {
          const result = await client.callTool(def.name, args);
          const text = extractToolResultText(result);
          return {
            content: [{ type: "text", text: text.slice(0, 50000) }],
            details: { server: serverName, tool: def.name },
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
}
