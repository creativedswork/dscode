// ── Iterative Focusing Pipeline ──
// Orchestrates: buildSkeleton → writeLibrary → runAgent(SCAN) → runAgent(ZOOM for each zone) → runAgent(SYNTHESIZE) → compose EvalResult.
// Activated when session has ≥500 steps.

import type { EvalResult, DeviationPoint, RootCause, HarnessRule, PhaseInfo } from "../types.js";
import type { HarnessAPI } from "../../core/harness-api.js";
import type { SerializedSession } from "../../session/types.js";
import { parseSessionToSteps, type Attribution } from "../schemas.js";
import { computeStats, type SessionStats } from "../stats.js";
import { attributeWithLLM } from "../rules/extraction.js";
import { buildSkeleton } from "./skeleton.js";
import { scanSession } from "./scan.js";
import { zoomZone } from "./zoom.js";
import { synthesize } from "./synthesize.js";
import { createWorkspace, writeLibrary, cleanOldWorkspaces } from "./workspace.js";
import { ProgressDisplay, type CompletionSummary } from "./progress.js";
import type { FocusReport, SessionSkeleton, ScanResult, ZoneAnalysis, FocusAttribution } from "./types.js";

// ── Constants ──

/** Hardcoded threshold: ≥500 steps → focus pipeline, <500 → fast path */
export const FOCUS_PATH_THRESHOLD = 500;

// ── FocusReport → EvalResult Conversion ──

function composeEvalResult(
  sessionStats: SessionStats,
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
  const rootCauses: RootCause[] = attribution.mistakeStep > 0 ? [{
    title: `${attribution.mistakeAgent} at Step ${attribution.mistakeStep}`,
    description: attribution.reason,
    evidenceIndices: [attribution.mistakeStep],
    severity: "primary",
  }] : [];

  return {
    metadata: sessionStats.metadata,
    stats: sessionStats.stats,
    phases,
    deviations,
    rootCauses,
    rules,

    timeline: [],
    causalGraph: null, // populated by the merged graph in synthesize
    attribution: evalAttribution,
    rulesApplied: attribution.rulesApplied,
    cascadePath: attribution.cascadePath,
    recoveryArcs: attribution.recoveryArcs,
  };
}

// ── Main Pipeline ──

export async function runFocusPipeline(
  data: SerializedSession,
  harness: HarnessAPI,
  sessionStats: SessionStats,
  onLog?: (text: string) => void,
): Promise<EvalResult> {
  const steps = parseSessionToSteps(data);
  const sessionId = sessionStats.metadata.sessionId;

  if (steps.length === 0) {
    return { metadata: sessionStats.metadata, stats: sessionStats.stats, phases: [], deviations: [], rootCauses: [], rules: [], timeline: [], causalGraph: null, attribution: null, rulesApplied: [] };
  }

  const pipelineStart = Date.now();
  let totalLLMCalls = 0;

  const progress = new ProgressDisplay(false, onLog);

  // ── Phase 0: Build Skeleton + Write Library ──
  progress.onPhaseStart(0);

  const ruleResult: EvalResult = {
    metadata: sessionStats.metadata,
    stats: sessionStats.stats,
    phases: [],
    deviations: [],
    timeline: [],
    rootCauses: [],
    rules: [],
    causalGraph: null,
    attribution: null,
    rulesApplied: [],
  };
  const skeleton = buildSkeleton(steps, ruleResult);

  const workspacePath = createWorkspace(sessionId);
  const { fileCount } = writeLibrary(skeleton, steps, ruleResult, "SCAN", workspacePath);

  // Clean old workspaces
  cleanOldWorkspaces(10);

  progress.onPhaseDone(0, `写入 ${fileCount} 个文件`, Date.now() - pipelineStart);

  // ── Pass 1: SCAN Agent ──
  progress.onPhaseStart(1);

  const scanResult = await scanSession(skeleton, harness, workspacePath, sessionId, progress);
  totalLLMCalls++;

  progress.onPhaseDone(
    1,
    scanResult.noIssuesDetected
      ? "未检测到问题"
      : `识别到 ${scanResult.zones.length} 个 attention zones: ${scanResult.zones.map((z) => z.id).join(", ")}`,
    Date.now() - pipelineStart,
  );

  if (scanResult.noIssuesDetected || scanResult.zones.length === 0) {
    progress.dispose();
    const rules = await attributeWithLLM(
      data, steps, sessionStats.stats, sessionStats.metadata,
      null, null, harness, sessionStats.metadata.sessionId, Date.now(),
    );
    return {
      ...sessionStats,
      phases: [],
      deviations: [],
      rootCauses: [],
      rules,
      timeline: [],
      causalGraph: null,
      attribution: null,
      rulesApplied: [],
    };
  }

  // ── Pass 2: ZOOM Agent (one per zone) ──
  progress.onPhaseStart(2);
  progress.setSubZones(2, scanResult.zones.map((z) => ({
    id: z.id,
    label: `Zone ${z.id} [${z.stepStart}-${z.stepEnd}]`,
  })));

  const zoneAnalyses: ZoneAnalysis[] = [];
  for (const zone of scanResult.zones) {
    try {
      const analysis = await zoomZone(
        zone, steps, harness, workspacePath, sessionId, skeleton, 0, progress,
      );
      totalLLMCalls += analysis.zoneGraphComplete ? 1 : 2; // estimate
      zoneAnalyses.push(analysis);
    } catch {
      // Zone failed — push empty analysis
      zoneAnalyses.push({
        zoneId: zone.id,
        subtasks: [],
        subtaskEdges: [],
        agentNodes: [],
        agentEdges: [],
        stepDataFlows: [],
        candidates: [],
        topCandidate: null,
        zoneGraphComplete: false,
      });
    }
  }

  progress.onPhaseDone(
    2,
    `${zoneAnalyses.length} zones 分析完成`,
    Date.now() - pipelineStart,
  );

  // ── Pass 3: SYNTHESIZE Agent ──
  progress.onPhaseStart(3);

  const { attribution, mergedGraph } = await synthesize(
    scanResult, zoneAnalyses, skeleton, harness, workspacePath, sessionId, progress,
  );
  totalLLMCalls++;

  progress.onPhaseDone(
    3,
    attribution.mistakeStep > 0
      ? `根因: ${attribution.mistakeAgent}@Step ${attribution.mistakeStep}`
      : "归因完成",
    Date.now() - pipelineStart,
  );

  // ── Phase 4: Rule Extraction ──
  progress.onPhaseStart(4);

  const rules = await attributeWithLLM(
    data, steps, sessionStats.stats, sessionStats.metadata,
    null,
    attribution.mistakeStep > 0 ? {
      mistakeAgent: attribution.mistakeAgent,
      mistakeStep: attribution.mistakeStep,
      reason: attribution.reason,
      rulesApplied: attribution.rulesApplied as ("Rule1" | "Rule2" | "Rule3")[],
    } : null,
    harness, sessionStats.metadata.sessionId, Date.now(),
  );

  progress.onPhaseDone(4, `${rules.length} 条规则`, Date.now() - pipelineStart);

  // ── Completion Summary ──
  const totalDuration = Date.now() - pipelineStart;
  const keyFindings = attribution.mistakeStep > 0
    ? `根因: ${attribution.mistakeAgent}@Step ${attribution.mistakeStep}`
    : "未检测到明确根因";

  progress.showCompletion({
    totalDurationMs: totalDuration,
    totalLLMCalls,
    keyFindings,
  });
  progress.dispose();

  // ── Compose Result ──
  const report: FocusReport = {
    skeleton,
    scan: scanResult,
    zoneAnalyses,
    attribution,
    totalLLMCalls,
  };

  const result = composeEvalResult(sessionStats, report, rules);
  result.causalGraph = mergedGraph;

  return result;
}
