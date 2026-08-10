import type { AgentTool } from "@earendil-works/pi-agent-core";

import type {
  DriverRegistryPort,
  ToolCatalogPort,
} from "../drivers/types.js";
import type {
  ProcessOptions,
  ProcessResult,
} from "../drivers/vision/types.js";
import type {
  MCPClientEvent,
  MCPServerConfig,
  MCPServerState,
} from "../mcp/types.js";
import type { MCPManager } from "../mcp/manager.js";
import { mcpDriverName } from "../mcp/names.js";
import type { HarnessEvent } from "../core/events.js";
import type { ImageContent } from "@earendil-works/pi-ai";

export interface McpControllerOptions {
  createManager(config: readonly MCPServerConfig[]): MCPManager;
  drivers: DriverRegistryPort;
  tools: ToolCatalogPort;
  makeSkillTool(): AgentTool<any>;
  processImages(
    images: ImageContent[],
    text: string,
    options?: ProcessOptions,
  ): Promise<ProcessResult>;
  applyTools(tools: readonly AgentTool<any>[], deferredHint: string): void;
  refreshCapabilities(): Promise<void>;
  publish(event: HarnessEvent): void;
  bindManager?(manager: MCPManager | undefined): void;
  afterCatalogChange?(): Promise<void>;
}

export class McpController {
  private currentManager: MCPManager | undefined;
  private unsubscribe: (() => void) | undefined;
  private readonly lastProgress = new Map<
    string,
    { progress?: number; total?: number; message?: string }
  >();

  constructor(private readonly options: McpControllerOptions) {}

  get manager(): MCPManager | undefined {
    return this.currentManager;
  }

  states(): readonly MCPServerState[] {
    return this.currentManager?.getStates() ?? [];
  }

  async start(config: readonly MCPServerConfig[]): Promise<void> {
    await this.replace(config, true);
  }

  async reload(config: readonly MCPServerConfig[]): Promise<void> {
    await this.replace(config, false);
  }

  async refresh(): Promise<void> {
    const manager = this.requireManager();
    await manager.registerDrivers(this.options.drivers);
    await this.rebuildCatalog(manager);
  }

  async refreshCatalog(): Promise<void> {
    if (this.currentManager) {
      await this.rebuildCatalog(this.currentManager);
      return;
    }
    this.options.tools.initialize(this.options.makeSkillTool());
    this.options.applyTools(
      this.options.tools.buildToolsForRequest(),
      this.options.tools.buildDeferredToolsHint(),
    );
    await this.options.refreshCapabilities();
    await this.options.afterCatalogChange?.();
  }

  async connect(serverName: string): Promise<void> {
    const manager = this.requireManager();
    await manager.connectServer(serverName);
    await this.refresh();
  }

  async disconnect(serverName: string): Promise<void> {
    const manager = this.requireManager();
    await manager.disconnectServer(serverName);
    await this.refresh();
  }

  async shutdown(): Promise<void> {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    const manager = this.currentManager;
    this.currentManager = undefined;
    this.options.bindManager?.(undefined);
    if (manager) await manager.shutdown();
  }

  private async replace(
    config: readonly MCPServerConfig[],
    announce: boolean,
  ): Promise<void> {
    const previousManager = this.currentManager;
    const previousUnsubscribe = this.unsubscribe;
    const previousDrivers = this.options.drivers
      .getDriversBySource("mcp")
      .map((driver) => ({ ...driver, tools: [...driver.tools] }));

    if (config.length === 0) {
      this.unsubscribe = undefined;
      this.currentManager = undefined;
      previousUnsubscribe?.();
      this.removeMcpDrivers();
      this.options.bindManager?.(undefined);
      if (previousManager) await previousManager.shutdown();
      this.options.tools.initialize(this.options.makeSkillTool());
      this.options.applyTools(
        this.options.tools.buildToolsForRequest(),
        this.options.tools.buildDeferredToolsHint(),
      );
      await this.options.refreshCapabilities();
      this.publishState();
      return;
    }

    if (announce) {
      this.options.publish({
        type: "ui:info",
        text: `Connecting ${config.length} MCP server(s)...`,
      });
    }
    const manager = this.options.createManager(config);
    manager.processImages = (images, text, options) =>
      this.options.processImages(images, text, options);
    try {
      await manager.initialize();
      await manager.registerDrivers(this.options.drivers);
      const nextNames = new Set(
        config.map((server) => mcpDriverName(server.name)),
      );
      for (const driver of previousDrivers) {
        if (!nextNames.has(driver.name)) {
          this.options.drivers.unregister(driver.name);
        }
      }
      this.currentManager = manager;
      this.unsubscribe = manager.onEvent((event) => this.handleEvent(event));
      this.options.bindManager?.(manager);
      await this.rebuildCatalog(manager);
    } catch (error) {
      this.removeMcpDrivers();
      for (const driver of previousDrivers) {
        this.options.drivers.register(driver);
      }
      this.currentManager = previousManager;
      this.unsubscribe = previousUnsubscribe;
      this.options.bindManager?.(previousManager);
      await manager.shutdown();
      throw error;
    }
    previousUnsubscribe?.();
    if (previousManager) await previousManager.shutdown();

    if (announce) {
      const states = manager.getStates();
      const connected = states.filter((state) => state.status === "connected")
        .length;
      this.options.publish({
        type: "ui:info",
        text: `MCP: ${connected}/${config.length} connected`,
      });
      for (const failed of states.filter((state) => state.status === "error")) {
        this.options.publish({
          type: "ui:info",
          text: `MCP '${failed.config.name}' failed: ${failed.error ?? "unknown"}`,
        });
      }
    }
  }

  private async rebuildCatalog(manager: MCPManager): Promise<void> {
    this.options.tools.initialize(
      this.options.makeSkillTool(),
      manager.getAlwaysLoadToolNames(),
      new Set(manager.getAppOnlyToolNames()),
    );
    this.options.applyTools(
      this.options.tools.buildToolsForRequest(),
      this.options.tools.buildDeferredToolsHint(),
    );
    await this.options.refreshCapabilities();
    await this.options.afterCatalogChange?.();
    this.publishState();
  }

  private removeMcpDrivers(): void {
    for (const driver of this.options.drivers.getDriversBySource("mcp")) {
      this.options.drivers.unregister(driver.name);
    }
  }

  private publishState(): void {
    this.options.publish({
      type: "mcp:state",
      servers: this.states(),
    });
  }

  private handleEvent(event: MCPClientEvent): void {
    switch (event.type) {
      case "progress": {
        const key = `${event.serverName}:${event.params.progressToken}`;
        this.lastProgress.set(key, {
          progress: event.params.progress,
          total: event.params.total,
          message: event.params.message,
        });
        if (event.toolName) {
          this.options.publish({
            type: "mcp:tool:progress",
            toolName: `mcp__${event.serverName}__${event.toolName}`,
            serverName: event.serverName,
            progress: event.params.progress,
            total: event.params.total,
            message: event.params.message,
          });
        }
        return;
      }
      case "message": {
        const level = (event.params.level ?? "info").toLowerCase();
        const prefix = `MCP ${event.serverName}`;
        const text = this.stringify(event.params.data);
        const label = event.params.logger ? `${event.params.logger}: ` : "";
        if (level === "error") {
          this.options.publish({
            type: "ui:error",
            text: `${prefix}: ${label}${text}`,
          });
        } else if (level === "warning" || level === "warn") {
          this.options.publish({
            type: "ui:info",
            text: `${prefix} warning: ${label}${text}`,
          });
        } else {
          this.options.publish({
            type: "ui:info",
            text: `${prefix}: ${label}${text}`,
          });
        }
        return;
      }
      case "tools_list_changed":
        this.options.publish({
          type: "ui:info",
          text: `MCP ${event.serverName}: refreshing tool list...`,
        });
        return;
      case "tools_refreshed":
        this.publishState();
        return;
      case "tools_refresh_failed":
        this.options.publish({
          type: "ui:error",
          text: `MCP ${event.serverName}: tool refresh failed: ${event.error}`,
        });
        return;
      case "resources_list_changed":
        this.options.publish({
          type: "ui:info",
          text: `MCP ${event.serverName}: resources updated`,
        });
        return;
      case "cancelled":
        this.options.publish({
          type: "ui:info",
          text: `MCP ${event.serverName}: request cancelled${
            event.params.reason ? ` (${event.params.reason})` : ""
          }`,
        });
        return;
      default:
        return;
    }
  }

  private requireManager(): MCPManager {
    if (!this.currentManager) throw new Error("No MCP servers configured");
    return this.currentManager;
  }

  private stringify(data: unknown): string {
    if (typeof data === "string") return data;
    try {
      return JSON.stringify(data);
    } catch {
      return String(data);
    }
  }
}
