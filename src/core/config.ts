import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

import type { HarnessConfig, ThinkingLevel } from "./types.js";
import type { MCPProtocolVersion, MCPServerConfig, MCPTransport } from "../mcp/types.js";
import { DEFAULT_MCP_PROTOCOL_VERSION } from "../mcp/types.js";


function dsConfigHome(): string {
  return process.env.DSCODE_CONFIG_HOME ?? join(homedir(), ".dscode");
}

function dsDataHome(): string {
  return process.env.DSCODE_DATA_HOME ?? join(homedir(), ".dscode");
}

function userConfigPath(): string {
  return join(dsConfigHome(), "config.json");
}

export function userSettingsPath(): string {
  return join(dsConfigHome(), "settings.json");
}

function projectSettingsPath(projectPath: string): string {
  return join(projectPath, ".dscode", "settings.json");
}

function loadJsonSafe(path: string): Record<string, unknown> {
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return {};
  }
}

function saveJsonSafe(path: string, data: Record<string, unknown>): void {
  const dir = resolve(path, "..");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n", "utf8");
}

export function maskApiKey(key: string | undefined): string {
  if (!key || key.length < 12) return "(not set)";
  return key.slice(0, 3) + "****" + key.slice(-4);
}

function loadUserCommandConfig(): Record<string, unknown> {
  return loadJsonSafe(userConfigPath());
}

function loadScopedSettings(settingsPath: string): Record<string, unknown> {
  return loadJsonSafe(settingsPath);
}

export function loadUserSettings(): Record<string, unknown> {
  return loadScopedSettings(userSettingsPath());
}

export function saveUserSettings(partial: Record<string, unknown>): void {
  const path = userSettingsPath();
  const existing = loadUserSettings();
  saveJsonSafe(path, { ...existing, ...partial });
}

export function saveUserConfig(partial: Record<string, unknown>): void {
  const path = userConfigPath();
  const existing = loadUserCommandConfig();
  saveJsonSafe(path, { ...existing, ...partial });
}

export function saveUserProjectCwd(startupPath: string, cwd: string): void {
  saveUserConfig({
    cwd: resolve(cwd),
    cwdProjectPath: resolve(startupPath),
  });
}

function normalizeTransport(rawTransport: unknown, hasCommand: boolean, hasUrl: boolean): MCPTransport {
  if (rawTransport === "stdio" || rawTransport === "sse" || rawTransport === "streamable-http") {
    return rawTransport;
  }
  if (rawTransport === "http") {
    return "streamable-http";
  }
  if (hasUrl && !hasCommand) {
    return "streamable-http";
  }
  return "stdio";
}

function normalizeProtocolVersion(rawVersion: unknown): MCPProtocolVersion {
  if (rawVersion === "2024-11-05" || rawVersion === "2025-03-26" || rawVersion === "2025-11-25") {
    return rawVersion;
  }
  return DEFAULT_MCP_PROTOCOL_VERSION;
}

export function loadConfig(): HarnessConfig {
  const startupPath = resolve(process.env.DSCODE_PROJECT_PATH ?? process.cwd());
  const configDir = dsConfigHome();
  const dataDir = join(dsDataHome(), "data");

  const userConfig = loadUserCommandConfig();
  const userSettings = loadScopedSettings(userSettingsPath());

  let projectPath = startupPath;
  const configuredCwd = userConfig.cwd;
  const configuredCwdProjectPath = userConfig.cwdProjectPath;
  if (
    typeof configuredCwd === "string" &&
    configuredCwd.trim() !== "" &&
    typeof configuredCwdProjectPath === "string" &&
    resolve(configuredCwdProjectPath) === startupPath
  ) {
    const nextProjectPath = resolve(configuredCwd);
    if (existsSync(nextProjectPath)) {
      projectPath = nextProjectPath;
    }
  }

  saveUserProjectCwd(startupPath, projectPath);

  if (projectPath !== process.cwd()) {
    process.chdir(projectPath);
  }

  const projectSettings = loadScopedSettings(projectSettingsPath(projectPath));
  const merged = { ...userSettings, ...projectSettings };

  const provider = (process.env.AGENT_PROVIDER as string) ?? (merged.provider as string) ?? "deepseek";
  const modelId = (process.env.AGENT_MODEL as string) ?? (process.env.DEEPSEEK_MODEL as string) ?? (userConfig.modelId as string) ?? (merged.modelId as string) ?? "deepseek-v4-flash";
  const maxTokens = Number(process.env.DSCODE_MAX_TOKENS) || (merged.maxTokens as number) || 16384;

  // API key: env var > user config (never project config for security)
  const apiKey = process.env.DEEPSEEK_API_KEY ?? (userConfig.apiKey as string | undefined);

  const userPermissionRules = ((userSettings.permissions as any)?.rules as Record<string, unknown>[]) ?? [];
  const projectPermissionRules = ((projectSettings.permissions as any)?.rules as Record<string, unknown>[]) ?? [];
  const userDeny = ((userSettings.permissions as any)?.deny as string[]) ?? [];
  const projectDeny = ((projectSettings.permissions as any)?.deny as string[]) ?? [];
  const denyPatterns = [...new Set([...userDeny, ...projectDeny])];

  const userSkills = ((userSettings.skills as string[]) ?? []);
  const projectSkills = ((projectSettings.skills as string[]) ?? []);
  const skills = [...new Set([...userSkills, ...projectSkills])];

  const userSkillsDir = join(configDir, "skills");
  const projectSkillsDir = join(projectPath, ".dscode", "skills");

  const validThinkingLevels = new Set(["off", "minimal", "low", "medium", "high", "xhigh"]);
  const defaultThinkingLevel: ThinkingLevel = modelId.includes("pro") ? "medium" : "off";
  const rawThinkingLevel = process.env.AGENT_THINKING_LEVEL ?? userConfig.thinkingLevel ?? merged.thinkingLevel;
  const thinkingLevel: ThinkingLevel = rawThinkingLevel !== undefined && validThinkingLevels.has(rawThinkingLevel as string)
    ? (rawThinkingLevel as ThinkingLevel)
    : defaultThinkingLevel;

  // load MCP server configs from both formats:
  // 1) { mcp: { servers: [{name, command, args, cwd, ...}] } }  (legacy array)
  // 2) { mcpServers: { "name": {command, args, cwd, ...} } }    (object with named keys)
  let mcpServersRaw: unknown[] = [];

  const mcpConfig = (merged.mcp as Record<string, unknown>) ?? {};
  if (Array.isArray(mcpConfig.servers)) {
    mcpServersRaw.push(...(mcpConfig.servers as unknown[]));
  }

  const mcpObj = merged.mcpServers as Record<string, Record<string, unknown>> | undefined;
  if (mcpObj && typeof mcpObj === "object" && !Array.isArray(mcpObj)) {
    for (const [name, cfg] of Object.entries(mcpObj)) {
      mcpServersRaw.push({ name, ...cfg });
    }
  }

  const mcp: MCPServerConfig[] = mcpServersRaw.map((s: any) => {
    const hasCommand = typeof s.command === "string" && s.command.length > 0;
    const hasUrl = typeof s.url === "string" && s.url.length > 0;
    const transport = normalizeTransport(s.transport ?? s.type, hasCommand, hasUrl);

    return {
      name: s.name,
      description: s.description,
      transport,
      command: s.command,
      args: s.args,
      url: s.url,
      env: s.env,
      headers: s.headers,
      preferredProtocolVersion: normalizeProtocolVersion(s.preferredProtocolVersion ?? s.protocolVersion),
      allowLegacySseFallback: s.allowLegacySseFallback !== false,
      requestTimeoutMs: typeof s.requestTimeoutMs === "number" ? s.requestTimeoutMs : undefined,
      connectTimeoutMs: typeof s.connectTimeoutMs === "number" ? s.connectTimeoutMs : undefined,
    };
  });

  return {
    provider,
    modelId,
    apiKey,
    thinkingLevel,
    maxTokens,
    startupPath,
    projectPath,
    configDir,
    dataDir,
    userSkillsDir,
    projectSkillsDir,
    context: {
      strategy: "sliding-window",
      targetUtilization: 0.85,
      minRetainedMessages: 6,
    },
    memory: {
      enabled: true,
      autoExtract: false,
      maxGlobalEntries: 50,
      maxProjectEntries: 100,
    },
    permissions: {
      defaultDecision: "ask",
      rules: [...userPermissionRules, ...projectPermissionRules] as any,
      denyPatterns,
    },
    skills,
    mcp,
    appHost: { enabled: true },
  };

}
