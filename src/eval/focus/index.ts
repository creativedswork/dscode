// ── Iterative Focusing Pipeline ──
// Orchestrates: buildSkeleton → scanSession → zoomZone (foreach) → synthesize → compose EvalResult.
// Activated when session has ≥500 steps.

import type { EvalResult, DeviationPoint, RootCause, HarnessRule, PhaseInfo } from "../types.js";
import type { HarnessAPI } from "../../core/harness-api.js";
import type { SerializedSession } from "../../session/types.js";
import { parseSessionToSteps, type Attribution } from "../schemas.js";
import { analyzeSession, compactSession } from "../analyzer.js";
import { attributeWithLLM } from "../rules/extraction.js";
import { buildSkeleton } from "./skeleton.js";
import { scanSession } from "./scan.js";
import { zoomZone } from "./zoom.js";
import { synthesize } from "./synthesize.js";
import type { FocusReport, SessionSkeleton, ScanResult, ZoneAnalysis, FocusAttribution } from "./types.js";

// ── Constants ──

/** Hardcoded threshold: ≥500 steps → focus pipeline, <500 → fast path */
export const FOCUS_PATH_THRESHOLD = 500;

// ── FocusReport → EvalResult Conversion ──

function composeEvalResult(
  ruleResult: EvalResult,
  report: FocusReport,
  rules: HarnessRule[],
): EvalResult {
  const { scan, zoneAnalyses, attribution, skeleton } = report;

  // Map FocusAttribution to existing Attribution type
  const evalAttribution: Attribution = {
    mistakeAgent: attribution.mistakeAgent,
    mistakeStep: attribution.mistakeStep,
    reason: attribution.reason,
    rulesApplied: attribution.rulesApplied as Attribution["rulesApplied"],
  };

  // Map AttentionZones to phases
  const phases: PhaseInfo[] = scan.zones.map((z) => ({
    label: `Zone ${z.id}: ${z.summary.slice(0, 60)}`,
    startIdx: z.stepStart,
    endIdx: z.stepEnd,
    status: z.suspicionScore > 0.7 ? "danger" : z.suspicionScore > 0.4 ? "warn" : "ok",
    summary: z.summary,
    toolCalls: { total: zoneAnalyses.find((a) => a.zoneId === z.id)?.subtasks.length ?? 0, errors: 0 },
  }));

  // Map zone candidates to deviations
  const deviations: DeviationPoint[] = zoneAnalyses.flatMap((za) =>
    za.candidates.map((c) => ({
      messageIdx: c.stepId,
      screenshotKeyword: c.dataItem,
      targetKeyword: "",
      severity: c.impactScore > 0.7 ? "high" : c.impactScore > 0.4 ? "medium" : "low",
      description: c.irrecoverableReason || (c.dataIssue ? `Data issue with ${c.dataItem}` : "Candidate error step"),
    } as DeviationPoint))
  );

  // Root causes
  const rootCauses: RootCause[] = [{
    title: `${attribution.mistakeAgent} at Step ${attribution.mistakeStep}`,
    description: attribution.reason,
    evidenceIndices: [attribution.mistakeStep],
    severity: "primary",
  }];

  return {
    metadata: ruleResult.metadata,
    stats: ruleResult.stats,
    phases,
    deviations,
    rootCauses,
    rules,
    analysisMode: "llm",
    timeline: ruleResult.timeline,
    causalGraph: null, // populated by the merged graph in synthesize
    attribution: evalAttribution,
    rulesApplied: attribution.rulesApplied,
    cascadePath: attribution.cascadePath,
  };
}

// ── Main Pipeline ──

export async function runFocusPipeline(
  data: SerializedSession,
  harness: HarnessAPI,
  ruleResult: EvalResult,
): Promise<EvalResult> {
  const steps = parseSessionToSteps(data);
  if (steps.length === 0) {
    return { ...ruleResult, rules: [] };
  }

  let totalLLMCalls = 0;

  // Build skeleton (deterministic, no LLM)
  const skeleton = buildSkeleton(steps, ruleResult);

  // Pass 1: Scan
  const scanResult = await scanSession(skeleton, harness);
  totalLLMCalls++;

  if (scanResult.noIssuesDetected) {
    // Early return — no significant issues found
    const rules = await attributeWithLLM(
      data, steps, ruleResult.stats, ruleResult.metadata,
      null, null, harness, ruleResult.metadata.sessionId, Date.now(),
    );
    return { ...ruleResult, rules, analysisMode: "rule" };
  }

  // Pass 2: Zoom each zone
  const zoneAnalyses: ZoneAnalysis[] = [];
  for (const zone of scanResult.zones) {
    const analysis = await zoomZone(zone, steps, harness);
    totalLLMCalls++;
    zoneAnalyses.push(analysis);
  }

  // Pass 3: Synthesize
  const { attribution, mergedGraph } = await synthesize(scanResult, zoneAnalyses, skeleton, harness);
  totalLLMCalls++;

  // Step 7: Rule extraction from focused context
  const rules = await attributeWithLLM(
    data, steps, ruleResult.stats, ruleResult.metadata,
    null, // graphStore not available for focus path
    {
      mistakeAgent: attribution.mistakeAgent,
      mistakeStep: attribution.mistakeStep,
      reason: attribution.reason,
      rulesApplied: attribution.rulesApplied as ("Rule1" | "Rule2" | "Rule3")[],
    },
    harness, ruleResult.metadata.sessionId, Date.now(),
  );

  const report: FocusReport = {
    skeleton,
    scan: scanResult,
    zoneAnalyses,
    attribution,
    analysisMode: "llm",
    totalLLMCalls,
  };

  const result = composeEvalResult(ruleResult, report, rules);
  result.causalGraph = mergedGraph;
  return result;
}
