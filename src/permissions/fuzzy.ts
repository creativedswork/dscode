/**
 * Derive a fuzzy tool-name pattern.
 *
 * For MCP tools (mcp__<server>__<rest>), returns the server-level glob:
 *   "mcp__playcanvas__create_scene" → "mcp__playcanvas__*"
 *
 * For non-MCP tools (bash, git, read_file, etc.), returns the tool name itself:
 *   "bash" → "bash"
 */
export function deriveFuzzyPattern(toolName: string): string | null {
  if (!toolName) return null;
  const match = toolName.match(/^(mcp__[^_]+(?:_[^_]+)*?)__/);
  if (match) {
    return match[1] + "__*";
  }
  return toolName;
}

/**
 * Derive a fuzzy argPattern regex from tool args.
 *
 * Returns a regex string that matches "similar" args, or null if
 * no meaningful generalization is possible.
 *
 * - bash:    "git status"        → "^\"git"
 * - file tools: {"path":"/a/b"}  → "/a/[^"]*"
 * - other:                        → null
 */
export function deriveFuzzyArgPattern(toolName: string, args: unknown): string | null {
  if (args == null) return null;

  if (toolName === "bash") {
    const cmd = typeof args === "string" ? args : JSON.stringify(args);
    // Extract first word (the base command)
    const firstWord = cmd.match(/^"?(\w+)/);
    if (firstWord) {
      return `^"${firstWord[1]}`;
    }
    return null;
  }

  if (
    toolName === "read_file" ||
    toolName === "write_file" ||
    toolName === "edit" ||
    toolName === "grep" ||
    toolName === "glob" ||
    toolName === "list_files"
  ) {
    const a = args as Record<string, unknown>;
    const path = typeof a.path === "string" ? a.path : null;
    if (!path) return null;
    // Match the directory prefix
    const lastSlash = path.lastIndexOf("/");
    const dir = lastSlash >= 0 ? path.slice(0, lastSlash + 1) : "";
    if (!dir) return null;
    // Escape regex chars in the dir prefix
    const escaped = dir.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return `${escaped}[^"]*`;
  }

  return null;
}

/**
 * Human-readable description of a fuzzy arg pattern for display.
 */
export function describeFuzzyArgPattern(toolName: string, args: unknown): string | null {
  if (toolName === "bash") {
    const cmd = typeof args === "string" ? args : "";
    const firstWord = cmd.match(/^"?(\w+)/);
    return firstWord ? `${firstWord[1]}.*` : null;
  }
  if (
    toolName === "read_file" ||
    toolName === "write_file" ||
    toolName === "edit" ||
    toolName === "grep" ||
    toolName === "glob" ||
    toolName === "list_files"
  ) {
    const a = args as Record<string, unknown>;
    const path = typeof a.path === "string" ? a.path : null;
    if (!path) return null;
    const lastSlash = path.lastIndexOf("/");
    const dir = lastSlash >= 0 ? path.slice(0, lastSlash + 1) : "";
    return dir ? `${dir}*` : null;
  }
  return null;
}
