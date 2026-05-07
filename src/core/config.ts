import { existsSync, readFileSync } from "node:fs";
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

function loadEnvFile(projectPath: string): void {
  const envPath = join(projectPath, ".env");
  if (!existsSync(envPath)) return;

  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match || line.trim().startsWith("#")) continue;
    const [, key, rawValue] = match;
    if (process.env[key] !== undefined) continue;
    process.env[key] = rawValue.replace(/^['"]|['"]$/g, "");
  }
}

function loadJsonSafe(path: string): Record<string, unknown> {
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return {};
  }
}

export function loadConfig(): HarnessConfig {
  const projectPath = resolve(process.env.DSCODE_PROJECT_PATH ?? process.cwd());
  if (projectPath !== process.cwd()) {
    process.chdir(projectPath);
  }
  loadEnvFile(projectPath);

  const configDir = dsConfigHome();
  const dataDir = join(dsDataHome(), "data");

  const userConfig = loadJsonSafe(join(configDir, "config.json"));
  const projectConfig = loadJsonSafe(join(projectPath, ".dscode", "config.json"));
  const merged = { ...userConfig, ...projectConfig };

  const provider = (process.env.AGENT_PROVIDER as string) ?? (merged.provider as string) ?? "deepseek";
  const modelId = (process.env.AGENT_MODEL as string) ?? (process.env.DEEPSEEK_MODEL as string) ?? (merged.modelId as string) ?? "deepseek-v4-flash";
  const maxTokens = Number(process.env.DSCODE_MAX_TOKENS) || (merged.maxTokens as number) || 16384;

  const userDeny = ((userConfig.permissions as any)?.deny as string[]) ?? [];
  const projectDeny = ((projectConfig.permissions as any)?.deny as string[]) ?? [];
  const denyPatterns = [...new Set([...userDeny, ...projectDeny])];

  const userSkills = ((userConfig.skills as string[]) ?? []);
  const projectSkills = ((projectConfig.skills as string[]) ?? []);
  const skills = [...new Set([...userSkills, ...projectSkills])];

  const userSkillsDir = join(configDir, "skills");
  const projectSkillsDir = join(projectPath, ".dscode", "skills");

  const thinkingLevel: ThinkingLevel = modelId.includes("pro") ? "medium" : "off";

  // load MCP server configs from both formats:
  // 1) { mcp: { servers: [{name, command, args, cwd, ...}] } }  (legacy array)
  // 2) { mcpServers: { "name": {command, args, cwd, ...} } }    (object with named keys)
  let mcpServersRaw: unknown[] = [];
  const mcpConfig = (merged.mcp as Record<string, unknown>) ?? {};
  const mcpObj = merged.mcpServers as Record<string, Record<string, unknown>> | undefined;

  if (Array.isArray(mcpConfig.servers)) {
    mcpServersRaw = mcpConfig.servers as unknown[];
  } else if (mcpObj && typeof mcpObj === "object") {
    mcpServersRaw = Object.entries(mcpObj).map(([name, cfg]) => ({
      name,
      ...cfg,
    }));
  }

  const mcp: MCPServerConfig[] = mcpServersRaw.map((s: any) => ({
    name: s.name,
    description: s.description,
    transport: s.transport ?? s.type ?? "stdio",
    command: s.command,
    args: s.args,
    url: s.url,
    env: s.env,
  }));

  return {
    provider,
    modelId,
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
