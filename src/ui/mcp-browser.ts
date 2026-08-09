import type { AgentTool } from "@earendil-works/pi-agent-core";
import { truncateToWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";

import type { MCPServerState } from "../mcp/types.js";
import { c } from "./theme.js";

interface DriverViewSource {
  get(name: string): { tools: AgentTool<any>[] } | undefined;
}

interface ToolCatalogViewSource {
  isDeferred(name: string): boolean;
  getDiscoveredToolNames(): ReadonlySet<string>;
}

const MIN_VISIBLE_ROWS = 6;
const MAX_VISIBLE_ROWS = 8;
const PREVIEW_LINES = 4;
const PANEL_WIDTH = 78;
const SHORT_RULE = "────────────────────────────────────────";

export interface McpBrowserState {
  selectedServerIndex: number | null;
  serverSelection: number;
  serverWindowStart: number;
  toolSelection: number;
  toolWindowStart: number;
}

export type McpBrowserAction =
  | { type: "enter" }
  | { type: "escape" }
  | { type: "up" }
  | { type: "down" };

export interface McpBrowserActionResult {
  state: McpBrowserState;
  shouldClose: boolean;
}

export function createInitialMcpBrowserState(): McpBrowserState {
  return {
    selectedServerIndex: null,
    serverSelection: 0,
    serverWindowStart: 0,
    toolSelection: 0,
    toolWindowStart: 0,
  };
}

function clampWindowStart(selection: number, windowStart: number, total: number): number {
  const visibleRows = getMcpVisibleRows(total);
  if (visibleRows <= 0) return 0;
  return Math.max(0, Math.min(windowStart, Math.max(total - visibleRows, 0)));
}

function moveUp(selection: number, windowStart: number, total: number): { selection: number; windowStart: number } {
  const prev = selection;
  const newSelection = Math.max(0, prev - 1);
  const newWindowStart = newSelection < prev ? newSelection : windowStart;
  return { selection: newSelection, windowStart: clampWindowStart(newSelection, newWindowStart, total) };
}

function moveDown(selection: number, windowStart: number, total: number): { selection: number; windowStart: number } {
  const visibleRows = getMcpVisibleRows(total);
  const prev = selection;
  const maxIndex = Math.max(total - 1, 0);
  const newSelection = Math.min(maxIndex, prev + 1);
  let newWindowStart = windowStart;
  if (newSelection > prev && newSelection >= windowStart + visibleRows) {
    newWindowStart = newSelection - visibleRows + 1;
  }
  return { selection: newSelection, windowStart: clampWindowStart(newSelection, newWindowStart, total) };
}

/** Pure reducer for MCP browser keyboard navigation state machine. */
export function reduceMcpBrowserState(
  state: McpBrowserState,
  action: McpBrowserAction,
  serverCount: number,
  toolCount: number,
): McpBrowserActionResult {
  switch (action.type) {
    case "escape": {
      if (state.selectedServerIndex == null) {
        return { state, shouldClose: true };
      }
      return {
        state: {
          ...state,
          selectedServerIndex: null,
          toolSelection: 0,
          toolWindowStart: 0,
        },
        shouldClose: false,
      };
    }
    case "enter": {
      if (state.selectedServerIndex == null) {
        if (serverCount === 0) {
          return { state, shouldClose: true };
        }
        return {
          state: {
            ...state,
            selectedServerIndex: state.serverSelection,
            toolSelection: 0,
            toolWindowStart: 0,
          },
          shouldClose: false,
        };
      }
      return { state, shouldClose: false };
    }
    case "up": {
      if (state.selectedServerIndex == null) {
        const { selection, windowStart } = moveUp(state.serverSelection, state.serverWindowStart, serverCount);
        return { state: { ...state, serverSelection: selection, serverWindowStart: windowStart }, shouldClose: false };
      }
      const { selection, windowStart } = moveUp(state.toolSelection, state.toolWindowStart, toolCount);
      return { state: { ...state, toolSelection: selection, toolWindowStart: windowStart }, shouldClose: false };
    }
    case "down": {
      if (state.selectedServerIndex == null) {
        const { selection, windowStart } = moveDown(state.serverSelection, state.serverWindowStart, serverCount);
        return { state: { ...state, serverSelection: selection, serverWindowStart: windowStart }, shouldClose: false };
      }
      const { selection, windowStart } = moveDown(state.toolSelection, state.toolWindowStart, toolCount);
      return { state: { ...state, toolSelection: selection, toolWindowStart: windowStart }, shouldClose: false };
    }
  }
}

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
  transport?: string;
  protocolVersion?: string;
  compatibilityMode?: string;
  refreshState?: string;
  refreshError?: string;
}

function getToolState(name: string, toolRegistry: ToolCatalogViewSource): McpToolViewModel["state"] {
  if (!toolRegistry.isDeferred(name)) {
    return "loaded";
  }
  return toolRegistry.getDiscoveredToolNames().has(name) ? "loaded" : "discoverable";
}

function toToolViewModel(tool: AgentTool<any>, toolRegistry: ToolCatalogViewSource): McpToolViewModel {
  return {
    name: tool.name,
    label: tool.label ?? tool.name,
    description: tool.description ?? "",
    state: getToolState(tool.name, toolRegistry),
  };
}

export function buildMcpServers(
  states: MCPServerState[],
  driverRegistry: DriverViewSource,
  toolRegistry: ToolCatalogViewSource,
): McpServerViewModel[] {
  return states.map((state) => {
    const driver = driverRegistry.get(`mcp__${state.config.name}`);
    const tools = (driver?.tools ?? []).map((tool) => toToolViewModel(tool, toolRegistry));
    return {
      name: state.config.name,
      description: state.config.description ?? "",
      status: state.status,
      error: state.error,
      toolCount: state.toolCount,
      tools,
      transport: state.resolvedTransport,
      protocolVersion: state.negotiatedProtocolVersion,
      compatibilityMode: state.compatibilityMode,
      refreshState: state.refreshState,
      refreshError: state.refreshError,
    };
  });
}

function renderStatus(status: McpServerViewModel["status"], compatibilityMode?: string): string {
  if (status === "connected") {
    if (compatibilityMode === "legacy-sse") {
      return c.yellow("connected (legacy sse)");
    }
    if (compatibilityMode === "downgraded") {
      return c.yellow("connected (downgraded)");
    }
    return c.green("connected");
  }
  switch (status) {
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
    lines.push(truncateAnsi(`${c.dim("tools:")} ${server.toolCount}  ${c.dim("status:")} ${renderStatus(server.status, server.compatibilityMode)}`, PANEL_WIDTH));
    lines.push(truncateAnsi(`${c.dim("transport:")} ${server.transport ?? "unknown"}  ${c.dim("protocol:")} ${server.protocolVersion ?? "unknown"}`, PANEL_WIDTH));
    if (server.refreshState === "refreshing") {
      lines.push(truncateAnsi(c.yellow("Refreshing tool list..."), PANEL_WIDTH));
    } else if (server.refreshError) {
      lines.push(truncateAnsi(c.red(`Refresh failed: ${server.refreshError}`), PANEL_WIDTH));
    } else {
      lines.push(truncateAnsi(`${c.dim("mode:")} ${server.compatibilityMode ?? "native"}`, PANEL_WIDTH));
    }
    const preview = wrapPreview(c.white(server.description || "No description."), PANEL_WIDTH, PREVIEW_LINES - 1);
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
