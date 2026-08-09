// ── Iterative Focusing Pipeline ──
// Orchestrates: buildSkeleton → writeLibrary → runAgent(SCAN) → runAgent(ZOOM for each zone) → runAgent(SYNTHESIZE) → compose EvalResult.
// Activated when session has ≥500 steps.

import type { EvalResult, DeviationPoint, RootCause, HarnessRule, PhaseInfo } from "../types.js";
import type { EvalApplicationPort } from "../../application/harness-api.js";
import type { SerializedSession } from "../../session/types.js";
import { parseSessionToSteps, type Attribution } from "../schemas.js";
import type { SessionStats } from "../stats.js";
import { attributeWithLLM } from "../rules/extraction.js";
import { buildSkeleton } from "./skeleton.js";
import { scanSession } from "./scan.js";
import { zoomZone } from "./zoom.js";
import { synthesize } from "./synthesize.js";
import { createWorkspace, writeLibrary, cleanOldWorkspaces } from "./workspace.js";
import { ProgressDisplay, type CompletionSummary } from "./progress.js";
import type { FocusReport, SessionSkeleton, ScanResult, ZoneAnalysis, FocusAttribution } from "./types.js";
import type { Logger } from "../../utils/logger.js";

// ── Constants ──

export const FOCUS_PATH_THRESHOLD = 500;

// ── Helpers ──

const yieldTui = () => new Promise<void>((r) => setTimeout(r, 5));

// ── FocusReport → EvalResult Conversion ──

function composeEvalResult(sessionStats: SessionStats, report: FocusReport, rules: HarnessRule[]): EvalResult {
  const { scan, zoneAnalyses, attribution } = report;

  const evalAttribution: Attribution = {
    mistakeAgent: attribution.mistakeAgent,
    mistakeStep: attribution.mistakeStep,
    reason: attribution.reason,
    rulesApplied: attribution.rulesApplied as Attribution["rulesApplied"],
  };

  const phases: PhaseInfo[] = scan.zones.map((z) => ({
    label: `Zone ${z.id}: ${z.summary.slice(0, 60)}`,
    startIdx: z.stepStart,
    endIdx: z.stepEnd,
    status: z.suspicionScore > 0.7 ? "danger" : z.suspicionScore > 0.4 ? "warn" : "ok",
    summary: z.summary,
    toolCalls: { total: zoneAnalyses.find((a) => a.zoneId === z.id)?.subtasks.length ?? 0, errors: 0 },
  }));

  const deviations: DeviationPoint[] = zoneAnalyses.flatMap((za) =>
    za.candidates.map((c) => ({
      messageIdx: c.stepId,
      screenshotKeyword: c.dataItem,
      targetKeyword: "",
      severity: c.impactScore > 0.7 ? "high" : c.impactScore > 0.4 ? "medium" : "low",
      description: c.irrecoverableReason || (c.dataIssue ? `Data issue with ${c.dataItem}` : "Candidate error step"),
    } as DeviationPoint))
  );

  const rootCauses: RootCause[] = attribution.mistakeStep > 0 ? [{
    title: `${attribution.mistakeAgent} at Step ${attribution.mistakeStep}`,
    description: attribution.reason,
    evidenceIndices: [attribution.mistakeStep],
    severity: "primary",
  }] : [];

  return {
    metadata: sessionStats.metadata,
    stats: sessionStats.stats,
    agentStats: sessionStats.agentStats,
    phases,
    deviations,
    rootCauses,
    rules,
    timeline: [],
    causalGraph: null,
    attribution: evalAttribution,
    rulesApplied: attribution.rulesApplied,
    cascadePath: attribution.cascadePath,
    recoveryArcs: attribution.recoveryArcs,
  };
}

// ── Main Pipeline ──

export async function runFocusPipeline(
  data: SerializedSession,
  harness: EvalApplicationPort,
  sessionStats: SessionStats,
  onLog?: (text: string) => void,
  logger?: Logger,
): Promise<EvalResult> {
  const steps = parseSessionToSteps(data);
  const sessionId = sessionStats.metadata.sessionId;

  if (steps.length === 0) {
    return { metadata: sessionStats.metadata, stats: sessionStats.stats, agentStats: sessionStats.agentStats, phases: [], deviations: [], rootCauses: [], rules: [], timeline: [], causalGraph: null, attribution: null, rulesApplied: [] };
  }

  const pipelineStart = Date.now();
  let totalLLMCalls = 0;
  if (logger) logger.info("FocusPipeline", `Start: ${steps.length} steps, session ${sessionId.slice(0, 8)}`);

  const progress = new ProgressDisplay({ onLog, logger });

  // ═══ Phase 0: Build Skeleton + Write Library ═══
  progress.onPhaseStart(0);
  await yieldTui();

  const ruleResult: EvalResult = {
    metadata: sessionStats.metadata, stats: sessionStats.stats, agentStats: sessionStats.agentStats,
    phases: [], deviations: [], timeline: [], rootCauses: [],
    rules: [], causalGraph: null, attribution: null, rulesApplied: [],
  };
  const skeleton = buildSkeleton(steps, ruleResult);
  const workspacePath = createWorkspace(sessionId);
  const { fileCount } = writeLibrary(skeleton, steps, ruleResult, "SCAN", workspacePath);
  cleanOldWorkspaces(10);
  if (logger) logger.info("Phase0", `Library: ${fileCount} files → ${workspacePath}`);

  progress.onPhaseDone(0, `写入 ${fileCount} 个文件`, Date.now() - pipelineStart);
  await yieldTui();

  // ═══ Phase 1: SCAN Agent ═══
  progress.onPhaseStart(1);
  await yieldTui();

  const scanResult = await scanSession(skeleton, harness, workspacePath, sessionId, progress);
  totalLLMCalls++;

  const scanSummary = scanResult.noIssuesDetected
    ? "未检测到问题"
    : `识别到 ${scanResult.zones.length} 个 attention zones: ${scanResult.zones.map((z) => z.id).join(", ")}`;
  if (logger) logger.info("SCAN", scanSummary);

  progress.onPhaseDone(1, scanSummary, Date.now() - pipelineStart);
  await yieldTui();

  if (scanResult.noIssuesDetected || scanResult.zones.length === 0) {
    progress.dispose();
    const rules = await attributeWithLLM(
      data, steps, sessionStats.stats, sessionStats.metadata,
      null, null, harness, sessionStats.metadata.sessionId, Date.now(), logger,
    );
    if (logger) logger.info("FocusPipeline", "Early exit: no issues detected");
    return { ...sessionStats, phases: [], deviations: [], rootCauses: [], rules, timeline: [], causalGraph: null, attribution: null, rulesApplied: [] };
  }

  // ═══ Phase 2: ZOOM Agent (one per zone) ═══
  progress.onPhaseStart(2);
  await yieldTui();

  progress.setSubZones(2, scanResult.zones.map((z) => ({
    id: z.id, label: `Zone ${z.id} [${z.stepStart}-${z.stepEnd}]`,
  })));

  const zoneAnalyses: ZoneAnalysis[] = [];
  for (const zone of scanResult.zones) {
    try {
      const analysis = await zoomZone(zone, steps, harness, workspacePath, sessionId, skeleton, 0, progress);
      totalLLMCalls += analysis.zoneGraphComplete ? 1 : 2;
      zoneAnalyses.push(analysis);
    } catch {
      zoneAnalyses.push({ zoneId: zone.id, subtasks: [], subtaskEdges: [], agentNodes: [], agentEdges: [], stepDataFlows: [], candidates: [], topCandidate: null, zoneGraphComplete: false });
    }
  }
  if (logger) logger.info("ZOOM", `${zoneAnalyses.length} zones, ${zoneAnalyses.filter((z) => z.zoneGraphComplete).length} complete`);

  progress.onPhaseDone(2, `${zoneAnalyses.length} zones 分析完成`, Date.now() - pipelineStart);
  await yieldTui();

  // ═══ Phase 3: SYNTHESIZE Agent ═══
  progress.onPhaseStart(3);
  await yieldTui();

  const { attribution, mergedGraph } = await synthesize(
    scanResult, zoneAnalyses, skeleton, harness, workspacePath, sessionId, progress,
  );
  totalLLMCalls++;

  const synthSummary = attribution.mistakeStep > 0
    ? `根因: ${attribution.mistakeAgent}@Step ${attribution.mistakeStep}`
    : "归因完成";
  if (logger) logger.info("SYNTH", synthSummary);

  progress.onPhaseDone(3, synthSummary, Date.now() - pipelineStart);
  await yieldTui();

  // ═══ Phase 4: Rule Extraction ═══
  progress.onPhaseStart(4);
  await yieldTui();

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
  if (logger) logger.info("Phase4", `${rules.length} rules extracted`);

  progress.onPhaseDone(4, `${rules.length} 条规则`, Date.now() - pipelineStart);

  // ═══ Completion ═══
  const totalDuration = Date.now() - pipelineStart;
  const keyFindings = attribution.mistakeStep > 0
    ? `根因: ${attribution.mistakeAgent}@Step ${attribution.mistakeStep}`
    : "未检测到明确根因";
  if (logger) logger.info("FocusPipeline", `Done: ${(totalDuration / 1000).toFixed(1)}s, ${totalLLMCalls} LLM calls, ${keyFindings}`);

  progress.showCompletion({ totalDurationMs: totalDuration, totalLLMCalls, keyFindings });
  progress.dispose();

  const report: FocusReport = { skeleton, scan: scanResult, zoneAnalyses, attribution, totalLLMCalls };
  const result = composeEvalResult(sessionStats, report, rules);
  result.causalGraph = mergedGraph;
  return result;
}
