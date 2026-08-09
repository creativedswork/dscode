import type { RuntimeConfig } from "../config/types.js";
import type { MCPServerConfig } from "../mcp/types.js";
import type { ManagedServiceController } from "../services/types.js";
import type {
  Integration,
  IntegrationConfigResolution,
  IntegrationContribution,
  IntegrationDiagnostic,
  IntegrationLogger,
  IntegrationRuntimeOverride,
  IntegrationSettingsSource,
  PreparedIntegrations,
} from "./types.js";

interface RegisteredIntegration {
  readonly id: string;
  prepare(
    source: IntegrationSettingsSource,
    services: ManagedServiceController,
    logger: IntegrationLogger,
    override: IntegrationRuntimeOverride | undefined,
    signal: AbortSignal | undefined,
  ): Promise<IntegrationContribution>;
}

function registerTypedIntegration<TConfig>(
  integration: Integration<TConfig>,
): RegisteredIntegration {
  return {
    id: integration.id,
    async prepare(source, services, logger, override, signal) {
      const resolution: IntegrationConfigResolution<TConfig> =
        integration.resolveConfig(source, override);
      const diagnostics = [...(resolution.diagnostics ?? [])];
      if (!resolution.valid) {
        return { diagnostics };
      }
      const contribution = await integration.prepare({
        config: resolution.config,
        services,
        logger,
        signal,
      });
      return {
        ...contribution,
        diagnostics: [
          ...diagnostics,
          ...(contribution.diagnostics ?? []),
        ],
      };
    },
  };
}

export function mergeIntegrationMcpServers(
  base: readonly MCPServerConfig[],
  contributions: readonly MCPServerConfig[],
): { servers: MCPServerConfig[]; conflicts: string[] } {
  const servers = [...base];
  const indices = new Map<string, number>();
  servers.forEach((server, index) => indices.set(server.name, index));
  const conflicts: string[] = [];

  for (const server of contributions) {
    const existingIndex = indices.get(server.name);
    if (existingIndex === undefined) {
      indices.set(server.name, servers.length);
      servers.push(server);
      continue;
    }
    conflicts.push(server.name);
    servers[existingIndex] = server;
  }

  return { servers, conflicts };
}

export class IntegrationRegistry {
  private readonly integrations: RegisteredIntegration[] = [];

  constructor(
    private readonly services: ManagedServiceController,
    private readonly logger: IntegrationLogger,
  ) {}

  register<TConfig>(integration: Integration<TConfig>): this {
    if (this.integrations.some((registered) => registered.id === integration.id)) {
      throw new Error(`Integration "${integration.id}" is already registered`);
    }
    this.integrations.push(registerTypedIntegration(integration));
    return this;
  }

  async prepare(
    config: RuntimeConfig,
    source: IntegrationSettingsSource,
    overrides: readonly IntegrationRuntimeOverride[] = [],
    signal?: AbortSignal,
  ): Promise<PreparedIntegrations> {
    const overrideMap = new Map(overrides.map((override) => [override.id, override]));
    const contributions: IntegrationContribution[] = [];
    const diagnostics: IntegrationDiagnostic[] = [];

    for (const integration of this.integrations) {
      try {
        const contribution = await integration.prepare(
          source,
          this.services,
          this.logger,
          overrideMap.get(integration.id),
          signal,
        );
        contributions.push(contribution);
        diagnostics.push(...(contribution.diagnostics ?? []));
      } catch (error) {
        if (signal?.aborted) throw error;
        diagnostics.push({
          level: "error",
          message: `${integration.id} preparation failed: ${this.errorMessage(error)}`,
        });
      }
    }

    const contributedMcp = contributions.flatMap((item) => [...(item.mcpServers ?? [])]);
    const merged = mergeIntegrationMcpServers(config.mcp, contributedMcp);
    for (const name of merged.conflicts) {
      diagnostics.push({
        level: "warn",
        message: `Integration MCP server "${name}" overrides the persistent definition for this run`,
      });
    }

    for (const diagnostic of diagnostics) {
      this.logger[diagnostic.level]("Integration", diagnostic.message);
    }

    return {
      config: {
        ...config,
        mcp: merged.servers,
      },
      diagnostics: Object.freeze(diagnostics),
    };
  }

  shutdown(): Promise<void> {
    return this.services.shutdown();
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
