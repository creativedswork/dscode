// ── Logger ──
// Structured file-based logging for dscode.
// Each Agent instance creates one Logger.
// All logs go to ~/.dscode/logs/dscode.log — zero terminal output.

import { appendFileSync, mkdirSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

// ── Types ──

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_RANK: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export interface LoggerOptions {
  type: string;
  id: string;
  level?: LogLevel;
}

// ── Logger ──

export class Logger {
  private type: string;
  private id: string;
  private minLevel: number;

  constructor(options: LoggerOptions) {
    this.type = options.type;
    this.id = options.id;
    this.minLevel = LEVEL_RANK[options.level ?? "debug"];
  }

  // ── Public API ──

  debug(tag: string, message: string): void {
    this.write("debug", tag, message);
  }

  info(tag: string, message: string): void {
    this.write("info", tag, message);
  }

  warn(tag: string, message: string): void {
    this.write("warn", tag, message);
  }

  error(tag: string, message: string): void {
    this.write("error", tag, message);
  }

  clear(): void {
    try {
      ensureDir();
      writeFileSync(filePath(), "", "utf-8");
    } catch {
      // best-effort, suppress
    }
  }

  // ── Internal ──

  private write(level: LogLevel, tag: string, message: string): void {
    if (LEVEL_RANK[level] < this.minLevel) return;

    const line = formatLine(level, this.type, this.id, tag, message);
    try {
      ensureDir();
      appendFileSync(filePath(), line + "\n", "utf8");
    } catch {
      // All I/O errors silently suppressed — log writing is best-effort
    }
  }
}

// ── Helpers ──

function formatLine(
  level: LogLevel,
  agentType: string,
  agentId: string,
  tag: string,
  message: string,
): string {
  const ts = new Date().toISOString().replace("T", " ").slice(0, 19);
  return `[${ts}] [${level.toUpperCase()}] [${agentType}/${agentId}] [${tag}] ${message}`;
}

const LOG_DIR = join(homedir(), ".dscode", "logs");

function ensureDir(): void {
  if (!existsSync(LOG_DIR)) {
    mkdirSync(LOG_DIR, { recursive: true });
  }
}

function filePath(): string {
  return join(LOG_DIR, "dscode.log");
}
