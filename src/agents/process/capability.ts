import { isAbsolute, relative, resolve } from "node:path";

import type { AgentContext } from "./types.js";

const PATH_ARGUMENTS: Record<string, string[]> = {
  read_file: ["path"],
  write_file: ["path"],
  overwrite_file: ["path"],
  edit: ["path", "file_path"],
  edit_undo: ["path"],
  list_files: ["path"],
  grep: ["path"],
  glob: ["cwd"],
};

function isWithin(root: string, candidate: string): boolean {
  const rel = relative(root, candidate);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

export function checkAgentCapability(
  context: AgentContext,
  toolName: string,
  args: unknown,
): { block: true; reason: string } | undefined {
  if (!context.allowedTools.includes(toolName)) {
    return { block: true, reason: `Tool ${toolName} is not in this Agent capability set` };
  }
  const pathKeys = PATH_ARGUMENTS[toolName];
  if (!pathKeys) return undefined;
  const record = args && typeof args === "object" ? args as Record<string, unknown> : {};
  for (const key of pathKeys) {
    const value = record[key];
    if (typeof value !== "string" || value === "") continue;
    const candidate = resolve(context.cwd, value);
    if (!isWithin(context.cwd, candidate)) {
      return {
        block: true,
        reason: `Path ${value} is outside Agent cwd ${context.cwd}`,
      };
    }
  }
  return undefined;
}
