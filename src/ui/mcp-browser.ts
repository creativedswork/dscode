import type { AgentTool } from "@mariozechner/pi-agent-core";
import { truncateToWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";

import type { DriverRegistry } from "../drivers/registry.js";
import type { ToolRegistry } from "../drivers/tool-registry.js";
import type { MCPServerState } from "../mcp/types.js";
import { c } from "./theme.js";

const MIN_VISIBLE_ROWS = 6;
const MAX_VISIBLE_ROWS = 8;
const PREVIEW_LINES = 3;
const PANEL_WIDTH = 78;
const SHORT_RULE = "────────────────────────────────────────";

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

function truncateAnsi(text: string, max = PANEL_WIDTH): string {
  return truncateToWidth(text, max, "…", false);
}

function wrapPreview(text: string, width: number, lines: number): string[] {
  const wrapped = wrapTextWithAnsi(text || "", width).slice(0, lines);
  while (wrapped.length < lines) {
    wrapped.push("");
  }
  return wrapped.map((line) => truncateToWidth(line, width, "…", false));
}

export function getMcpVisibleRows(total: number): number {
  if (total <= 0) return 0;
  if (total <= MIN_VISIBLE_ROWS) return total;
  if (total <= MAX_VISIBLE_ROWS) return total;
  return MAX_VISIBLE_ROWS;
}

function getWindow(total: number, start: number, visibleRows: number): { start: number; end: number } {
  if (total <= visibleRows) {
    return { start: 0, end: total };
  }
  const safeStart = Math.max(0, Math.min(start, total - visibleRows));
  return { start: safeStart, end: safeStart + visibleRows };
}

function renderRange(start: number, end: number, total: number): string {
  if (total === 0) return "0 total";
  return `${start + 1}-${end}/${total}`;
}

function padRows(lines: string[], rowCount: number): void {
  while (lines.length < rowCount) {
    lines.push("");
  }
}

function renderListRow(prefix: string, primary: string, suffix?: string): string {
  const suffixText = suffix ? ` ${suffix}` : "";
  return truncateAnsi(`${prefix} ${primary}${suffixText}`, PANEL_WIDTH);
}

function renderListFooter(current: number, total: number, hint: string): string {
  return c.dim(`${current}/${total}  ${hint}`);
}

function renderSelectedLabel(label: string, selected: boolean): string {
  return selected ? c.bgBlue(c.white(label)) : c.gray(label);
}

export function renderMcpServerList(servers: McpServerViewModel[], selectedIndex: number, startIndex: number): string {
  const lines: string[] = [];
  lines.push(c.cyan.bold("Browse MCP server"));

  const visibleRows = getMcpVisibleRows(servers.length);
  const { start, end } = getWindow(servers.length, startIndex, visibleRows || 1);
  lines.push(c.dim(`servers · ${renderRange(start, end, servers.length)}`));
  lines.push(c.dim(SHORT_RULE));

  if (servers.length === 0) {
    lines.push("No MCP servers configured.");
  } else {
    const rowLines = servers.slice(start, end).map((server, offset) => {
      const index = start + offset;
      const selected = index === selectedIndex;
      const prefix = selected ? c.cyan("▶") : c.dim(" ");
      return renderListRow(prefix, renderSelectedLabel(server.name, selected), c.dim(`(${server.toolCount} tools)`));
    });
    padRows(rowLines, visibleRows);
    lines.push(...rowLines);
  }

  lines.push(c.dim(SHORT_RULE));
  if (servers.length > 0) {
    const server = servers[Math.max(0, Math.min(selectedIndex, servers.length - 1))];
    lines.push(truncateAnsi(`${c.dim("tools:")} ${server.toolCount}  ${c.dim("status:")} ${renderStatus(server.status)}`, PANEL_WIDTH));
    const preview = wrapPreview(c.white(server.description || "No description."), PANEL_WIDTH, PREVIEW_LINES - 2);
    lines.push(...preview);
    lines.push(truncateAnsi(server.error ?? c.dim(`Press Enter to browse ${server.name} tools.`), PANEL_WIDTH));
  } else {
    lines.push(...wrapPreview(c.dim("No server selected."), PANEL_WIDTH, PREVIEW_LINES));
  }
  lines.push(renderListFooter(Math.min(selectedIndex + 1, Math.max(servers.length, 1)), servers.length, "↑↓ navigate  Enter browse server  Esc close"));
  return lines.join("\n");
}

export function renderMcpToolList(server: McpServerViewModel, selectedIndex: number, startIndex: number): string {
  const lines: string[] = [];
  lines.push(c.cyan.bold(`${server.name} · tools`));

  const visibleRows = getMcpVisibleRows(server.tools.length);
  const { start, end } = getWindow(server.tools.length, startIndex, visibleRows || 1);
  lines.push(c.dim(`tools · ${renderRange(start, end, server.tools.length)}`));
  lines.push(c.dim(SHORT_RULE));

  if (server.tools.length === 0) {
    lines.push("No registered tools for this MCP server.");
  } else {
    const rowLines = server.tools.slice(start, end).map((tool, offset) => {
      const index = start + offset;
      const selected = index === selectedIndex;
      const prefix = selected ? c.cyan("▶") : c.dim(" ");
      return renderListRow(prefix, renderSelectedLabel(tool.label, selected), c.dim(`[${renderToolState(tool.state)}]`));
    });
    padRows(rowLines, visibleRows);
    lines.push(...rowLines);
  }

  lines.push(c.dim(SHORT_RULE));
  if (server.tools.length > 0) {
    const tool = server.tools[Math.max(0, Math.min(selectedIndex, server.tools.length - 1))];
    const preview = wrapPreview(c.white(tool.description || "No description."), PANEL_WIDTH, PREVIEW_LINES - 1);
    lines.push(...preview);
    lines.push(c.dim(truncateAnsi(tool.name, PANEL_WIDTH)));
  } else {
    lines.push(...wrapPreview(c.dim("No tool selected."), PANEL_WIDTH, PREVIEW_LINES));
  }
  lines.push(renderListFooter(Math.min(selectedIndex + 1, Math.max(server.tools.length, 1)), server.tools.length, "↑↓ navigate  Esc back to servers"));
  return lines.join("\n");
}
