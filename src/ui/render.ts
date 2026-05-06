import type { Renderer } from "../core/types.js";

const DIM = "\x1b[90m";
const CYAN = "\x1b[36m";
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const MAGENTA = "\x1b[35m";
const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";

export const colors = { DIM, CYAN, GREEN, RED, YELLOW, MAGENTA, BOLD, RESET };

export class TerminalRenderer implements Renderer {
  renderTextDelta(delta: string): void {
    process.stdout.write(delta);
  }

  renderThinkingStart(): void {
    process.stdout.write(`${DIM}\n[thinking] `);
  }

  renderThinkingDelta(delta: string): void {
    process.stdout.write(`${DIM}${delta}${RESET}`);
  }

  renderThinkingEnd(): void {
    process.stdout.write(`${RESET}\n`);
  }

  renderToolStart(name: string, args: unknown): void {
    const preview = name === "bash"
      ? `$ ${(args as any)?.command ?? ""}`
      : JSON.stringify(args);
    process.stdout.write(`${CYAN}\n[tool] ${name}: ${preview.slice(0, 120)}${RESET}\n`);
  }

  renderToolEnd(name: string, result: unknown, isError: boolean): void {
    const color = isError ? RED : CYAN;
    const first = (result as any)?.content?.[0];
    const text = first?.type === "text" ? first.text.slice(0, 200) : "(non-text)";
    process.stdout.write(`${color}[result] ${text}${RESET}\n`);
  }

  renderError(message: string): void {
    process.stderr.write(`${RED}[error] ${message}${RESET}\n`);
  }

  renderInfo(message: string): void {
    process.stdout.write(`${DIM}${message}${RESET}\n`);
  }
}
