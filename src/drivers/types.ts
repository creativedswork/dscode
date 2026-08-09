import type { AgentTool } from "@earendil-works/pi-agent-core";

export interface Driver {
  name: string;
  description: string;
  tools: AgentTool<any>[];
  source: "builtin" | "mcp";
}

export interface DriverRegistryPort {
  register(driver: Driver): void;
  get(name: string): Driver | undefined;
  listAll(): Driver[];
  getAllTools(): AgentTool<any>[];
  getDriversBySource(source: "builtin" | "mcp"): Driver[];
  unregister(name: string): boolean;
}

export interface ToolCatalogPort {
  initialize(
    skillTool: AgentTool<any>,
    alwaysLoadNames?: Set<string>,
    appOnlyNames?: Set<string>,
  ): void;
  buildToolsForRequest(): AgentTool<any>[];
  buildDeferredToolsHint(): string;
  getDeferredToolNames(): string[];
  getDiscoveredToolNames(): Set<string>;
}

export type ToolExecutionEvent =
  | {
      type: "tool:start";
      executionId?: string;
      toolCallId: string;
      name: string;
      args: unknown;
    }
  | {
      type: "tool:end";
      executionId?: string;
      toolCallId: string;
      name: string;
      result: unknown;
      isError: boolean;
    };
