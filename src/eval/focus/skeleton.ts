// ── Session Skeleton Builder ──
// Deterministic (no LLM) conversion of rule engine output into a
// structured SessionSkeleton for Pass 1 Scan input.

import type { EvalResult } from "../types.js";
import type { HistoryStep } from "../schemas.js";
import type {
  SessionSkeleton,
  SkeletonMeta,
  SkeletonStats,
  PhaseEntry,
  SignalAnchor,
  SignalType,
  SignalPriority,
  HotZone,
  HotZoneStep,
  ColdZone,
  DataItemTracking,
} from "./types.js";

// ── Constants ──

const SIGNAL_EXPAND_RADIUS = 5;
const HOT_STEP_ACTION_MAX = 150;
const HOT_STEP_THOUGHT_MAX = 100;
const HOT_STEP_RESULT_MAX = 200;
const HOT_DATA_ITEM_THRESHOLD = 10;

// ── Build Functions ──

function buildMeta(ruleResult: EvalResult, totalSteps: number, totalMessages: number): SkeletonMeta {
  return {
    question: ruleResult.metadata.title || "Unknown task",
    totalSteps,
    totalMessages,
    errorRate: ruleResult.stats.errorRate,
    duration: ruleResult.metadata.duration,
    model: ruleResult.metadata.model,
  };
}

function buildStats(ruleResult: EvalResult): SkeletonStats {
  return {
    toolCalls: ruleResult.stats.toolCalls,
    toolErrors: ruleResult.stats.toolErrors,
    userComplaints: ruleResult.stats.userComplaints,
    screenshotsTaken: ruleResult.stats.screenshotsTaken,
  };
}

function buildPhases(ruleResult: EvalResult): PhaseEntry[] {
  return ruleResult.phases.map((p, i) => ({
    id: `P${i + 1}`,
    label: p.label,
    stepRange: `${p.startIdx}-${p.endIdx}`,
    status: p.status,
    toolSummary: `${p.toolCalls.total} calls, ${p.toolCalls.errors} errors`,
  }));
}

function buildSignalAnchors(
  steps: HistoryStep[],
  ruleResult: EvalResult,
): SignalAnchor[] {
  const anchors: SignalAnchor[] = [];

  // Map stepId → messageIdx for lookup
  const stepByMessageIdx = new Map<number, HistoryStep>();
  for (const s of steps) {
    stepByMessageIdx.set(s.messageIdx, s);
  }

  // User complaints from timeline
  for (const event of ruleResult.timeline) {
    if (event.type === "complaint") {
      const step = stepByMessageIdx.get(event.messageIdx);
      anchors.push({
        stepId: step?.stepId ?? event.messageIdx,
        type: "user_complaint" as SignalType,
        label: event.label.slice(0, 100),
        priority: "high" as SignalPriority,
      });
    }
  }

  // Tool errors from steps
  for (const s of steps) {
    if (s.isError) {
      anchors.push({
        stepId: s.stepId,
        type: "tool_error" as SignalType,
        label: `${s.agent}: ${s.result.slice(0, 70)}`.slice(0, 100),
        priority: "high" as SignalPriority,
      });
    }
  }

  // Screenshot divergences from deviations
  for (const dev of ruleResult.deviations) {
    anchors.push({
      stepId: dev.messageIdx,
      type: "screenshot_divergence" as SignalType,
      label: dev.description.slice(0, 100),
      priority: dev.severity === "high" ? "high" : "medium",
    });
  }

  // Phase boundaries
  for (const phase of ruleResult.phases) {
    anchors.push({
      stepId: phase.startIdx,
      type: "phase_boundary" as SignalType,
      label: `Phase start: ${phase.label}`.slice(0, 100),
      priority: "medium" as SignalPriority,
    });
  }

  // Root cause evidence
  for (const rc of ruleResult.rootCauses) {
    for (const idx of rc.evidenceIndices) {
      anchors.push({
        stepId: idx,
        type: "root_cause_evidence" as SignalType,
        label: rc.title.slice(0, 100),
        priority: rc.severity === "primary" ? "high" : "medium",
      });
    }
  }

  // Deduplicate by stepId + type
  const seen = new Set<string>();
  return anchors.filter((a) => {
    const key = `${a.stepId}|${a.type}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((a, b) => a.stepId - b.stepId);
}

function buildHotColdZones(
  steps: HistoryStep[],
  anchors: SignalAnchor[],
): { hotZones: HotZone[]; coldZones: ColdZone[] } {
  if (anchors.length === 0) {
    // Entire session is cold
    return {
      hotZones: [],
      coldZones: [buildColdZone(steps, 0, steps.length > 0 ? steps[steps.length - 1].stepId : 0)],
    };
  }

  // Expand anchors by ±5 steps
  const expanded: Array<{ start: number; end: number; signals: SignalAnchor[] }> = [];
  for (const a of anchors) {
    const start = Math.max(0, a.stepId - SIGNAL_EXPAND_RADIUS);
    const end = a.stepId + SIGNAL_EXPAND_RADIUS;
    expanded.push({ start, end, signals: [a] });
  }

  // Sort by start
  expanded.sort((a, b) => a.start - b.start);

  // Merge overlapping
  const merged: Array<{ start: number; end: number; signals: SignalAnchor[] }> = [];
  for (const r of expanded) {
    if (merged.length === 0) {
      merged.push({ ...r, signals: [...r.signals] });
      continue;
    }
    const last = merged[merged.length - 1];
    if (r.start <= last.end + 1) {
      last.end = Math.max(last.end, r.end);
      last.signals.push(...r.signals);
    } else {
      merged.push({ ...r, signals: [...r.signals] });
    }
  }

  // Build step lookup by stepId
  const stepMap = new Map<number, HistoryStep>();
  for (const s of steps) stepMap.set(s.stepId, s);

  // Deduplicate signals within merged ranges
  // Build Hot Zones from merged ranges
  const hotZones: HotZone[] = [];
  for (let i = 0; i < merged.length; i++) {
    const r = merged[i];
    const zoneSteps: HotZoneStep[] = [];
    for (const s of steps) {
      if (s.stepId >= r.start && s.stepId <= r.end) {
        zoneSteps.push({
          stepId: s.stepId,
          agent: s.agent,
          action: s.action.slice(0, HOT_STEP_ACTION_MAX),
          thought: s.thought.slice(0, HOT_STEP_THOUGHT_MAX),
          result: s.result.slice(0, HOT_STEP_RESULT_MAX),
          isError: s.isError,
        });
      }
    }

    // Deduplicate signals by type+stepId
    const signalMap = new Map<string, SignalAnchor>();
    for (const sig of r.signals) {
      const key = `${sig.stepId}|${sig.type}`;
      if (!signalMap.has(key) || sig.priority === "high") {
        signalMap.set(key, sig);
      }
    }
    const deduped = [...signalMap.values()];

    // Primary signal = highest priority most common type
    const highCount = deduped.filter((s) => s.priority === "high").length;
    const primaryType = highCount > 0
      ? (deduped.find((s) => s.priority === "high") ?? deduped[0]).type
      : deduped[0]?.type ?? "phase_boundary";

    // Suspicion score based on signal density and priority
    const density = deduped.length / Math.max(1, r.end - r.start + 1);
    const highRatio = deduped.length > 0 ? highCount / deduped.length : 0;
    const suspicionScore = Math.min(1.0, density * 0.5 + highRatio * 0.5);

    hotZones.push({
      stepStart: r.start,
      stepEnd: r.end,
      suspicionScore,
      primarySignal: primaryType,
      signals: deduped,
      steps: zoneSteps,
    });
  }

  // Build Cold Zones from gaps between Hot Zones
  const coldZones: ColdZone[] = [];
  const minStepId = steps.length > 0 ? steps[0].stepId : 0;
  const maxStepId = steps.length > 0 ? steps[steps.length - 1].stepId : 0;

  let cursor = minStepId;
  for (const hz of hotZones.sort((a, b) => a.stepStart - b.stepStart)) {
    if (hz.stepStart > cursor) {
      coldZones.push(buildColdZone(steps, cursor, hz.stepStart - 1));
    }
    cursor = Math.max(cursor, hz.stepEnd + 1);
  }
  if (cursor <= maxStepId) {
    coldZones.push(buildColdZone(steps, cursor, maxStepId));
  }

  return { hotZones, coldZones };
}

function buildColdZone(steps: HistoryStep[], startId: number, endId: number): ColdZone {
  const toolCountByAgent: Record<string, number> = {};
  let errorCount = 0;
  let userMessages = 0;

  for (const s of steps) {
    if (s.stepId >= startId && s.stepId <= endId) {
      toolCountByAgent[s.agent] = (toolCountByAgent[s.agent] ?? 0) + 1;
      if (s.isError) errorCount++;
      // Count user messages (observation that looks like user input)
      if (s.observation && !s.observation.startsWith("Tool result")) {
        userMessages++;
      }
    }
  }

  return {
    stepRange: `${startId}-${endId}`,
    toolCountByAgent,
    errorCount,
    userMessages,
  };
}

function buildDataItemTracker(steps: HistoryStep[]): DataItemTracking[] {
  const itemMap = new Map<string, { stepIds: number[]; agents: Set<string> }>();

  for (const s of steps) {
    // Extract path from action string: "toolName(path='...')" or "toolName(key=val, path='...')"
    const pathMatch = s.action.match(/path\s*=\s*['"]([^'"]+)['"]/);
    const fileMatch = s.action.match(/file\s*=\s*['"]([^'"]+)['"]/);
    const matched = pathMatch?.[1] ?? fileMatch?.[1];
    if (!matched) continue;
    // Filter out non-file paths
    if (matched.startsWith("/") || matched.startsWith("./") || matched.startsWith("../") || matched.includes(".")) {
      if (!itemMap.has(matched)) {
        itemMap.set(matched, { stepIds: [], agents: new Set() });
      }
      const entry = itemMap.get(matched)!;
      entry.stepIds.push(s.stepId);
      entry.agents.add(s.agent);
    }
  }

  const items: DataItemTracking[] = [];
  for (const [dataItem, entry] of itemMap) {
    if (entry.stepIds.length >= 2) {
      items.push({
        dataItem,
        operationCount: entry.stepIds.length,
        stepIds: entry.stepIds,
        agents: [...entry.agents],
        isHot: entry.stepIds.length > HOT_DATA_ITEM_THRESHOLD,
      });
    }
  }

  return items.sort((a, b) => b.operationCount - a.operationCount);
}

// ── Main ──

export function buildSkeleton(
  steps: HistoryStep[],
  ruleResult: EvalResult,
): SessionSkeleton {
  const totalMessages = ruleResult.metadata.totalMessages;

  const meta = buildMeta(ruleResult, steps.length, totalMessages);
  const stats = buildStats(ruleResult);
  const phases = buildPhases(ruleResult);
  const anchors = buildSignalAnchors(steps, ruleResult);
  const { hotZones, coldZones } = buildHotColdZones(steps, anchors);
  const dataItems = buildDataItemTracker(steps);

  return {
    meta,
    stats,
    phases,
    signalAnchors: anchors,
    hotZones,
    coldZones,
    dataItems,
  };
}
