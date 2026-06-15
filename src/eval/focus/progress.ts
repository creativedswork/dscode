// ── CHIFF Progress Display ──
// Progress rendering for the five-phase CHIFF pipeline.
// Supports: terminal ANSI, web mode (stubbed), and log-callback for TUI integration.

import type { ProgressEvent } from "./agent-loop.js";

// ── Types ──

export type PhaseStatus = "pending" | "running" | "done";

export interface PhaseInfo {
  id: string;
  label: string;
  status: PhaseStatus;
  toolCalls: number;
  durationMs: number;
  detail: string;
  subZones?: SubZoneInfo[];
}

export interface SubZoneInfo {
  id: string;
  label: string;
  status: PhaseStatus;
  toolCalls: number;
  detail: string;
}

export interface CompletionSummary {
  totalDurationMs: number;
  totalLLMCalls: number;
  keyFindings: string;
}

// ── Spinner Frames ──

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const PHASE_WEIGHTS = [0.05, 0.20, 0.40, 0.20, 0.15]; // 0-落盘, 1-SCAN, 2-ZOOM, 3-SYNTH, 4-报告

// ── ProgressDisplay Class ──

export class ProgressDisplay {
  private phases: PhaseInfo[] = [];
  private startTime: number = 0;
  private spinnerIdx: number = 0;
  private spinnerInterval: NodeJS.Timeout | null = null;
  private lastRender: string = "";
  private disableTerminal: boolean = false;
  private onLog: ((text: string) => void) | undefined;
  private lastOnLogTime: number = 0;
  private lastProgressBarTime: number = 0;

  // Web events buffer for future WebSocket integration
  private webEvents: Array<{ type: string; timestamp: number; data: unknown }> = [];

  /** Backward-compatible constructor: accepts old boolean or new options object. */
  constructor(
    webModeOrOptions?: boolean | { disableTerminal?: boolean; onLog?: (text: string) => void; throttleMs?: number },
    legacyOnLog?: (text: string) => void,
  ) {
    if (typeof webModeOrOptions === "boolean") {
      this.disableTerminal = webModeOrOptions;
      this.onLog = legacyOnLog;
    } else if (webModeOrOptions) {
      this.disableTerminal = webModeOrOptions.disableTerminal ?? false;
      this.onLog = webModeOrOptions.onLog;
    }
    this.initPhases();
    this.startTime = Date.now();

    // Only start continuous spinner for raw terminal mode (no TUI takeover)
    if (!this.disableTerminal) {
      this.startSpinner();
    }
  }

  private initPhases(): void {
    this.phases = [
      { id: "0", label: "落盘", status: "pending", toolCalls: 0, durationMs: 0, detail: "" },
      { id: "1", label: "SCAN", status: "pending", toolCalls: 0, durationMs: 0, detail: "" },
      { id: "2", label: "ZOOM", status: "pending", toolCalls: 0, durationMs: 0, detail: "", subZones: [] },
      { id: "3", label: "SYNTHESIZE", status: "pending", toolCalls: 0, durationMs: 0, detail: "" },
      { id: "4", label: "生成报告", status: "pending", toolCalls: 0, durationMs: 0, detail: "" },
    ];
  }

  // ── Spinner ──

  private startSpinner(): void {
    this.spinnerInterval = setInterval(() => {
      this.spinnerIdx = (this.spinnerIdx + 1) % SPINNER_FRAMES.length;
      this.render();
    }, 80);
  }

  private stopSpinner(): void {
    if (this.spinnerInterval) {
      clearInterval(this.spinnerInterval);
      this.spinnerInterval = null;
    }
  }

  // ── Phase Lifecycle ──

  onPhaseStart(phaseIndex: number): void {
    if (phaseIndex >= 0 && phaseIndex < this.phases.length) {
      this.phases[phaseIndex].status = "running";
      this.phases[phaseIndex].durationMs = 0;
      this.phases[phaseIndex].toolCalls = 0;
      this.phases[phaseIndex].detail = "";
    }
    this.emitWebEvent("phaseStart", { phaseIndex });
    if (this.onLog) {
      const labels = ["⏳ Phase 0/4: 落盘...", "🔍 Phase 1/4: SCAN — 扫描 attention zones...", "🔎 Phase 2/4: ZOOM — 深潜分析...", "🧩 Phase 3/4: SYNTHESIZE — 归因分析...", "📊 Phase 4/4: 规则提取..."];
      this.onLog(labels[phaseIndex] ?? `Phase ${phaseIndex}/4 开始...`);
      this.logProgressBar();
    }
    this.render();
  }

  onPhaseProgress(
    phaseIndex: number,
    event: ProgressEvent,
    subZoneId?: string,
  ): void {
    if (phaseIndex < 0 || phaseIndex >= this.phases.length) return;
    const phase = this.phases[phaseIndex];
    phase.toolCalls = event.toolCallsSoFar;
    phase.detail = event.detail;

    // Update sub-zone if provided
    if (subZoneId && phase.subZones) {
      const sub = phase.subZones.find((z) => z.id === subZoneId);
      if (sub) {
        sub.status = "running";
        sub.toolCalls = event.toolCallsSoFar;
        sub.detail = event.detail;
      }
    }

    this.emitWebEvent("phaseProgress", { phaseIndex, subZoneId, event });
    this.render();

    // Throttled onLog output for agent tool call progress
    if (this.onLog) {
      const now = Date.now();
      const throttleMs = 500;
      if (now - this.lastOnLogTime >= throttleMs) {
        this.lastOnLogTime = now;
        this.onLog("  ⟳ " + event.detail);
        // Progress bar at longer interval (every 3s)
        if (now - this.lastProgressBarTime >= 3000) {
          this.lastProgressBarTime = now;
          this.logProgressBar();
        }
      }
    }
  }

  onPhaseDone(
    phaseIndex: number,
    summary?: string,
    durationMs?: number,
  ): void {
    if (phaseIndex >= 0 && phaseIndex < this.phases.length) {
      this.phases[phaseIndex].status = "done";
      this.phases[phaseIndex].durationMs = durationMs ?? Date.now() - this.startTime;
      if (summary) this.phases[phaseIndex].detail = summary;
    }
    this.emitWebEvent("phaseDone", { phaseIndex, summary, durationMs });
    if (summary && this.onLog) {
      this.onLog(`✓ ${summary}`);
    }
    this.logProgressBar();
    this.render();
  }

  // ── ZOOM Sub-Zone Management ──

  setSubZones(phaseIndex: number, zones: Array<{ id: string; label: string }>): void {
    if (phaseIndex < 0 || phaseIndex >= this.phases.length) return;
    this.phases[phaseIndex].subZones = zones.map((z) => ({
      id: z.id,
      label: z.label,
      status: "pending" as PhaseStatus,
      toolCalls: 0,
      detail: "",
    }));
    this.render();
  }

  // ── Completion ──

  showCompletion(summary: CompletionSummary): void {
    this.stopSpinner();
    this.emitWebEvent("completion", summary);
    if (this.onLog) {
      const sec = (summary.totalDurationMs / 1000).toFixed(1);
      this.onLog(`✅ CHIFF 分析完成 — ${sec}s · ${summary.totalLLMCalls} LLM 调用 · ${summary.keyFindings}`);
      this.logProgressBar();
    }
    if (!this.disableTerminal) {
      this.renderCompletion(summary);
    }
  }

  dispose(): void {
    this.stopSpinner();
  }

  // ── Terminal Rendering ──

  private render(): void {
    if (this.disableTerminal) return;

    const elapsed = Date.now() - this.startTime;
    const progress = this.computeProgress();
    const spinner = SPINNER_FRAMES[this.spinnerIdx];

    const lines: string[] = [];

    // Header
    lines.push("┌─ CHIFF 因果分析 ───────────────────────────────────────┐");

    // Progress bar
    const barWidth = 40;
    const filled = Math.round(progress * barWidth);
    const bar = "█".repeat(filled) + "░".repeat(barWidth - filled);
    const pct = Math.round(progress * 100);
    lines.push(`│  ${bar}  ${pct}%`.padEnd(55) + "│");

    // Phase log
    for (const phase of this.phases) {
      const icon = phase.status === "done" ? "✓"
        : phase.status === "running" ? spinner
        : "⏳";

      const timeStr = phase.durationMs > 0
        ? ` ${(phase.durationMs / 1000).toFixed(1)}s`
        : "";

      const toolStr = phase.toolCalls > 0
        ? ` · ${phase.toolCalls} tool calls`
        : "";

      const detailStr = phase.detail && phase.status === "running"
        ? `\n│       最近: ${phase.detail.slice(0, 40)}`
        : "";

      const line = `│  ${icon}  Phase ${phase.id}/4: ${phase.label}${timeStr}${toolStr}`;
      lines.push(line.padEnd(55) + "│");

      if (detailStr) {
        lines.push(detailStr.padEnd(55) + "│");
      }

      // Sub-zones for ZOOM
      if (phase.subZones && phase.subZones.length > 0 && phase.status === "running") {
        for (const sz of phase.subZones) {
          const sIcon = sz.status === "done" ? "✓"
            : sz.status === "running" ? spinner
            : "⏳";
          const sToolStr = sz.toolCalls > 0 ? ` · ${sz.toolCalls}` : "";
          const sDetail = sz.detail && sz.status === "running"
            ? `\n│         最近: ${sz.detail.slice(0, 36)}`
            : "";
          const sLine = `│     ${sIcon} ${sz.label}${sToolStr}`;
          lines.push(sLine.padEnd(55) + "│");
          if (sDetail) lines.push(sDetail.padEnd(55) + "│");
        }
      }
    }

    // Footer
    const elapsedStr = `${(elapsed / 1000).toFixed(1)}s`;
    lines.push(`│  已用时: ${elapsedStr}`.padEnd(55) + "│");
    lines.push("└──────────────────────────────────────────────────────────┘");

    // ANSI: clear and re-render
    const output = lines.join("\n");
    if (this.lastRender) {
      const prevLines = this.lastRender.split("\n").length;
      process.stdout.write(`\x1b[${prevLines}A\x1b[J`);
    }
    process.stdout.write(output + "\n");
    this.lastRender = output;
  }

  private renderCompletion(summary: CompletionSummary): void {
    const lines = this.lastRender.split("\n").length;
    process.stdout.write(`\x1b[${lines}B\n`);

    const durationSec = (summary.totalDurationMs / 1000).toFixed(1);
    console.log("┌─ 分析完成 ──────────────────────────────────────────────┐");
    console.log(`│  总耗时: ${durationSec}s                                    │`);
    console.log(`│  总 LLM 调用: ${summary.totalLLMCalls}                                           │`);
    console.log(`│  ${summary.keyFindings}`.padEnd(55) + "│");
    console.log("└──────────────────────────────────────────────────────────┘");
    console.log("");
  }

  private computeProgress(): number {
    let progress = 0;
    for (let i = 0; i < this.phases.length; i++) {
      const phase = this.phases[i];
      if (phase.status === "done") {
        progress += PHASE_WEIGHTS[i];
      } else if (phase.status === "running") {
        const phaseProgress = i === 2 && phase.subZones && phase.subZones.length > 0
          ? phase.subZones.filter((z) => z.status === "done").length / phase.subZones.length
          : Math.min(0.5, phase.toolCalls / 15);
        progress += PHASE_WEIGHTS[i] * phaseProgress;
        break;
      } else {
        break;
      }
    }
    return Math.min(1, progress);
  }

  // ── Progress Bar (text-based for TUI onLog) ──

  private buildProgressBar(): string {
    const pct = this.computeProgress();
    const width = 20;
    const filled = Math.round(pct * width);
    const bar = "█".repeat(filled) + "░".repeat(width - filled);
    return `[${bar}] ${Math.round(pct * 100)}%`;
  }

  private logProgressBar(): void {
    if (!this.onLog) return;
    this.onLog(this.buildProgressBar());
  }

  // ── Web Event Emission (Stub) ──

  private emitWebEvent(type: string, data: unknown): void {
    if (!this.disableTerminal) return;
    this.webEvents.push({ type, timestamp: Date.now(), data });
  }

  getWebEvents(): Array<{ type: string; timestamp: number; data: unknown }> {
    return [...this.webEvents];
  }

  clearWebEvents(): void {
    this.webEvents = [];
  }
}
