// ── MCP Naming Convention ──
// Single source of truth for MCP driver/tool name construction.
// Every consumer that builds or parses MCP names MUST use these helpers
// to avoid desync when the naming convention evolves.

export const MCP_PREFIX = "mcp__";

/** Build a driver registry key for an MCP server. */
export function mcpDriverName(serverName: string): string {
  return `${MCP_PREFIX}${serverName}`;
}

/** Build a fully-qualified MCP tool name (agent-facing). */
export function mcpToolName(serverName: string, toolName: string): string {
  return `${MCP_PREFIX}${serverName}__${toolName}`;
}

/** Check whether a tool name belongs to an MCP server. */
export function isMcpToolName(name: string): boolean {
  return name.startsWith(MCP_PREFIX);
}

/**
 * Extract the server-name portion from a fully-qualified MCP tool name.
 * Returns `null` if the name does not start with the MCP prefix.
 *
 * Example: `"mcp__github__search_repos"` → `"mcp__github"`
 */
export function extractMcpServerPrefix(name: string): string | null {
  if (!name.startsWith(MCP_PREFIX)) return null;
  const parts = name.split("__");
  if (parts.length < 2) return null;
  return parts.slice(0, 2).join("__");
}
