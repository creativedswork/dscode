import { existsSync } from "node:fs";
import { join } from "node:path";

import type {
  Integration,
  IntegrationConfigResolution,
  IntegrationContribution,
  IntegrationDiagnostic,
  IntegrationPrepareContext,
  IntegrationRuntimeOverride,
  IntegrationSettingsSource,
} from "../types.js";
import {
  applyOpenDesignOverride,
  expandOpenDesignPath,
  resolveOpenDesignConfig,
} from "./config.js";
import { createOpenDesignMcpConfig } from "./mcp.js";
import { createOpenDesignServiceSpec, type ReadyOpenDesignConfig } from "./service.js";
import type { OpenDesignIntegrationConfig } from "./types.js";

export class OpenDesignIntegration
implements Integration<OpenDesignIntegrationConfig> {
  readonly id = "open-design";

  resolveConfig(
    source: IntegrationSettingsSource,
    override?: IntegrationRuntimeOverride,
  ): IntegrationConfigResolution<OpenDesignIntegrationConfig> {
    const resolution = resolveOpenDesignConfig(
      source.userSettings as Record<string, unknown>,
      source.projectSettings as Record<string, unknown>,
      source.environment,
      source.legacyEnvironmentFile,
    );
    return {
      config: applyOpenDesignOverride(resolution.config, override),
      diagnostics: resolution.diagnostics.map((message) => ({
        level: resolution.valid ? "warn" : "error",
        message,
      })),
      valid: resolution.valid,
    };
  }

  async prepare(
    context: IntegrationPrepareContext<OpenDesignIntegrationConfig>,
  ): Promise<IntegrationContribution> {
    const config = context.config;
    if (!config.enabled) return {};

    const diagnostics: IntegrationDiagnostic[] = [];
    if (!config.path) {
      diagnostics.push({
        level: "warn",
        message: "Open Design is enabled but integrations.openDesign.path is not configured",
      });
      return { diagnostics };
    }

    const root = expandOpenDesignPath(config.path);
    if (!existsSync(root)) {
      diagnostics.push({
        level: "warn",
        message: `Open Design path does not exist: ${root}`,
      });
      return { diagnostics };
    }

    const daemonCliPath = join(root, "apps", "daemon", "src", "cli.ts");
    if (!existsSync(daemonCliPath)) {
      diagnostics.push({
        level: "warn",
        message: `Open Design daemon CLI does not exist: ${daemonCliPath}`,
      });
      return { diagnostics };
    }

    const readyConfig: ReadyOpenDesignConfig = Object.freeze({
      ...config,
      path: root,
    });
    const mcpServer = createOpenDesignMcpConfig(readyConfig);

    if (readyConfig.autoStart) {
      try {
        const handle = await context.services.ensure(
          createOpenDesignServiceSpec(readyConfig),
          context.signal,
        );
        if (!handle.healthy) {
          diagnostics.push({
            level: "warn",
            message: `Open Design service is ${handle.status}; dscode will continue without blocking startup`,
          });
        }
      } catch (error) {
        if (context.signal?.aborted) throw error;
        diagnostics.push({
          level: "warn",
          message: `Open Design service startup failed: ${this.errorMessage(error)}`,
        });
      }
    }

    return {
      mcpServers: [mcpServer],
      diagnostics,
    };
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
