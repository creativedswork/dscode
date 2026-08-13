// ── Logger ──
// Structured file-based logging for dscode.
// Each Agent instance creates one Logger.
// All logs go to ~/.dscode/logs/dscode.log — zero terminal output.

import { appendFileSync, mkdirSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import {
  getExecutionContext,
  getHostFacility,
} from "./execution-context.js";

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
  directory?: string;
}

export const HOST_LOGGER_FACILITY = Symbol("dscode.logger");

export function getHostLogger(): Logger | undefined {
  return getHostFacility<Logger>(HOST_LOGGER_FACILITY);
}

// ── Logger ──

export class Logger {
  private type: string;
  private id: string;
  private minLevel: number;
  private directory: string;

  constructor(options: LoggerOptions) {
    this.type = options.type;
    this.id = options.id;
    this.minLevel = LEVEL_RANK[options.level ?? "debug"];
    this.directory = options.directory ?? LOG_DIR;
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
      ensureDir(this.directory);
      writeFileSync(filePath(this.directory), "", "utf-8");
    } catch {
      // best-effort, suppress
    }
  }

  // ── Internal ──

  private write(level: LogLevel, tag: string, message: string): void {
    if (LEVEL_RANK[level] < this.minLevel) return;

    const context = getExecutionContext();
    const executionId = context
      ? `${context.hostId}:${context.processId}`
      : this.id;
    const line = formatLine(level, this.type, executionId, tag, message);
    try {
      ensureDir(this.directory);
      appendFileSync(filePath(this.directory), line + "\n", "utf8");
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

function ensureDir(directory: string): void {
  if (!existsSync(directory)) {
    mkdirSync(directory, { recursive: true });
  }
}

function filePath(directory: string): string {
  return join(directory, "dscode.log");
}
