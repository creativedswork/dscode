import { existsSync } from "node:fs";
import { join } from "node:path";

import type { RuntimeConfig } from "../../config/types.js";
import type { ManagedServiceController } from "../../services/types.js";
import type { Logger } from "../../kernel/logger.js";
import type {
  IntegrationRuntimeOverride,
  IntegrationSettingsSource,
} from "./types.js";
import {
  applyOpenDesignOverride,
  expandOpenDesignPath,
  resolveOpenDesignConfig,
} from "./config.js";
import { createOpenDesignMcpConfig } from "./mcp.js";
import { createOpenDesignServiceSpec, type ReadyOpenDesignConfig } from "./service.js";

export async function prepareOpenDesignRuntime(
  runtime: RuntimeConfig,
  source: IntegrationSettingsSource,
  services: ManagedServiceController,
  logger: Pick<Logger, "debug" | "info" | "warn" | "error">,
  override?: IntegrationRuntimeOverride,
  signal?: AbortSignal,
): Promise<{
  config: RuntimeConfig;
  diagnostics: readonly { level: "warn" | "error"; message: string }[];
}> {
  const resolution = resolveOpenDesignConfig(
    source.userSettings as Record<string, unknown>,
    source.projectSettings as Record<string, unknown>,
    source.environment,
    source.legacyEnvironmentFile,
  );
  const config = applyOpenDesignOverride(resolution.config, override);
  const diagnostics: Array<{ level: "warn" | "error"; message: string }> =
    resolution.diagnostics.map((message) => ({
      level: resolution.valid ? "warn" : "error",
      message,
    }));
  let mcp = [...runtime.mcp];
  let managesService = false;
  if (resolution.valid && config.enabled) {
    if (!config.path) {
      diagnostics.push({
        level: "warn",
        message: "Open Design is enabled but integrations.openDesign.path is not configured",
      });
    } else {
      const root = expandOpenDesignPath(config.path);
      const daemonCliPath = join(root, "apps", "daemon", "src", "cli.ts");
      if (!existsSync(root)) {
        diagnostics.push({
          level: "warn",
          message: `Open Design path does not exist: ${root}`,
        });
      } else if (!existsSync(daemonCliPath)) {
        diagnostics.push({
          level: "warn",
          message: `Open Design daemon CLI does not exist: ${daemonCliPath}`,
        });
      } else {
        const readyConfig: ReadyOpenDesignConfig = Object.freeze({
          ...config,
          path: root,
        });
        const mcpServer = createOpenDesignMcpConfig(readyConfig);
        const existing = mcp.findIndex((server) => server.name === mcpServer.name);
        if (existing >= 0) {
          mcp[existing] = mcpServer;
          diagnostics.push({
            level: "warn",
            message: `Open Design MCP server "${mcpServer.name}" overrides the persistent definition for this run`,
          });
        } else {
          mcp.push(mcpServer);
        }

        if (readyConfig.autoStart) {
          managesService = true;
          try {
            const handle = await services.ensure(
              createOpenDesignServiceSpec(readyConfig),
              signal,
            );
            if (!handle.healthy) {
              diagnostics.push({
                level: "warn",
                message: `Open Design service is ${handle.status}; dscode will continue without blocking startup`,
              });
            }
          } catch (error) {
            if (signal?.aborted) throw error;
            diagnostics.push({
              level: "warn",
              message: `Open Design service startup failed: ${errorMessage(error)}`,
            });
          }
        }
      }
    }
  }
  if (!managesService) {
    await services.shutdown();
  }

  for (const diagnostic of diagnostics) {
    logger[diagnostic.level]("Integration", diagnostic.message);
  }
  return {
    config: { ...runtime, mcp },
    diagnostics: Object.freeze(diagnostics),
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
