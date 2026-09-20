import type { RegisteredAgentTool } from "../kernel/tool-effects.js";

export type {
  RegisteredAgentTool,
  ToolCapability,
  ToolEffect,
} from "../kernel/tool-effects.js";

export interface Driver {
  name: string;
  description: string;
  tools: RegisteredAgentTool[];
  source: "builtin" | "mcp";
}

export interface DriverRegistryPort {
  register(driver: Driver): void;
  get(name: string): Driver | undefined;
  listAll(): Driver[];
  getAllTools(): RegisteredAgentTool[];
  getDriversBySource(source: "builtin" | "mcp"): Driver[];
  unregister(name: string): boolean;
}

export interface ToolCatalogPort {
  initialize(
    skillTool: RegisteredAgentTool,
    alwaysLoadNames?: Set<string>,
    appOnlyNames?: Set<string>,
  ): void;
  buildToolsForRequest(): RegisteredAgentTool[];
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
