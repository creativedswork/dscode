import type { RuntimeConfig } from "../config/types.js";
import type { MCPServerConfig } from "../mcp/types.js";
import type { ManagedServiceController } from "../services/types.js";
import type { Logger } from "../utils/logger.js";

export type IntegrationLogger = Pick<Logger, "debug" | "info" | "warn" | "error">;

export interface IntegrationRuntimeOverride {
  readonly id: string;
  readonly enabled?: boolean;
  readonly autoStart?: boolean;
}

export interface IntegrationDiagnostic {
  readonly level: "debug" | "info" | "warn" | "error";
  readonly message: string;
}

export interface IntegrationContribution {
  readonly mcpServers?: readonly MCPServerConfig[];
  readonly diagnostics?: readonly IntegrationDiagnostic[];
}

export interface IntegrationSettingsSource {
  readonly userSettings: Readonly<Record<string, unknown>>;
  readonly projectSettings: Readonly<Record<string, unknown>>;
  readonly environment: Readonly<Record<string, string | undefined>>;
  readonly projectPath: string;
  readonly legacyEnvironmentFile?: string;
}

export interface IntegrationConfigResolution<TConfig> {
  readonly config: TConfig;
  readonly diagnostics?: readonly IntegrationDiagnostic[];
  readonly valid: boolean;
}

export interface IntegrationPrepareContext<TConfig> {
  readonly config: Readonly<TConfig>;
  readonly services: ManagedServiceController;
  readonly logger: IntegrationLogger;
  readonly signal?: AbortSignal;
}

export interface Integration<TConfig> {
  readonly id: string;
  resolveConfig(
    source: IntegrationSettingsSource,
    override?: IntegrationRuntimeOverride,
  ): IntegrationConfigResolution<TConfig>;
  prepare(
    context: IntegrationPrepareContext<TConfig>,
  ): Promise<IntegrationContribution>;
}

export interface PreparedIntegrations {
  readonly config: RuntimeConfig;
  readonly diagnostics: readonly IntegrationDiagnostic[];
}
