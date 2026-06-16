// ── CHIFF Progress Display ──
// Progress tracking for the five-phase CHIFF pipeline.
// Outputs via onLog (TUI) and optional logger (file).

import type { Logger } from "../../utils/logger.js";
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

const PHASE_WEIGHTS = [0.05, 0.20, 0.40, 0.20, 0.15];

// ── ProgressDisplay Class ──

export class ProgressDisplay {
  private phases: PhaseInfo[] = [];
  private startTime: number = 0;
  private onLog: ((text: string) => void) | undefined;
  private logger: Logger | undefined;
  private lastOnLogTime: number = 0;
  private lastProgressBarTime: number = 0;

  // Web events buffer for future WebSocket integration
  private webEvents: Array<{ type: string; timestamp: number; data: unknown }> = [];

  constructor(
    options?: { onLog?: (text: string) => void; throttleMs?: number; logger?: Logger },
  ) {
    if (options) {
      this.onLog = options.onLog;
      this.logger = options.logger;
    }
    this.initPhases();
    this.startTime = Date.now();
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

  // ── Phase Lifecycle ──

  onPhaseStart(phaseIndex: number): void {
    if (phaseIndex >= 0 && phaseIndex < this.phases.length) {
      this.phases[phaseIndex].status = "running";
      this.phases[phaseIndex].durationMs = 0;
      this.phases[phaseIndex].toolCalls = 0;
      this.phases[phaseIndex].detail = "";
    }
    this.emitWebEvent("phaseStart", { phaseIndex });

    const labels = ["⏳ Phase 0/4: 落盘...", "🔍 Phase 1/4: SCAN — 扫描 attention zones...", "🔎 Phase 2/4: ZOOM — 深潜分析...", "🧩 Phase 3/4: SYNTHESIZE — 归因分析...", "📊 Phase 4/4: 规则提取..."];
    const label = labels[phaseIndex] ?? `Phase ${phaseIndex}/4 开始...`;

    if (this.onLog) {
      this.onLog(label);
      this.logProgressBar();
    }
    if (this.logger) {
      this.logger.info("analysis", "Progress", label);
    }
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

    // Throttled onLog output
    if (this.onLog) {
      const now = Date.now();
      const throttleMs = 500;
      if (now - this.lastOnLogTime >= throttleMs) {
        this.lastOnLogTime = now;
        this.onLog("  ⟳ " + event.detail);
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
    if (summary) {
      if (this.onLog) this.onLog(`✓ ${summary}`);
      if (this.logger) this.logger.info("analysis", "Progress", `Phase ${phaseIndex} done: ${summary}`);
    }
    this.logProgressBar();
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
  }

  // ── Completion ──

  showCompletion(summary: CompletionSummary): void {
    this.emitWebEvent("completion", summary);
    const sec = (summary.totalDurationMs / 1000).toFixed(1);
    const msg = `✅ CHIFF 分析完成 — ${sec}s · ${summary.totalLLMCalls} LLM 调用 · ${summary.keyFindings}`;
    if (this.onLog) {
      this.onLog(msg);
      this.logProgressBar();
    }
    if (this.logger) {
      this.logger.info("analysis", "Progress", msg);
    }
  }

  dispose(): void {
    // no-op (no spinner to clean up)
  }

  // ── Progress Bar (text-based for TUI onLog) ──

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
    this.webEvents.push({ type, timestamp: Date.now(), data });
  }

  getWebEvents(): Array<{ type: string; timestamp: number; data: unknown }> {
    return [...this.webEvents];
  }

  clearWebEvents(): void {
    this.webEvents = [];
  }
}
