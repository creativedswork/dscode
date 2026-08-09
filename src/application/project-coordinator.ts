import type { RuntimeConfig } from "../config/types.js";
import type { MCPServerConfig } from "../mcp/types.js";

export interface ProjectCoordinatorOptions {
  resolve(path: string): string;
  exists(path: string): boolean;
  prepareRuntime(projectPath: string): Promise<RuntimeConfig>;
  saveCurrentSession(): void;
  reloadMcp(servers: readonly MCPServerConfig[]): Promise<void>;
  updateSessionProject(dataDir: string, projectPath: string): void;
  updateMemoryProject(dataDir: string, projectPath: string): void;
  updateProcessProject(projectPath: string): void;
  updateApplications(projectPath: string): Promise<void>;
  rebindMainSession(projectPath: string): Promise<void>;
  reloadSkills(projectPath: string): void;
  replaceRuntime(config: RuntimeConfig): Promise<void>;
  rebuildPrompt(): void;
  reportError(scope: string, error: unknown): void;
}

export class ProjectCoordinator {
  private switching = false;

  constructor(private readonly options: ProjectCoordinatorOptions) {}

  async switchProject(
    requestedPath: string,
  ): Promise<{ success: boolean; error?: string }> {
    if (this.switching) {
      return { success: false, error: "A project switch is already in progress" };
    }
    const projectPath = this.options.resolve(requestedPath);
    if (!this.options.exists(projectPath)) {
      return {
        success: false,
        error: `Path does not exist: ${projectPath}`,
      };
    }

    this.switching = true;
    try {
      const targetConfig = await this.options.prepareRuntime(projectPath);
      const mcpServers = targetConfig.mcp;

      try {
        await this.options.reloadMcp(mcpServers);
      } catch (error) {
        this.options.reportError("McpReload", error);
        return {
          success: false,
          error: `Failed to load project MCP configuration: ${String(error)}`,
        };
      }

      this.options.saveCurrentSession();
      this.options.updateSessionProject(targetConfig.dataDir, projectPath);
      this.options.updateMemoryProject(targetConfig.dataDir, projectPath);
      this.options.updateProcessProject(projectPath);
      await this.options.updateApplications(projectPath);
      await this.options.rebindMainSession(projectPath);
      this.options.reloadSkills(projectPath);
      await this.options.replaceRuntime({
        ...targetConfig,
        mcp: [...mcpServers],
      });
      this.options.rebuildPrompt();
      return { success: true };
    } catch (error) {
      this.options.reportError("ProjectSwitch", error);
      return { success: false, error: String(error) };
    } finally {
      this.switching = false;
    }
  }
}
