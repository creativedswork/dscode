// ── Eval Logger ──
// Appends structured log lines to ~/.dscode/logs/eval.log
// for offline diagnosis of eval pipeline runs.

import { appendFileSync, mkdirSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const LOG_DIR = join(homedir(), ".dscode", "logs");
const LOG_PATH = join(LOG_DIR, "eval.log");

function ensureDir(): void {
  if (!existsSync(LOG_DIR)) {
    mkdirSync(LOG_DIR, { recursive: true });
  }
}

function timestamp(): string {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}

export function logEval(level: "info" | "warn" | "error", tag: string, message: string): void {
  const line = `[${timestamp()}] [${level.toUpperCase()}] [${tag}] ${message}`;
  try {
    ensureDir();
    appendFileSync(LOG_PATH, line + "\n", "utf8");
  } catch {
    // best-effort: fall back to console if file write fails
  }
  // file-only; console output pollutes TUI
  if (level === "error") console.error(line);
}

export function clearEvalLog(): void {
  ensureDir();
  writeFileSync(LOG_PATH, "", "utf-8");
}
