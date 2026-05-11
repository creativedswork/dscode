import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

import type { HarnessConfig, ThinkingLevel } from "./types.js";
import type { MCPServerConfig } from "../mcp/types.js";


function dsConfigHome(): string {
  return process.env.DSCODE_CONFIG_HOME ?? join(homedir(), ".dscode");
}

function dsDataHome(): string {
  return process.env.DSCODE_DATA_HOME ?? join(homedir(), ".dscode");
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

export function saveUserConfig(partial: Record<string, unknown>): void {
  const path = join(dsConfigHome(), "config.json");
  const existing = loadJsonSafe(path);
  saveJsonSafe(path, { ...existing, ...partial });
}

export function saveProjectConfig(partial: Record<string, unknown>, projectPath: string): void {
  const path = join(projectPath, ".dscode", "config.json");
  const existing = loadJsonSafe(path);
  saveJsonSafe(path, { ...existing, ...partial });
}

export function loadConfig(): HarnessConfig {
  const projectPath = resolve(process.env.DSCODE_PROJECT_PATH ?? process.cwd());
  if (projectPath !== process.cwd()) {
    process.chdir(projectPath);
  }

  const configDir = dsConfigHome();
  const dataDir = join(dsDataHome(), "data");

  const userConfig = loadJsonSafe(join(configDir, "config.json"));
  const projectConfig = loadJsonSafe(join(projectPath, ".dscode", "config.json"));
  const merged = { ...userConfig, ...projectConfig };

  const provider = (process.env.AGENT_PROVIDER as string) ?? (merged.provider as string) ?? "deepseek";
  const modelId = (process.env.AGENT_MODEL as string) ?? (process.env.DEEPSEEK_MODEL as string) ?? (merged.modelId as string) ?? "deepseek-v4-flash";
  const maxTokens = Number(process.env.DSCODE_MAX_TOKENS) || (merged.maxTokens as number) || 16384;

  // API key: env var > user config (never project config for security)
  const apiKey = process.env.DEEPSEEK_API_KEY ?? (userConfig.apiKey as string | undefined);

  const userDeny = ((userConfig.permissions as any)?.deny as string[]) ?? [];
  const projectDeny = ((projectConfig.permissions as any)?.deny as string[]) ?? [];
  const denyPatterns = [...new Set([...userDeny, ...projectDeny])];

  const userSkills = ((userConfig.skills as string[]) ?? []);
  const projectSkills = ((projectConfig.skills as string[]) ?? []);
  const skills = [...new Set([...userSkills, ...projectSkills])];

  const userSkillsDir = join(configDir, "skills");
  const projectSkillsDir = join(projectPath, ".dscode", "skills");

  const validThinkingLevels = new Set(["off", "minimal", "low", "medium", "high", "xhigh"]);
  const defaultThinkingLevel: ThinkingLevel = modelId.includes("pro") ? "medium" : "off";
  const rawThinkingLevel = process.env.AGENT_THINKING_LEVEL ?? merged.thinkingLevel;
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
    const transport = (s.transport ?? s.type ?? (hasUrl && !hasCommand ? "sse" : "stdio")) as "stdio" | "sse";

    return {
      name: s.name,
      description: s.description,
      transport,
      command: s.command,
      args: s.args,
      url: s.url,
      env: s.env,
    };
  });

  return {
    provider,
    modelId,
    apiKey,
    thinkingLevel,
    maxTokens,
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
      rules: [],
      denyPatterns,
    },
    skills,
    mcp,
  };

}