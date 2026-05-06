import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

import type { HarnessConfig, ThinkingLevel } from "./types.js";

function xdgConfigHome(): string {
  return process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config");
}

function xdgDataHome(): string {
  return process.env.XDG_DATA_HOME ?? join(homedir(), ".local", "share");
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
  const projectPath = process.cwd();
  loadEnvFile(projectPath);

  const configDir = join(xdgConfigHome(), "agent");
  const dataDir = join(xdgDataHome(), "agent");

  const userConfig = loadJsonSafe(join(configDir, "config.json"));

  const provider = (process.env.AGENT_PROVIDER as string) ?? (userConfig.provider as string) ?? "deepseek";
  const modelId = (process.env.AGENT_MODEL as string) ?? (process.env.DEEPSEEK_MODEL as string) ?? (userConfig.modelId as string) ?? "deepseek-v4-flash";

  const thinkingLevel: ThinkingLevel = modelId.includes("pro") ? "medium" : "off";

  return {
    provider,
    modelId,
    thinkingLevel,
    projectPath,
    configDir,
    dataDir,
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
    },
    skills: ["filesystem", "bash", "search"],
  };
}
