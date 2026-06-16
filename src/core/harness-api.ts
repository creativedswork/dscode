import type { Agent } from "@mariozechner/pi-agent-core";
import type { ImageContent } from "@mariozechner/pi-ai";
import type { SessionManager } from "../session/manager.js";
import type { ContextManager } from "../context/manager.js";
import type { MemoryManager } from "../memory/manager.js";
import type { DriverRegistry } from "../drivers/registry.js";
import type { ToolRegistry } from "../drivers/tool-registry.js";
import type { SkillManager } from "../skills/manager.js";
import type { PermissionManager } from "../permissions/manager.js";
import type { MCPManager } from "../mcp/manager.js";
import type { HarnessConfig } from "./types.js";
import type { ConfigWatch } from "./config-watch.js";
import type { ImagePipeline } from "../drivers/vision/pipeline.js";
import type { HarnessEventBus } from "./events.js";
import type { Logger } from "../utils/logger.js";

/**
 * Public API surface of Harness, consumed by UI backends and slash commands.
 * Both TuiBackend and WebUiBackend receive this interface.
 */
export interface HarnessAPI {
  readonly agent: Agent;
  readonly sessionManager: SessionManager;
  readonly memoryManager: MemoryManager;
  readonly driverRegistry: DriverRegistry;
  readonly toolRegistry: ToolRegistry;
  readonly skillManager: SkillManager;
  readonly permissionManager: PermissionManager;
  readonly contextManager: ContextManager;
  readonly mcpManager: MCPManager | undefined;
  readonly config: HarnessConfig;
  readonly configStore: ConfigWatch;
  readonly events: HarnessEventBus;
  readonly logger: Logger;
  readonly imagePipeline: ImagePipeline;

  promptWithImages(text: string, images: ImageContent[]): Promise<void>;
  setModel(id: string): void;
  setThinking(level: string): void;
  setProvider(id: string): void;
  updateProjectPath(cwd: string): Promise<{ success: boolean; error?: string }>;
  promptAndSave(text: string, images?: ImageContent[]): Promise<void>;
  saveSessionNow(): void;
  abort(): void;
}
