// ── Prompt Budget Guard ──
// Enforces MAX_PROMPT_CHARS (60K) on all eval LLM prompts.
// Applies four-tier trimming strategy when budget exceeded.

import type { SessionSkeleton, HotZone, HotZoneStep, ColdZone } from "./types.js";
import type { Logger } from "../../utils/logger.js";

// ── Constants ──

export const MAX_PROMPT_CHARS = 60000;

const TIER1_THOUGHT_MAX = 80;
const TIER1_RESULT_MAX = 150;

const TIER2_THOUGHT_MAX = 50;
const TIER2_RESULT_MAX = 100;

const TIER3_COLD_COMPACT = true;

// ── Helpers ──

function estimatePromptChars(skeleton: SessionSkeleton): number {
  let chars = 0;
  // Metadata
  chars += JSON.stringify(skeleton.meta).length;
  chars += JSON.stringify(skeleton.stats).length;
  chars += JSON.stringify(skeleton.phases).length;
  chars += JSON.stringify(skeleton.signalAnchors).length;
  // Hot zones (steps are the bulk)
  for (const hz of skeleton.hotZones) {
    chars += JSON.stringify(hz.steps).length;
  }
  // Cold zones
  chars += JSON.stringify(skeleton.coldZones).length;
  // Data items
  chars += JSON.stringify(skeleton.dataItems).length;
  return chars;
}

// ── Tier implementations ──

function applyTier1_CompressColdZones(skeleton: SessionSkeleton): SessionSkeleton {
  return {
    ...skeleton,
    coldZones: skeleton.coldZones.map((cz): ColdZone => ({
      stepRange: cz.stepRange,
      toolCountByAgent: cz.toolCountByAgent,
      errorCount: cz.errorCount,
      userMessages: cz.userMessages,
    })),
  };
}

function applyTier2_DowngradeLowSuspicionHotZones(skeleton: SessionSkeleton): SessionSkeleton {
  // Sort by suspicion score ascending, downgrade lowest first
  const sorted = [...skeleton.hotZones].sort((a, b) => a.suspicionScore - b.suspicionScore);

  // Downgrade zones with suspicionScore < 0.5 to summary-only
  const downgraded = new Set<number>();
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i].suspicionScore < 0.5) {
      downgraded.add(sorted[i].stepStart);
    }
  }

  return {
    ...skeleton,
    hotZones: skeleton.hotZones.map((hz): HotZone => {
      if (!downgraded.has(hz.stepStart)) return hz;
      // Downgrade to summary: keep first and last 3 steps, replace middle with summary
      const steps = hz.steps;
      if (steps.length <= 10) return hz;
      const first3 = steps.slice(0, 3);
      const last3 = steps.slice(-3);
      return {
        ...hz,
        steps: [
          ...first3,
          {
            stepId: -1,
            agent: "__summary__",
            action: `${steps.length - 6} steps omitted (low suspicion zone)`,
            thought: "",
            result: `${steps.length} total steps, ${hz.signals.length} signals`,
            isError: false,
          },
          ...last3,
        ],
      };
    }),
  };
}

function applyTier3_TruncateStepDetail(skeleton: SessionSkeleton): SessionSkeleton {
  return {
    ...skeleton,
    hotZones: skeleton.hotZones.map((hz): HotZone => ({
      ...hz,
      steps: hz.steps.map((s): HotZoneStep => ({
        ...s,
        thought: s.thought.length > TIER2_THOUGHT_MAX
          ? s.thought.slice(0, TIER2_THOUGHT_MAX - 3) + "..."
          : s.thought,
        result: s.result.length > TIER2_RESULT_MAX
          ? s.result.slice(0, TIER2_RESULT_MAX - 3) + "..."
          : s.result,
      })),
    })),
  };
}

function applyTier4_MinimumContext(skeleton: SessionSkeleton): SessionSkeleton {
  // Keep only first 5 and last 5 steps of highest-suspicion Hot Zone
  // Replace middle with marker
  const sorted = [...skeleton.hotZones].sort((a, b) => b.suspicionScore - a.suspicionScore);

  return {
    ...skeleton,
    hotZones: skeleton.hotZones.map((hz): HotZone => {
      const isHighest = hz.stepStart === sorted[0]?.stepStart;
      if (!isHighest) return hz;

      const steps = hz.steps;
      if (steps.length <= 12) return hz;

      const first5 = steps.slice(0, 5);
      const last5 = steps.slice(-5);
      const omitted = steps.length - 10;

      return {
        ...hz,
        steps: [
          ...first5,
          {
            stepId: -1,
            agent: "__omitted__",
            action: `... (${omitted} steps omitted) ...`,
            thought: "",
            result: "",
            isError: false,
          },
          ...last5,
        ],
      };
    }),
  };
}

// ── Main Budget Guard ──

export class PromptBudgetGuard {
  private logger?: Logger;
  private originalChars: number = 0;
  private trimmedChars: number = 0;
  private tierReached: number = 0;

  /**
   * Enforce budget on a SessionSkeleton, applying tiers as needed.
   * Returns the (possibly trimmed) skeleton.
   */
  enforce(skeleton: SessionSkeleton): { skeleton: SessionSkeleton; trimmed: boolean } {
    this.originalChars = estimatePromptChars(skeleton);
    this.tierReached = 0;

    if (this.originalChars <= MAX_PROMPT_CHARS) {
      return { skeleton, trimmed: false };
    }

    let current = skeleton;

    // Tier 1: Compress cold zones
    current = applyTier1_CompressColdZones(current);
    this.tierReached = 1;
    if (estimatePromptChars(current) <= MAX_PROMPT_CHARS) {
      this.trimmedChars = estimatePromptChars(current);
      this.log();
      return { skeleton: current, trimmed: true };
    }

    // Tier 2: Downgrade low-suspicion hot zones
    current = applyTier2_DowngradeLowSuspicionHotZones(current);
    this.tierReached = 2;
    if (estimatePromptChars(current) <= MAX_PROMPT_CHARS) {
      this.trimmedChars = estimatePromptChars(current);
      this.log();
      return { skeleton: current, trimmed: true };
    }

    // Tier 3: Truncate per-step detail
    current = applyTier3_TruncateStepDetail(current);
    this.tierReached = 3;
    if (estimatePromptChars(current) <= MAX_PROMPT_CHARS) {
      this.trimmedChars = estimatePromptChars(current);
      this.log();
      return { skeleton: current, trimmed: true };
    }

    // Tier 4: Minimum viable context
    current = applyTier4_MinimumContext(current);
    this.tierReached = 4;
    this.trimmedChars = estimatePromptChars(current);
    this.log();
    return { skeleton: current, trimmed: true };
  }

  /**
   * Trim a raw string to maxChars. Simple truncation with marker.
   */
  trimString(prompt: string, maxChars: number = MAX_PROMPT_CHARS): string {
    if (prompt.length <= maxChars) return prompt;
    this.originalChars = prompt.length;
    this.tierReached = 4;
    const truncated = prompt.slice(0, maxChars - 100)
      + `\n\n... (prompt truncated from ${prompt.length} to ${maxChars} chars by Budget Guard) ...`;
    this.trimmedChars = truncated.length;
    this.log();
    return truncated;
  }

  setLogger(logger: Logger): void {
    this.logger = logger;
  }

  private log(): void {
    if (!this.logger) return;
    const level = this.tierReached >= 2 ? "warn" : "info";
    const msg = `[BudgetGuard] Tier ${this.tierReached}: trimmed from ${this.originalChars} to ${this.trimmedChars} chars`;
    if (level === "warn") {
      this.logger.warn("analysis", "BudgetGuard", msg);
    } else {
      this.logger.info("analysis", "BudgetGuard", msg);
    }
  }
}

// Singleton instance
export const budgetGuard = new PromptBudgetGuard();
