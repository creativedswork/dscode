import type { RuntimeConfig } from "../config/types.js";
import type { MCPServerConfig } from "../mcp/types.js";

export interface ProjectCoordinatorOptions {
  resolve(path: string): string;
  exists(path: string): boolean;
  currentRuntime(): RuntimeConfig;
  prepareRuntime(projectPath: string): Promise<RuntimeConfig>;
  beginTransition(): void;
  endTransition(): void;
  quiesce(): Promise<void>;
  saveCurrentSession(): void;
  reloadMcp(servers: readonly MCPServerConfig[]): Promise<void>;
  updateSessionProject(dataDir: string, projectPath: string): void;
  updateMemoryProject(dataDir: string, projectPath: string): void;
  updateProcessProject(projectPath: string): void;
  updateApplications(projectPath: string): Promise<void>;
  rebindMainSession(projectPath: string): Promise<void>;
  replaceRuntime(config: RuntimeConfig): Promise<void>;
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
    const rollback: Array<() => void | Promise<void>> = [];
    try {
      this.options.beginTransition();
      rollback.push(() => this.options.endTransition());
      const previous = this.options.currentRuntime();
      await this.options.quiesce();
      this.options.saveCurrentSession();
      rollback.push(async () => {
        await this.options.prepareRuntime(previous.projectPath);
      });
      const targetConfig = await this.options.prepareRuntime(projectPath);
      const mcpServers = targetConfig.mcp;

      rollback.push(() => this.options.reloadMcp(previous.mcp));
      await this.options.reloadMcp(mcpServers);
      rollback.push(() =>
        this.options.updateSessionProject(
          previous.dataDir,
          previous.projectPath,
        )
      );
      this.options.updateSessionProject(targetConfig.dataDir, projectPath);
      rollback.push(() =>
        this.options.updateMemoryProject(
          previous.dataDir,
          previous.projectPath,
        )
      );
      this.options.updateMemoryProject(targetConfig.dataDir, projectPath);
      rollback.push(() =>
        this.options.updateProcessProject(previous.projectPath)
      );
      this.options.updateProcessProject(projectPath);
      rollback.push(() =>
        this.options.updateApplications(previous.projectPath)
      );
      await this.options.updateApplications(projectPath);
      rollback.push(() =>
        this.options.rebindMainSession(previous.projectPath)
      );
      await this.options.rebindMainSession(projectPath);
      await this.options.replaceRuntime({
        ...targetConfig,
        mcp: [...mcpServers],
      });
      rollback.length = 0;
      this.options.endTransition();
      return { success: true };
    } catch (error) {
      for (const compensate of rollback.reverse()) {
        try {
          await compensate();
        } catch (rollbackError) {
          this.options.reportError("ProjectRollback", rollbackError);
        }
      }
      this.options.reportError("ProjectSwitch", error);
      return { success: false, error: String(error) };
    } finally {
      this.switching = false;
    }
  }
}
