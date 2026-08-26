import type { AgentApplicationSnapshot } from "../definitions/types.js";
import { isPlanToolAllowed } from "../../kernel/tool-effects.js";
import type { ToolCapability } from "../../kernel/tool-effects.js";
import type { AgentAttachment, AgentContext } from "./types.js";

const MUTATING_TOOLS = new Set([
  "write_file",
  "edit",
  "edit_undo",
  "overwrite_file",
  "bash",
]);

export interface DeriveAgentContextOptions {
  application: AgentApplicationSnapshot;
  parent: AgentContext;
  availableTools: readonly (string | ToolCapability)[];
  attachment: AgentAttachment;
  cwd?: string;
  maxDepth?: number;
}

export function deriveAgentContext(options: DeriveAgentContextOptions): AgentContext {
  const {
    application,
    parent,
    availableTools,
    attachment,
    cwd = parent.cwd,
    maxDepth = 1,
  } = options;
  const depth = parent.depth + 1;
  if (depth > maxDepth) {
    throw new Error(`Agent depth ${depth} exceeds maximum ${maxDepth}`);
  }

  const parentAllowed = new Set(parent.allowedTools);
  const parentDenied = new Set(parent.deniedTools);
  const availableCapabilities = availableTools.map((tool) =>
    typeof tool === "string" ? { name: tool } : tool
  );
  const availableByName = new Map(
    availableCapabilities.map((tool) => [tool.name, tool]),
  );
  const availableNames = availableCapabilities.map((tool) => tool.name);
  const requested = application.tools?.includes("*")
    ? availableNames.filter((tool) => parentAllowed.has(tool))
    : application.tools
    ? application.tools.filter((tool) => parentAllowed.has(tool))
    : availableNames.filter((tool) => parentAllowed.has(tool));
  const denied = new Set([...parentDenied, ...(application.disallowedTools ?? [])]);
  denied.add("spawn_agent");

  if (application.permissionMode === "plan") {
    for (const tool of requested) {
      if (!isPlanToolAllowed(availableByName.get(tool))) denied.add(tool);
    }
  }
  for (const tool of requested) {
    if (availableByName.get(tool)?.audience === "main") denied.add(tool);
  }
  if (attachment === "background" && application.isolation !== "worktree") {
    for (const tool of MUTATING_TOOLS) denied.add(tool);
  }

  const allowedTools = requested.filter((tool) => !denied.has(tool));
  return Object.freeze({
    agentId: "",
    cwd,
    parentSessionId: parent.parentSessionId,
    depth,
    attachment,
    allowedTools: Object.freeze(allowedTools),
    deniedTools: Object.freeze([...denied]),
  });
}

export function createMainAgentContext(
  cwd: string,
  sessionId: string,
  availableTools: readonly string[],
  deniedTools: readonly string[] = [],
): AgentContext {
  const denied = new Set(deniedTools);
  return Object.freeze({
    agentId: "main-pending",
    cwd,
    parentSessionId: sessionId,
    depth: 0,
    attachment: "foreground",
    allowedTools: Object.freeze(availableTools.filter((tool) => !denied.has(tool))),
    deniedTools: Object.freeze([...denied]),
  });
}
