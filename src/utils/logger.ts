// ── Logger ──
// Structured file-based logging for dscode.
// Each Agent instance creates one Logger; channel is specified per-write.
// All logs go to ~/.dscode/logs/<channel>.log — zero terminal output.

import { appendFileSync, mkdirSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

// ── Types ──

export type LogLevel = "debug" | "info" | "warn" | "error";
export type LogChannel = "lifecycle" | "session" | "tool" | "analysis";

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

  debug(channel: LogChannel, tag: string, message: string): void {
    this.write("debug", channel, tag, message);
  }

  info(channel: LogChannel, tag: string, message: string): void {
    this.write("info", channel, tag, message);
  }

  warn(channel: LogChannel, tag: string, message: string): void {
    this.write("warn", channel, tag, message);
  }

  error(channel: LogChannel, tag: string, message: string): void {
    this.write("error", channel, tag, message);
  }

  clear(channel: LogChannel): void {
    try {
      ensureDir();
      writeFileSync(channelPath(channel), "", "utf-8");
    } catch {
      // best-effort, suppress
    }
  }

  // ── Internal ──

  private write(level: LogLevel, channel: LogChannel, tag: string, message: string): void {
    if (LEVEL_RANK[level] < this.minLevel) return;

    const line = formatLine(level, channel, this.type, this.id, tag, message);
    try {
      ensureDir();
      appendFileSync(channelPath(channel), line + "\n", "utf8");
    } catch {
      // All I/O errors silently suppressed — log writing is best-effort
    }
  }
}

// ── Helpers ──

function formatLine(
  level: LogLevel,
  channel: string,
  agentType: string,
  agentId: string,
  tag: string,
  message: string,
): string {
  const ts = new Date().toISOString().replace("T", " ").slice(0, 19);
  return `[${ts}] [${level.toUpperCase()}] [${channel}] [${agentType}/${agentId}] [${tag}] ${message}`;
}

const LOG_DIR = join(homedir(), ".dscode", "logs");

function ensureDir(): void {
  if (!existsSync(LOG_DIR)) {
    mkdirSync(LOG_DIR, { recursive: true });
  }
}

function channelPath(channel: string): string {
  return join(LOG_DIR, `${channel}.log`);
}
