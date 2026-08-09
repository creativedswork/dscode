import { join } from "node:path";

import {
  projectSettingsPath,
  userSettingsPath,
} from "../config/paths.js";
import { SettingsRepository } from "../config/settings-repository.js";
import type { IntegrationSettingsSource } from "./types.js";

export interface IntegrationSettingsSourceOptions {
  readonly projectPath: string;
  readonly environment: Readonly<Record<string, string | undefined>>;
  readonly repository?: SettingsRepository;
}

export function createIntegrationSettingsSource(
  options: IntegrationSettingsSourceOptions,
): IntegrationSettingsSource {
  const repository = options.repository ?? new SettingsRepository();
  const scopes = repository.readScopes(
    userSettingsPath(),
    projectSettingsPath(options.projectPath),
  );
  return Object.freeze({
    userSettings: scopes.user,
    projectSettings: scopes.project,
    environment: Object.freeze({ ...options.environment }),
    projectPath: options.projectPath,
    legacyEnvironmentFile: join(options.projectPath, ".env"),
  });
}
