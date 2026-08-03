import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import type { AgentApplicationSnapshot } from "./types.js";

export function agentMemoryPath(
  application: AgentApplicationSnapshot,
  configDir: string,
  projectPath: string,
): string | undefined {
  switch (application.memory) {
    case "user":
      return join(configDir, "agent-memory", application.name, "MEMORY.md");
    case "project":
      return join(projectPath, ".dscode", "agent-memory", application.name, "MEMORY.md");
    case "local":
      return join(projectPath, ".dscode", "agent-memory-local", application.name, "MEMORY.md");
    default:
      return undefined;
  }
}

export function loadAgentMemory(
  application: AgentApplicationSnapshot,
  configDir: string,
  projectPath: string,
): string {
  const path = agentMemoryPath(application, configDir, projectPath);
  if (!path || !existsSync(path)) return "";
  const content = readFileSync(path, "utf8").trim();
  if (!content) return "";
  return [
    `# Application Memory: ${application.name}`,
    `Scope: ${application.memory}`,
    `Path: ${path}`,
    "",
    content,
  ].join("\n");
}
