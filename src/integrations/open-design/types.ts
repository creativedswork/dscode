export interface OpenDesignIntegrationConfig {
  readonly enabled: boolean;
  readonly path?: string;
  readonly port: number;
  readonly autoStart: boolean;
}

export interface IntegrationRuntimeOverride {
  readonly id: string;
  readonly enabled?: boolean;
  readonly autoStart?: boolean;
}

export interface IntegrationSettingsSource {
  readonly userSettings: Readonly<Record<string, unknown>>;
  readonly projectSettings: Readonly<Record<string, unknown>>;
  readonly environment: Readonly<Record<string, string | undefined>>;
  readonly projectPath: string;
  readonly legacyEnvironmentFile?: string;
}
