import type { AgentTool } from "@earendil-works/pi-agent-core";

export type ToolEffect =
  | "read"
  | "workspace_write"
  | "process"
  | "network"
  | "external_write"
  | "unknown";

export interface ToolCapability {
  readonly name: string;
  readonly effect?: ToolEffect;
  readonly planOperation?: {
    readonly domain: "plan" | "task";
    readonly sideEffectFree: true;
  };
  readonly audience?: "all" | "main" | "planner";
}

declare module "@earendil-works/pi-agent-core" {
  interface AgentTool {
    effect?: ToolEffect;
    planOperation?: {
      readonly domain: "plan" | "task";
      readonly sideEffectFree: true;
    };
    audience?: "all" | "main" | "planner";
  }
}

export type RegisteredAgentTool = AgentTool<any>;

const TOOL_EFFECTS = new Set<ToolEffect>([
  "read",
  "workspace_write",
  "process",
  "network",
  "external_write",
  "unknown",
]);

export function isToolEffect(value: unknown): value is ToolEffect {
  return typeof value === "string" && TOOL_EFFECTS.has(value as ToolEffect);
}

export function resolveToolEffect(tool: ToolCapability | undefined): ToolEffect {
  return isToolEffect(tool?.effect) ? tool.effect : "unknown";
}

export function isSideEffectFreePlanOperation(
  tool: ToolCapability | undefined,
): boolean {
  return (
    tool?.planOperation?.domain === "plan"
    || tool?.planOperation?.domain === "task"
  ) && tool.planOperation.sideEffectFree === true;
}

export function isPlanToolAllowed(tool: ToolCapability | undefined): boolean {
  return resolveToolEffect(tool) === "read"
    || isSideEffectFreePlanOperation(tool);
}
