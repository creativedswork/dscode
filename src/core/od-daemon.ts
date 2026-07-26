import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// ── Command Resolution ──

function findCommand(cmd: string): string | null {
  const pathDirs = (process.env.PATH ?? "").split(":").filter(Boolean);
  for (const dir of pathDirs) {
    const fullPath = join(dir, cmd);
    if (existsSync(fullPath)) return fullPath;
  }
  return null;
}

export function resolveOdCommand(odDir: string): { cmd: string; args: string[]; cwd: string } {
  const expandedDir = expandTilde(odDir);

  // 1. Prefer global `od` command if available
  if (findCommand("od")) {
    return { cmd: "od", args: [], cwd: expandedDir };
  }

  // 2. Fall back to pnpm workspace script
  return { cmd: "pnpm", args: ["tools-dev", "run", "web"], cwd: expandedDir };
}

// ── Daemon Spawn ──

export function startOdDaemon(odDir: string, odPort: number): ChildProcess {
  const { cmd, args, cwd } = resolveOdCommand(odDir);
  const child = spawn(cmd, args, {
    cwd,
    stdio: "ignore",
    env: { ...process.env, OD_PORT: String(odPort) },
  });
  child.unref();
  return child;
}

// ── Health Check Polling ──

export async function waitForOdDaemon(port: number, timeoutMs = 30000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`);
      if (res.status === 200) {
        console.log(`Open Design daemon ready on port ${port}`);
        return true;
      }
    } catch {
      // Daemon not ready yet — silently retry
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  console.warn(`Open Design daemon did not become healthy within ${timeoutMs / 1000}s`);
  return false;
}

// ── Cleanup Registration ──

let cleanupHandlers: Array<() => void> = [];

function runOdCleanup(): void {
  for (const handler of cleanupHandlers) {
    handler();
  }
  cleanupHandlers = [];
}

// Set up global signal/exit hooks once
let cleanupHooksInstalled = false;

function installCleanupHooks(): void {
  if (cleanupHooksInstalled) return;
  cleanupHooksInstalled = true;

  process.on("exit", runOdCleanup);
  process.on("SIGINT", runOdCleanup);
  process.on("SIGTERM", runOdCleanup);
}

export function registerOdCleanup(odChild: ChildProcess): void {
  installCleanupHooks();

  const handler = () => {
    if (odChild.exitCode !== null || odChild.signalCode !== null) return;
    odChild.kill("SIGTERM");
    const forceKill = setTimeout(() => {
      if (odChild.exitCode === null && odChild.signalCode === null) {
        odChild.kill("SIGKILL");
      }
    }, 3000);
    forceKill.unref();
  };

  cleanupHandlers.push(handler);
}

// ── MCP Auto-Config ──

export function expandTilde(filePath: string): string {
  if (filePath.startsWith("~")) {
    return join(homedir(), filePath.slice(1));
  }
  return filePath;
}

const MCP_PATH = join(homedir(), ".mcp.json");

export function ensureOdMcpEntry(odDir: string, odPort: number): boolean {
  const expandedDir = expandTilde(odDir);
  const daemonCliPath = join(expandedDir, "apps", "daemon", "src", "cli.ts");
  const daemonUrl = `http://127.0.0.1:${odPort}`;

  let mcpConfig: Record<string, unknown>;

  try {
    if (existsSync(MCP_PATH)) {
      const raw = readFileSync(MCP_PATH, "utf8");
      mcpConfig = JSON.parse(raw);
    } else {
      mcpConfig = {};
    }
  } catch (e) {
    if (existsSync(MCP_PATH)) {
      console.warn(
        `Cannot read ~/.mcp.json: ${e instanceof Error ? e.message : String(e)}`,
      );
      return false;
    }
    mcpConfig = {};
  }

  const servers = (mcpConfig.mcpServers as Record<string, unknown>) ?? {};
  const existing = servers["open-design"] as
    | { command?: string; args?: string[] }
    | undefined;

  if (
    existing?.args?.[1] === daemonCliPath &&
    existing?.args?.[4] === daemonUrl
  ) {
    // Already up to date
    return true;
  }

  servers["open-design"] = {
    command: "npx",
    args: ["tsx", daemonCliPath, "mcp", "--daemon-url", daemonUrl],
  };
  mcpConfig.mcpServers = servers;

  try {
    writeFileSync(MCP_PATH, JSON.stringify(mcpConfig, null, 2) + "\n");
    console.log(`~/.mcp.json updated with open-design MCP entry`);
    return true;
  } catch (e) {
    console.warn(
      `Cannot write ~/.mcp.json: ${e instanceof Error ? e.message : String(e)}`,
    );
    return false;
  }
}
