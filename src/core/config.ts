import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

import { getEnvApiKey } from "../models/index.js";

export const PROVIDER_ENV_VARS: Record<string, string> = {
  deepseek: "DEEPSEEK_API_KEY",
  "kimi-coding": "KIMI_API_KEY",
  "kimi": "KIMI_API_KEY",
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  google: "GEMINI_API_KEY",
  xai: "XAI_API_KEY",
  groq: "GROQ_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
  mistral: "MISTRAL_API_KEY",
  qwen: "DASHSCOPE_API_KEY",
  "moonshotai-cn": "MOONSHOT_API_KEY",
};

import type { HarnessConfig, ThinkingLevel } from "./types.js";
import type { MCPProtocolVersion, MCPServerConfig, MCPTransport } from "../mcp/types.js";
import { DEFAULT_MCP_PROTOCOL_VERSION } from "../mcp/types.js";
import { getThinkingLevel } from "../models/index.js";


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

export function projectSettingsPath(projectPath: string): string {
  return join(projectPath, ".dscode", "settings.json");
}

export function userMcpPath(): string {
  return join(homedir(), ".mcp.json");
}

export function projectMcpPath(projectPath: string): string {
  return join(projectPath, ".mcp.json");
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

export function loadScopedSettings(settingsPath: string): Record<string, unknown> {
  return loadJsonSafe(settingsPath);
}

export function loadUserSettings(): Record<string, unknown> {
  return loadScopedSettings(userSettingsPath());
}

export function saveUserSettings(partial: Record<string, unknown>): void {
  const path = userSettingsPath();
  const existing = loadUserSettings();
  const merged = { ...existing, ...partial };
  for (const [k, v] of Object.entries(partial)) {
    if (v === null) delete merged[k];
  }
  saveJsonSafe(path, merged);
}

export function saveProjectSettings(projectPath: string, partial: Record<string, unknown>): void {
  const path = projectSettingsPath(projectPath);
  const existing = loadScopedSettings(path);
  const merged = { ...existing, ...partial };
  for (const [k, v] of Object.entries(partial)) {
    if (v === null) delete merged[k];
  }
  saveJsonSafe(path, merged);
}


export function saveUserConfig(partial: Record<string, unknown>): void {

  const path = userConfigPath();
  const existing = loadUserCommandConfig();
  const merged = { ...existing, ...partial };
  for (const [k, v] of Object.entries(partial)) {
    if (v === null) delete merged[k];
  }
  saveJsonSafe(path, merged);
}

export function normalizeTransport(rawTransport: unknown, hasCommand: boolean, hasUrl: boolean): MCPTransport {
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

export function normalizeProtocolVersion(rawVersion: unknown): MCPProtocolVersion {
  if (rawVersion === "2024-11-05" || rawVersion === "2025-03-26" || rawVersion === "2025-11-25") {
    return rawVersion;
  }
  return DEFAULT_MCP_PROTOCOL_VERSION;
}

function loadAgentsMd(projectPath: string): string | undefined {
  const path = join(projectPath, "AGENTS.md");
  if (!existsSync(path)) return undefined;
  try {
    return readFileSync(path, "utf8");
  } catch {
    return undefined;
  }
}

/** Parse raw MCP server entries into MCPServerConfig array */
export function parseMcpServers(raw: unknown[]): MCPServerConfig[] {
  return raw
    .filter((s: any) => s && typeof s === "object" && typeof s.name === "string")
    .map((s: any) => {
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
}

/** Deep-merge mcpServers objects by server name */
function deepMergeMcpServers(
  base: Record<string, Record<string, unknown>>,
  overlay: Record<string, Record<string, unknown>>,
): Record<string, Record<string, unknown>> {
  const result = { ...base };
  for (const [name, cfg] of Object.entries(overlay)) {
    result[name] = { ...(result[name] ?? {}), ...cfg };
  }
  return result;
}

/**
 * Load MCP server configs from .mcp.json files, with settings.json fallback.
 * Priority: project .mcp.json > user .mcp.json > settings.json (deprecated)
 */
export function loadMcpServers(
  userSettings: Record<string, unknown>,
  projectSettings: Record<string, unknown>,
  projectPath: string,
): { servers: MCPServerConfig[]; migrated: boolean } {
  const userMcp = loadJsonSafe(userMcpPath());
  const projectMcp = loadJsonSafe(projectMcpPath(projectPath));
  const hasMcpJson = Object.keys(userMcp).length > 0 || Object.keys(projectMcp).length > 0;

  // Build merged mcpServers from .mcp.json files
  const userMcpServers = (userMcp.mcpServers as Record<string, Record<string, unknown>>) ?? {};
  const projectMcpServers = (projectMcp.mcpServers as Record<string, Record<string, unknown>>) ?? {};
  const mergedMcpServers = deepMergeMcpServers(userMcpServers, projectMcpServers);

  let raw: unknown[] = [];
  for (const [name, cfg] of Object.entries(mergedMcpServers)) {
    raw.push({ name, ...cfg });
  }

  if (raw.length > 0) {
    return { servers: parseMcpServers(raw), migrated: true };
  }

  // Fallback: load from settings.json (deprecated)
  const merged = { ...userSettings, ...projectSettings };

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

  if (mcpServersRaw.length > 0) {
    // Only warn if .mcp.json doesn't exist (user hasn't migrated yet)
    if (!hasMcpJson) {
      process.stderr.write(
        "⚠ MCP config found in settings.json is deprecated. Please migrate to .mcp.json\n",
      );
    }
    return { servers: parseMcpServers(mcpServersRaw), migrated: false };
  }

  return { servers: [], migrated: hasMcpJson };
}

export function loadConfig(cliCwd?: string): HarnessConfig {
  const startupPath = resolve(cliCwd ?? process.env.DSCODE_PROJECT_PATH ?? process.cwd());
  const configDir = dsConfigHome();
  const dataDir = join(dsDataHome(), "data");

  const userConfig = loadUserCommandConfig();
  const userSettings = loadScopedSettings(userSettingsPath());

  const projectPath = startupPath;

  if (projectPath !== process.cwd()) {
    process.chdir(projectPath);
  }

  const projectSettings = loadScopedSettings(projectSettingsPath(projectPath));
  const merged = { ...userSettings, ...projectSettings };

  const provider = (process.env.AGENT_PROVIDER as string) ?? (userConfig.provider as string) ?? (merged.provider as string) ?? "deepseek";
  const modelId = (process.env.AGENT_MODEL as string) ?? (process.env.DEEPSEEK_MODEL as string) ?? (userConfig.modelId as string) ?? (merged.modelId as string) ?? "deepseek-v4-flash";
  // Use provider-specific env var (e.g. KIMI_API_KEY, DEEPSEEK_API_KEY) via pi-ai,
  // fall back to DEEPSEEK_API_KEY for backward compat, then user config
  const envApiKey = getEnvApiKey(provider) ?? (provider === "qwen" ? process.env.DASHSCOPE_API_KEY : undefined) ?? process.env.DEEPSEEK_API_KEY;
  const apiKey = envApiKey ?? (userConfig.apiKey as string | undefined);

  // Vision model config: env var > user config
  const visionProvider = (process.env.AGENT_VISION_PROVIDER as string) ?? (userConfig.vision as any)?.provider;
  const visionModel = (process.env.AGENT_VISION_MODEL as string) ?? (userConfig.vision as any)?.model;
  const visionKey = (userConfig.vision as any)?.key as string | undefined;
  const vision = visionProvider && visionModel ? { provider: visionProvider, model: visionModel, key: visionKey } : undefined;
  const maxTokens = Number(process.env.DSCODE_MAX_TOKENS) || (merged.maxTokens as number) || 16384;

  // Parse Claude Code compatible allow/deny arrays
  const userAllow = ((userSettings.permissions as any)?.allow as string[]) ?? [];
  const projectAllow = ((projectSettings.permissions as any)?.allow as string[]) ?? [];
  const userDeny = ((userSettings.permissions as any)?.deny as string[]) ?? [];
  const projectDeny = ((projectSettings.permissions as any)?.deny as string[]) ?? [];
  const denyPatterns = [...new Set([...userDeny, ...projectDeny])];

  // Convert allow/deny arrays to PermissionRuleConfig format
  const allowRules: Record<string, unknown>[] = [...userAllow, ...projectAllow].map((t) => ({
    tool: t,
    decision: "allow",
    priority: 5,
  }));
  const denyRules: Record<string, unknown>[] = [...userDeny, ...projectDeny].map((t) => ({
    tool: t,
    decision: "deny",
    priority: 5,
  }));

  // Existing rules format (object array)
  const userPermissionRules = ((userSettings.permissions as any)?.rules as Record<string, unknown>[]) ?? [];
  const projectPermissionRules = ((projectSettings.permissions as any)?.rules as Record<string, unknown>[]) ?? [];

  // Merge: allow/deny arrays + existing rules. Explicit rules come last so their priority overrides.
  const allPermissionRules = [...allowRules, ...denyRules, ...userPermissionRules, ...projectPermissionRules];

  const userSkills = ((userSettings.skills as string[]) ?? []);
  const projectSkills = ((projectSettings.skills as string[]) ?? []);
  const skills = [...new Set([...userSkills, ...projectSkills])];
  const userDisabledSkills = ((userSettings.disabledSkills as string[]) ?? []);
  const projectDisabledSkills = ((projectSettings.disabledSkills as string[]) ?? []);
  const disabledSkills = [...new Set([...userDisabledSkills, ...projectDisabledSkills])];

  const userSkillsDir = join(configDir, "skills");
  const projectSkillsDir = join(projectPath, ".dscode", "skills");
  const userCommandsDir = join(configDir, "commands");
  const projectCommandsDir = join(projectPath, ".dscode", "commands");
  const defaultThinkingLevel: ThinkingLevel = getThinkingLevel(provider, modelId);
  const validThinkingLevels = new Set(["off", "minimal", "low", "medium", "high", "xhigh", "max"]);
  const rawThinkingLevel = process.env.AGENT_THINKING_LEVEL ?? userConfig.thinkingLevel ?? merged.thinkingLevel;
  const thinkingLevel: ThinkingLevel = rawThinkingLevel !== undefined && validThinkingLevels.has(rawThinkingLevel as string)
    ? (rawThinkingLevel as ThinkingLevel)
    : defaultThinkingLevel;

  // Retry config: env vars > settings.json > defaults
  const retryFromEnv = {
    maxRetries: process.env.DSCODE_RETRY_MAX_RETRIES ? Number(process.env.DSCODE_RETRY_MAX_RETRIES) : undefined,
    baseDelayMs: process.env.DSCODE_RETRY_BASE_DELAY_MS ? Number(process.env.DSCODE_RETRY_BASE_DELAY_MS) : undefined,
    maxDelayMs: process.env.DSCODE_RETRY_MAX_DELAY_MS ? Number(process.env.DSCODE_RETRY_MAX_DELAY_MS) : undefined,
    retryOnTimeout: process.env.DSCODE_RETRY_ON_TIMEOUT !== undefined ? process.env.DSCODE_RETRY_ON_TIMEOUT !== "false" : undefined,
    retryOnRateLimit: process.env.DSCODE_RETRY_ON_RATE_LIMIT !== undefined ? process.env.DSCODE_RETRY_ON_RATE_LIMIT !== "false" : undefined,
    retryOnServerError: process.env.DSCODE_RETRY_ON_SERVER_ERROR !== undefined ? process.env.DSCODE_RETRY_ON_SERVER_ERROR !== "false" : undefined,
  };
  // Remove undefined entries so merged doesn't override with undefined
  for (const k of Object.keys(retryFromEnv)) {
    if ((retryFromEnv as any)[k] === undefined) delete (retryFromEnv as any)[k];
  }
  const mergedRetry = (merged.retry as Record<string, unknown>) ?? {};
  const retry: import("./types.js").RetryConfig = {
    maxRetries: retryFromEnv.maxRetries ?? (mergedRetry.maxRetries as number) ?? 3,
    baseDelayMs: retryFromEnv.baseDelayMs ?? (mergedRetry.baseDelayMs as number) ?? 1000,
    maxDelayMs: retryFromEnv.maxDelayMs ?? (mergedRetry.maxDelayMs as number) ?? 30000,
    retryOnTimeout: retryFromEnv.retryOnTimeout ?? (mergedRetry.retryOnTimeout as boolean) ?? true,
    retryOnRateLimit: retryFromEnv.retryOnRateLimit ?? (mergedRetry.retryOnRateLimit as boolean) ?? true,
    retryOnServerError: retryFromEnv.retryOnServerError ?? (mergedRetry.retryOnServerError as boolean) ?? true,
  };

  // load MCP server configs from .mcp.json (preferred) or settings.json (deprecated fallback)
  const { servers: mcp } = loadMcpServers(userSettings, projectSettings, projectPath);

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
    userCommandsDir,
    projectCommandsDir,
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
      rules: allPermissionRules as any,
      denyPatterns,
    },
    skills,
    disabledSkills,
    mcp,
    appHost: { enabled: true },
    atFile: {
      maxFiles: (merged.atFileMaxFiles as number) ?? 5,
      maxFileSize: (merged.atFileMaxFileSize as number) ?? 50 * 1024,
      maxTotalSize: (merged.atFileMaxTotalSize as number) ?? 200 * 1024,
      maxImageSize: (merged.atFileMaxImageSize as number) ?? 20 * 1024 * 1024,
    },
    agentsMdContent: loadAgentsMd(projectPath),
    vision,
    retry,
  };

}
