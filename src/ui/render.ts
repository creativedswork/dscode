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
  private spinnerTimer?: ReturnType<typeof setInterval>;
  private spinnerFrames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  private spinnerIndex = 0;
  private spinnerVisible = false;
  private lastActivityTime = 0;
  private idleStartTime = 0;
  private streaming = false;
  private paused = false;
  private idleThresholdMs = 1000;
  private waitSegments: number[] = [];
  private totalWaitMs = 0;

  startStreaming(): void {
    this.streaming = true;
    this.paused = false;
    this.lastActivityTime = Date.now();
    this.idleStartTime = 0;
    this.waitSegments = [];
    this.totalWaitMs = 0;
    this.spinnerTimer = setInterval(() => {
      if (!this.streaming || this.paused) return;
      const idleDuration = Date.now() - this.lastActivityTime;
      if (idleDuration >= this.idleThresholdMs) {
        if (!this.idleStartTime) {
          this.idleStartTime = this.lastActivityTime;
        }
        this.showSpinner();
      }
    }, 80);
  }

  stopStreaming(): void {
    this.streaming = false;
    this.paused = false;
    this.finalizeIdleSegment();
    if (this.spinnerTimer) {
      clearInterval(this.spinnerTimer);
      this.spinnerTimer = undefined;
    }
    if (this.totalWaitMs >= 1000) {
      process.stdout.write(`\n${DIM}⏱ total wait: ${this.formatElapsed(this.totalWaitMs)} (${this.waitSegments.length} segment${this.waitSegments.length > 1 ? "s" : ""})${RESET}\n`);
    }
  }

  pauseSpinner(): void {
    this.paused = true;
    this.finalizeIdleSegment();
  }

  private finalizeIdleSegment(): void {
    if (this.idleStartTime) {
      const segmentMs = Date.now() - this.idleStartTime;
      this.waitSegments.push(segmentMs);
      this.totalWaitMs += segmentMs;
      if (this.spinnerVisible) {
        this.spinnerVisible = false;
        process.stdout.write(`\r${DIM}⏱ waited ${this.formatElapsed(segmentMs)}${RESET}\x1b[K\n`);
      }
      this.idleStartTime = 0;
    } else if (this.spinnerVisible) {
      this.spinnerVisible = false;
      process.stdout.write("\r\x1b[K");
    }
  }

  private formatElapsed(ms: number): string {
    const totalSeconds = Math.floor(ms / 1000);
    if (totalSeconds < 60) {
      return `${(ms / 1000).toFixed(1)}s`;
    }
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}m ${seconds}s`;
  }

  private showSpinner(): void {
    const frame = this.spinnerFrames[this.spinnerIndex % this.spinnerFrames.length];
    this.spinnerIndex++;
    this.spinnerVisible = true;
    const elapsed = this.formatElapsed(Date.now() - this.idleStartTime);
    process.stdout.write(`\r${DIM}${frame} waiting... ${elapsed}${RESET}\x1b[K`);
  }

  private hideSpinner(): void {
    this.finalizeIdleSegment();
  }

  private markActivity(): void {
    this.paused = false;
    this.lastActivityTime = Date.now();
    this.hideSpinner();
  }

  renderTextDelta(delta: string): void {
    this.markActivity();
    process.stdout.write(delta);
  }

  renderThinkingStart(): void {
    this.markActivity();
    process.stdout.write(`${DIM}\n[thinking] `);
  }

  renderThinkingDelta(delta: string): void {
    this.markActivity();
    process.stdout.write(`${DIM}${delta}${RESET}`);
  }

  renderThinkingEnd(): void {
    this.markActivity();
    process.stdout.write(`${RESET}\n`);
  }

  renderToolStart(name: string, args: unknown): void {
    this.markActivity();
    const preview = name === "bash"
      ? `$ ${(args as any)?.command ?? ""}`
      : JSON.stringify(args);
    process.stdout.write(`${CYAN}\n[tool] ${name}: ${preview.slice(0, 120)}${RESET}\n`);
  }

  renderToolEnd(_name: string, result: unknown, isError: boolean): void {
    this.markActivity();
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
