import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import {
  configHome,
  dataHome,
  projectMcpPath as resolveProjectMcpPath,
  projectSettingsPath as resolveProjectSettingsPath,
  userCommandConfigPath,
  userMcpPath as resolveUserMcpPath,
  userSettingsPath as resolveUserSettingsPath,
} from "./paths.js";
import { maskSecret } from "./public-snapshot.js";
import { SettingsRepository } from "./settings-repository.js";

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

import type { RuntimeConfig } from "./types.js";
import type { MCPProtocolVersion, MCPServerConfig, MCPTransport } from "../mcp/types.js";
import { DEFAULT_MCP_PROTOCOL_VERSION } from "../mcp/types.js";
import { getThinkingLevel } from "../models/index.js";
import type { RetryConfig, ThinkingLevel } from "../models/types.js";


const settingsRepository = new SettingsRepository();

function userConfigPath(): string {
  return userCommandConfigPath();
}

export function userSettingsPath(): string {
  return resolveUserSettingsPath();
}

export function projectSettingsPath(projectPath: string): string {
  return resolveProjectSettingsPath(projectPath);
}

export function userMcpPath(): string {
  return resolveUserMcpPath();
}

export function projectMcpPath(projectPath: string): string {
  return resolveProjectMcpPath(projectPath);
}

function loadJsonSafe(path: string): Record<string, unknown> {
  return settingsRepository.readOrEmpty(path) as Record<string, unknown>;
}

export function maskApiKey(key: string | undefined): string {
  return maskSecret(key);
}

export function loadScopedSettings(settingsPath: string): Record<string, unknown> {
  return loadJsonSafe(settingsPath);
}

export function loadUserSettings(): Record<string, unknown> {
  return loadScopedSettings(userSettingsPath());
}

export function saveUserSettings(partial: Record<string, unknown>): void {
  settingsRepository.patchObjectSync(userSettingsPath(), partial);
}

export function saveProjectSettings(projectPath: string, partial: Record<string, unknown>): void {
  settingsRepository.patchObjectSync(projectSettingsPath(projectPath), partial);
}


export function saveUserConfig(partial: Record<string, unknown>): void {
  settingsRepository.patchObjectSync(userConfigPath(), partial);
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
  options: {
    userMcpFile?: string;
    warn?: (message: string) => void;
  } = {},
): { servers: MCPServerConfig[]; migrated: boolean } {
  const userMcp = loadJsonSafe(options.userMcpFile ?? userMcpPath());
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
      (options.warn ?? ((message) => process.stderr.write(message)))(
        "⚠ MCP config found in settings.json is deprecated. Please migrate to .mcp.json\n",
      );
    }
    return { servers: parseMcpServers(mcpServersRaw), migrated: false };
  }

  return { servers: [], migrated: hasMcpJson };
}

export interface LoadConfigOptions {
  environment?: Readonly<Record<string, string | undefined>>;
  currentWorkingDirectory?: string;
  configDir?: string;
  dataDir?: string;
  userMcpFile?: string;
  warn?: (message: string) => void;
}

export function loadConfig(
  cliCwd?: string,
  options: LoadConfigOptions = {},
): RuntimeConfig {
  const environment = options.environment ?? process.env;
  const currentWorkingDirectory = options.currentWorkingDirectory
    ?? process.cwd();
  const startupPath = resolve(
    cliCwd
      ?? environment.DSCODE_PROJECT_PATH
      ?? currentWorkingDirectory,
  );
  const configDir = options.configDir ?? configHome(environment);
  const dataDir = options.dataDir ?? join(dataHome(environment), "data");

  const userConfig = loadJsonSafe(join(configDir, "config.json"));
  const userSettings = loadScopedSettings(join(configDir, "settings.json"));

  const projectPath = startupPath;

  const projectSettings = loadScopedSettings(projectSettingsPath(projectPath));
  const merged = { ...userSettings, ...projectSettings };

  const provider = environment.AGENT_PROVIDER ?? (userConfig.provider as string) ?? (merged.provider as string) ?? "deepseek";
  const modelId = environment.AGENT_MODEL ?? environment.DEEPSEEK_MODEL ?? (userConfig.modelId as string) ?? (merged.modelId as string) ?? "deepseek-v4-flash";
  // Use provider-specific env var (e.g. KIMI_API_KEY, DEEPSEEK_API_KEY) via pi-ai,
  // fall back to DEEPSEEK_API_KEY for backward compat, then user config
  const envApiKey = environment[PROVIDER_ENV_VARS[provider]]
    ?? (provider === "qwen" ? environment.DASHSCOPE_API_KEY : undefined)
    ?? environment.DEEPSEEK_API_KEY;
  const apiKey = envApiKey ?? (userConfig.apiKey as string | undefined);

  // Vision model config: env var > user config
  const visionProvider = environment.AGENT_VISION_PROVIDER ?? (userConfig.vision as any)?.provider;
  const visionModel = environment.AGENT_VISION_MODEL ?? (userConfig.vision as any)?.model;
  const visionKey = (userConfig.vision as any)?.key as string | undefined;
  const vision = visionProvider && visionModel ? { provider: visionProvider, model: visionModel, key: visionKey } : undefined;
  const maxTokens = Number(environment.DSCODE_MAX_TOKENS) || (merged.maxTokens as number) || 16384;

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
  const rawThinkingLevel = environment.AGENT_THINKING_LEVEL ?? userConfig.thinkingLevel ?? merged.thinkingLevel;
  const thinkingLevel: ThinkingLevel = rawThinkingLevel !== undefined && validThinkingLevels.has(rawThinkingLevel as string)
    ? (rawThinkingLevel as ThinkingLevel)
    : defaultThinkingLevel;

  // Retry config: env vars > settings.json > defaults
  const retryFromEnv = {
    maxRetries: environment.DSCODE_RETRY_MAX_RETRIES ? Number(environment.DSCODE_RETRY_MAX_RETRIES) : undefined,
    baseDelayMs: environment.DSCODE_RETRY_BASE_DELAY_MS ? Number(environment.DSCODE_RETRY_BASE_DELAY_MS) : undefined,
    maxDelayMs: environment.DSCODE_RETRY_MAX_DELAY_MS ? Number(environment.DSCODE_RETRY_MAX_DELAY_MS) : undefined,
    retryOnTimeout: environment.DSCODE_RETRY_ON_TIMEOUT !== undefined ? environment.DSCODE_RETRY_ON_TIMEOUT !== "false" : undefined,
    retryOnRateLimit: environment.DSCODE_RETRY_ON_RATE_LIMIT !== undefined ? environment.DSCODE_RETRY_ON_RATE_LIMIT !== "false" : undefined,
    retryOnServerError: environment.DSCODE_RETRY_ON_SERVER_ERROR !== undefined ? environment.DSCODE_RETRY_ON_SERVER_ERROR !== "false" : undefined,
  };
  // Remove undefined entries so merged doesn't override with undefined
  for (const k of Object.keys(retryFromEnv)) {
    if ((retryFromEnv as any)[k] === undefined) delete (retryFromEnv as any)[k];
  }
  const mergedRetry = (merged.retry as Record<string, unknown>) ?? {};
  const retry: RetryConfig = {
    maxRetries: retryFromEnv.maxRetries ?? (mergedRetry.maxRetries as number) ?? 3,
    baseDelayMs: retryFromEnv.baseDelayMs ?? (mergedRetry.baseDelayMs as number) ?? 1000,
    maxDelayMs: retryFromEnv.maxDelayMs ?? (mergedRetry.maxDelayMs as number) ?? 30000,
    retryOnTimeout: retryFromEnv.retryOnTimeout ?? (mergedRetry.retryOnTimeout as boolean) ?? true,
    retryOnRateLimit: retryFromEnv.retryOnRateLimit ?? (mergedRetry.retryOnRateLimit as boolean) ?? true,
    retryOnServerError: retryFromEnv.retryOnServerError ?? (mergedRetry.retryOnServerError as boolean) ?? true,
  };

  // load MCP server configs from .mcp.json (preferred) or settings.json (deprecated fallback)
  const { servers: mcp } = loadMcpServers(
    userSettings,
    projectSettings,
    projectPath,
    {
      userMcpFile: options.userMcpFile,
      warn: options.warn,
    },
  );

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
    agents: {
      enabled: environment.DSCODE_AGENTS_ENABLED !== undefined
        ? environment.DSCODE_AGENTS_ENABLED !== "false"
        : (merged.agents as { enabled?: boolean } | undefined)?.enabled ?? true,
    },
    managedAgentsDir: typeof (environment.DSCODE_MANAGED_AGENTS_DIR ?? merged.managedAgentsDir) === "string"
      ? resolve(String(environment.DSCODE_MANAGED_AGENTS_DIR ?? merged.managedAgentsDir))
      : undefined,
    atFile: {
      maxFiles: (merged.atFileMaxFiles as number) ?? 5,
      maxFileSize: (merged.atFileMaxFileSize as number) ?? 50 * 1024,
      maxTotalSize: (merged.atFileMaxTotalSize as number) ?? 200 * 1024,
      maxImageSize: (merged.atFileMaxImageSize as number) ?? 20 * 1024 * 1024,
    },
    agentsMdContent: loadAgentsMd(projectPath),
    vision,
    agentModelAliases: merged.agentModelAliases as RuntimeConfig["agentModelAliases"],
    retry,
  };

}
