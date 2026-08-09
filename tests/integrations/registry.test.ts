import { describe, expect, it, vi } from "vitest";

import type { RuntimeConfig } from "../../src/config/types.js";
import { IntegrationRegistry } from "../../src/integrations/registry.js";
import type {
  Integration,
  IntegrationConfigResolution,
  IntegrationContribution,
  IntegrationPrepareContext,
  IntegrationSettingsSource,
} from "../../src/integrations/types.js";
import type { ManagedServiceController } from "../../src/services/types.js";

interface TelemetryConfig {
  readonly endpoint: string;
}

class TelemetryIntegration implements Integration<TelemetryConfig> {
  readonly id = "telemetry";
  readonly prepared = vi.fn();

  resolveConfig(
    source: IntegrationSettingsSource,
  ): IntegrationConfigResolution<TelemetryConfig> {
    const integrations = source.projectSettings.integrations as
      | Record<string, unknown>
      | undefined;
    const telemetry = integrations?.telemetry as
      | Record<string, unknown>
      | undefined;
    const endpoint = telemetry?.endpoint;
    return {
      config: Object.freeze({
        endpoint: typeof endpoint === "string" ? endpoint : "",
      }),
      valid: typeof endpoint === "string" && endpoint.length > 0,
      diagnostics: typeof endpoint === "string" && endpoint.length > 0
        ? []
        : [{ level: "error", message: "telemetry.endpoint is required" }],
    };
  }

  async prepare(
    context: IntegrationPrepareContext<TelemetryConfig>,
  ): Promise<IntegrationContribution> {
    this.prepared(context.config.endpoint);
    return {
      mcpServers: [{
        name: "telemetry",
        transport: "streamable-http",
        url: context.config.endpoint,
      }],
    };
  }
}

function services(): ManagedServiceController {
  return {
    ensure: vi.fn(),
    shutdown: vi.fn().mockResolvedValue(undefined),
  };
}

function logger() {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

function source(endpoint: unknown): IntegrationSettingsSource {
  return {
    userSettings: {},
    projectSettings: {
      integrations: {
        telemetry: { endpoint },
      },
    },
    environment: {},
    projectPath: "/project",
  };
}

const runtimeConfig = { mcp: [] } as unknown as RuntimeConfig;

describe("IntegrationRegistry", () => {
  it("keeps a second Integration resolver paired with its typed prepare input", async () => {
    const integration = new TelemetryIntegration();
    const registry = new IntegrationRegistry(services(), logger())
      .register(integration);

    const result = await registry.prepare(
      runtimeConfig,
      source("https://telemetry.example/mcp"),
    );

    expect(integration.prepared).toHaveBeenCalledWith(
      "https://telemetry.example/mcp",
    );
    expect(result.config.mcp).toEqual([
      expect.objectContaining({
        name: "telemetry",
        url: "https://telemetry.example/mcp",
      }),
    ]);
    expect("integrations" in result.config).toBe(false);
  });

  it("does not prepare an invalid owner config", async () => {
    const integration = new TelemetryIntegration();
    const registry = new IntegrationRegistry(services(), logger())
      .register(integration);

    const result = await registry.prepare(runtimeConfig, source(42));

    expect(integration.prepared).not.toHaveBeenCalled();
    expect(result.config.mcp).toEqual([]);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ level: "error" }),
    ]);
  });

  it("rejects duplicate Integration ids", () => {
    const registry = new IntegrationRegistry(services(), logger())
      .register(new TelemetryIntegration());

    expect(() => registry.register(new TelemetryIntegration())).toThrow(
      'Integration "telemetry" is already registered',
    );
  });
});
