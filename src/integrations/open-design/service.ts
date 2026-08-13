import { existsSync } from "node:fs";
import { join } from "node:path";

import type { OpenDesignIntegrationConfig } from "./types.js";
import type { ManagedServiceCommand, ManagedServiceSpec } from "../../services/types.js";
import { expandOpenDesignPath } from "./config.js";

export type ReadyOpenDesignConfig = Omit<OpenDesignIntegrationConfig, "path"> & {
  readonly path: string;
};

export function resolveOpenDesignCommand(config: ReadyOpenDesignConfig): ManagedServiceCommand {
  const cwd = expandOpenDesignPath(config.path);
  const projectExecutable = join(cwd, "node_modules", ".bin", "od");

  if (existsSync(projectExecutable)) {
    return {
      executable: projectExecutable,
      args: ["--port", String(config.port), "--no-open"],
      cwd,
      env: { OD_PORT: String(config.port) },
    };
  }

  return {
    executable: "pnpm",
    args: [
      "tools-dev",
      "run",
      "web",
      "--",
      "--port",
      String(config.port),
      "--no-open",
    ],
    cwd,
    env: { OD_PORT: String(config.port) },
  };
}

export function createOpenDesignHealthProbe(
  port: number,
  request: typeof fetch = globalThis.fetch,
): (signal: AbortSignal) => Promise<boolean> {
  const url = `http://127.0.0.1:${port}/api/projects`;
  return async (signal) => {
    const response = await request(url, { signal });
    return response.status === 200;
  };
}

export function createOpenDesignServiceSpec(
  config: ReadyOpenDesignConfig,
  request: typeof fetch = globalThis.fetch,
): ManagedServiceSpec {
  return {
    id: "open-design",
    command: resolveOpenDesignCommand(config),
    health: {
      probe: createOpenDesignHealthProbe(config.port, request),
      intervalMs: 500,
      timeoutMs: 30_000,
      preflightTimeoutMs: 2_000,
    },
    restart: {
      maxRapidRestarts: 3,
      rapidRestartWindowMs: 5_000,
    },
    shutdown: {
      graceMs: 3_000,
    },
  };
}
