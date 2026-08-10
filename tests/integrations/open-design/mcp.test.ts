import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { RuntimeConfig } from "../../../src/config/types.js";
import { prepareOpenDesignRuntime } from "../../../src/integrations/open-design/index.js";
import { createOpenDesignMcpConfig } from "../../../src/integrations/open-design/mcp.js";
import type { OpenDesignIntegrationConfig } from "../../../src/integrations/open-design/types.js";
import type { IntegrationRuntimeOverride } from "../../../src/integrations/open-design/types.js";
import type { ManagedServiceController, ManagedServiceHandle } from "../../../src/services/types.js";

const roots: string[] = [];

function makeOpenDesignRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "open-design-integration-"));
  roots.push(root);
  const cli = join(root, "apps", "daemon", "src", "cli.ts");
  mkdirSync(join(root, "apps", "daemon", "src"), { recursive: true });
  writeFileSync(cli, "// test daemon cli\n");
  return root;
}

function makeConfig(
  mcp: RuntimeConfig["mcp"] = [],
): RuntimeConfig {
  return {
    mcp,
  } as unknown as RuntimeConfig;
}

function makeSource(openDesign: OpenDesignIntegrationConfig) {
  return {
    userSettings: {},
    projectSettings: {
      integrations: { openDesign },
    },
    environment: {},
    projectPath: "/project",
  };
}

function makeLogger() {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

function makeHandle(
  status: ManagedServiceHandle["status"] = "healthy",
  ownership: ManagedServiceHandle["ownership"] = "external",
): ManagedServiceHandle {
  return {
    id: "open-design",
    ownership,
    status,
    healthy: status === "healthy",
    snapshot: vi.fn(),
    stop: vi.fn().mockResolvedValue(undefined),
  } as ManagedServiceHandle;
}

function makeServices(handle = makeHandle()): ManagedServiceController {
  return {
    ensure: vi.fn().mockResolvedValue(handle),
    shutdown: vi.fn().mockResolvedValue(undefined),
  };
}

function prepare(
  services: ManagedServiceController,
  logger = makeLogger(),
): (
  config: RuntimeConfig,
  source: ReturnType<typeof makeSource>,
  overrides?: readonly IntegrationRuntimeOverride[],
) => ReturnType<typeof prepareOpenDesignRuntime> {
  return (config, source, overrides = []) =>
    prepareOpenDesignRuntime(
      config,
      source,
      services,
      logger,
      overrides.find((override) => override.id === "open-design"),
    );
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("Open Design MCP integration", () => {
  it("derives a local absolute MCP server definition", () => {
    const root = makeOpenDesignRoot();

    const server = createOpenDesignMcpConfig({
      enabled: true,
      path: root,
      port: 8123,
      autoStart: true,
    });

    expect(server).toMatchObject({
      name: "open-design",
      transport: "stdio",
      command: "npx",
      args: [
        "tsx",
        join(root, "apps", "daemon", "src", "cli.ts"),
        "mcp",
        "--daemon-url",
        "http://127.0.0.1:8123",
      ],
    });
  });

  it("contributes nothing when the integration is disabled", async () => {
    const services = makeServices();
    const prepareRuntime = prepare(services);

    const prepared = await prepareRuntime(makeConfig(), makeSource({
      enabled: false,
      port: 7456,
      autoStart: true,
    }));

    expect(prepared.config.mcp).toEqual([]);
    expect(services.ensure).not.toHaveBeenCalled();
    expect(services.shutdown).toHaveBeenCalledOnce();
  });

  it("contributes MCP without owning a manually managed daemon", async () => {
    const root = makeOpenDesignRoot();
    const services = makeServices();
    const prepareRuntime = prepare(services);

    const prepared = await prepareRuntime(makeConfig(), makeSource({
      enabled: true,
      path: root,
      port: 7456,
      autoStart: false,
    }));

    expect(prepared.config.mcp.map((server) => server.name)).toEqual(["open-design"]);
    expect(services.ensure).not.toHaveBeenCalled();
    expect(services.shutdown).toHaveBeenCalledOnce();
  });

  it("normalizes the --with-od runtime override into managed startup", async () => {
    const root = makeOpenDesignRoot();
    const services = makeServices(makeHandle("healthy", "owned"));
    const prepareRuntime = prepare(services);

    const prepared = await prepareRuntime(
      makeConfig(),
      makeSource({
        enabled: false,
        path: root,
        port: 7456,
        autoStart: false,
      }),
      [{ id: "open-design", enabled: true, autoStart: true }],
    );

    expect(services.ensure).toHaveBeenCalledTimes(1);
    expect(prepared.config.mcp.map((server) => server.name)).toEqual(["open-design"]);
  });

  it("overrides a persistent open-design entry in memory and preserves files", async () => {
    const root = makeOpenDesignRoot();
    const persistentFile = join(root, ".mcp.json");
    const persistentContents = JSON.stringify({
      mcpServers: {
        "open-design": { command: "old-command" },
        github: { command: "github-command" },
      },
    });
    writeFileSync(persistentFile, persistentContents);
    const persistentOpenDesign = {
      name: "open-design",
      transport: "stdio" as const,
      command: "old-command",
    };
    const github = {
      name: "github",
      transport: "stdio" as const,
      command: "github-command",
    };
    const baseMcp = [persistentOpenDesign, github];
    const logger = makeLogger();
    const prepareRuntime = prepare(makeServices(), logger);

    const prepared = await prepareRuntime(makeConfig(baseMcp), makeSource({
      enabled: true,
      path: root,
      port: 7456,
      autoStart: false,
    }));

    expect(prepared.config.mcp.map((server) => server.name)).toEqual(["open-design", "github"]);
    expect(prepared.config.mcp[0].command).toBe("npx");
    expect(prepared.config.mcp[1]).toBe(github);
    expect(baseMcp[0]).toBe(persistentOpenDesign);
    expect(readFileSync(persistentFile, "utf8")).toBe(persistentContents);
    expect(logger.warn).toHaveBeenCalledWith(
      "Integration",
      expect.stringContaining('overrides the persistent definition'),
    );
  });

  it("keeps startup non-blocking when the managed service is unhealthy", async () => {
    const root = makeOpenDesignRoot();
    const logger = makeLogger();
    const prepareRuntime = prepare(
      makeServices(makeHandle("unhealthy", "owned")),
      logger,
    );

    const prepared = await prepareRuntime(makeConfig(), makeSource({
      enabled: true,
      path: root,
      port: 7456,
      autoStart: true,
    }));

    expect(prepared.config.mcp.map((server) => server.name)).toEqual(["open-design"]);
    expect(prepared.diagnostics.map((item) => item.message).join(" ")).toContain("unhealthy");
  });

  it("reports an invalid repository without dropping unrelated MCP servers", async () => {
    const github = {
      name: "github",
      transport: "stdio" as const,
      command: "github-command",
    };
    const prepareRuntime = prepare(makeServices());

    const prepared = await prepareRuntime(makeConfig([github]), makeSource({
      enabled: true,
      path: "/missing/open-design",
      port: 7456,
      autoStart: true,
    }));

    expect(prepared.config.mcp).toEqual([github]);
    expect(prepared.diagnostics.map((item) => item.message).join(" ")).toContain(
      "path does not exist",
    );
  });

  it("does not prepare an invalid typed configuration", async () => {
    const root = makeOpenDesignRoot();
    const services = makeServices();
    const prepareRuntime = prepare(services);

    const prepared = await prepareRuntime(makeConfig(), {
      ...makeSource({
        enabled: true,
        path: root,
        port: 7456,
        autoStart: true,
      }),
      projectSettings: {
        integrations: {
          openDesign: {
            enabled: true,
            path: root,
            port: 70000,
            autoStart: true,
          },
        },
      },
    });

    expect(services.ensure).not.toHaveBeenCalled();
    expect(prepared.config.mcp).toEqual([]);
    expect(prepared.diagnostics).toEqual([
      expect.objectContaining({ level: "error" }),
    ]);
  });
});
