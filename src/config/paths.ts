import { homedir } from "node:os";
import { join } from "node:path";

export interface ConfigPathEnvironment {
  readonly DSCODE_CONFIG_HOME?: string;
  readonly DSCODE_DATA_HOME?: string;
}

export function configHome(
  env: ConfigPathEnvironment = process.env,
  home: string = homedir(),
): string {
  return env.DSCODE_CONFIG_HOME ?? join(home, ".dscode");
}

export function dataHome(
  env: ConfigPathEnvironment = process.env,
  home: string = homedir(),
): string {
  return env.DSCODE_DATA_HOME ?? join(home, ".dscode");
}

export function userCommandConfigPath(
  env: ConfigPathEnvironment = process.env,
  home: string = homedir(),
): string {
  return join(configHome(env, home), "config.json");
}

export function userSettingsPath(
  env: ConfigPathEnvironment = process.env,
  home: string = homedir(),
): string {
  return join(configHome(env, home), "settings.json");
}

export function projectSettingsPath(projectPath: string): string {
  return join(projectPath, ".dscode", "settings.json");
}

export function userMcpPath(home: string = homedir()): string {
  return join(home, ".mcp.json");
}

export function projectMcpPath(projectPath: string): string {
  return join(projectPath, ".mcp.json");
}
