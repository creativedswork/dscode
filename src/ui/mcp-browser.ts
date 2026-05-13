import type { AgentTool } from "@mariozechner/pi-agent-core";

import type { DriverRegistry } from "../drivers/registry.js";
import type { ToolRegistry } from "../drivers/tool-registry.js";
import type { MCPServerState } from "../mcp/types.js";
import { c } from "./theme.js";

export interface McpToolViewModel {
  name: string;
  label: string;
  description: string;
  state: "loaded" | "discoverable";
}

export interface McpServerViewModel {
  name: string;
  description: string;
  status: MCPServerState["status"];
  error?: string;
  toolCount: number;
  tools: McpToolViewModel[];
}

function getToolState(name: string, toolRegistry: ToolRegistry): McpToolViewModel["state"] {
  if (!toolRegistry.isDeferred(name)) {
    return "loaded";
  }
  return toolRegistry.getDiscoveredToolNames().has(name) ? "loaded" : "discoverable";
}

function toToolViewModel(tool: AgentTool<any>, toolRegistry: ToolRegistry): McpToolViewModel {
  return {
    name: tool.name,
    label: tool.label ?? tool.name,
    description: tool.description ?? "",
    state: getToolState(tool.name, toolRegistry),
  };
}

export function buildMcpServers(
  states: MCPServerState[],
  driverRegistry: DriverRegistry,
  toolRegistry: ToolRegistry,
): McpServerViewModel[] {
  return states.map((state) => {
    const driver = driverRegistry.get(`mcp_${state.config.name}`);
    const tools = (driver?.tools ?? []).map((tool) => toToolViewModel(tool, toolRegistry));
    return {
      name: state.config.name,
      description: state.config.description ?? "",
      status: state.status,
      error: state.error,
      toolCount: state.toolCount,
      tools,
    };
  });
}

function renderStatus(status: McpServerViewModel["status"]): string {
  switch (status) {
    case "connected":
      return c.green("connected");
    case "connecting":
      return c.yellow("connecting");
    case "error":
      return c.red("error");
    default:
      return c.dim("disconnected");
  }
}

function renderToolState(state: McpToolViewModel["state"]): string {
  return state === "loaded" ? c.green("Loaded") : c.yellow("Discoverable");
}

function trimLine(text: string, max = 72): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

export function renderMcpServerList(servers: McpServerViewModel[], selectedIndex: number): string {
  const lines: string[] = [];
  lines.push(c.cyan.bold(" MCP servers "));
  lines.push(c.dim(" ──────────────────────────────────────────────────"));

  if (servers.length === 0) {
    lines.push(" No MCP servers configured.");
  } else {
    servers.forEach((server, index) => {
      const prefix = index === selectedIndex ? c.cyan(" ▶") : "  ";
      const desc = server.description ? c.dim(` — ${trimLine(server.description, 44)}`) : "";
      lines.push(`${prefix} ${c.bold(server.name)} [${renderStatus(server.status)}] ${c.dim(`(${server.toolCount} tools)`)}${desc}`);
      if (server.status === "error" && server.error) {
        lines.push(c.dim(`    ${trimLine(server.error, 84)}`));
      }
    });
  }

  lines.push(c.dim(" ──────────────────────────────────────────────────"));
  lines.push(c.dim(" ↑↓ navigate  Enter view tools  Esc close"));
  return lines.join("\n");
}

export function renderMcpToolList(server: McpServerViewModel, selectedIndex: number): string {
  const lines: string[] = [];
  lines.push(c.cyan.bold(` ${server.name} tools `));
  lines.push(c.dim(` status: ${server.status} · ${server.toolCount} total`));
  lines.push(c.dim(" ──────────────────────────────────────────────────"));

  if (server.tools.length === 0) {
    lines.push(" No registered tools for this MCP server.");
  } else {
    server.tools.forEach((tool, index) => {
      const prefix = index === selectedIndex ? c.cyan(" ▶") : "  ";
      lines.push(`${prefix} ${tool.label} ${c.dim(`[${renderToolState(tool.state)}]`)}`);
      if (tool.description) {
        lines.push(c.dim(`    ${trimLine(tool.description, 84)}`));
      }
      lines.push(c.dim(`    ${tool.name}`));
    });
  }

  lines.push(c.dim(" ──────────────────────────────────────────────────"));
  lines.push(c.dim(" ↑↓ navigate  Esc back  Enter stay"));
  return lines.join("\n");
}
