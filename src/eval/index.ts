// ── Eval Module Entry Point ──
// Orchestrates session analysis: load, analyze (LLM or rule engine), dashboard, open.

import { homedir } from "node:os";
import { join } from "node:path";
import type { HarnessAPI } from "../core/harness-api.js";
import type { UiBackend } from "../ui/backend.js";
import type { SerializedSession } from "../session/types.js";
import { Logger } from "../utils/logger.js";
import { computeStats } from "./stats.js";
import { generateDashboard, openDashboard } from "./dashboard.js";
import { analyzeWithLLM } from "./llm.js";
import { loadRuleStore, semanticMerge, saveRuleStore } from "./rules/store.js";
import { loadMultiAgentTrajectory } from "./trajectory.js";
import { runChiefPipeline, type ChiefProgressEvent } from "./chief/pipeline.js";
import {
  createEvalRun,
  finishEvalRun,
  updateRunStage,
  type EvalRunContext,
} from "./chief/workspace.js";

function evalDir(): string {
  return join(homedir(), ".dscode", "eval");
}

export async function runEval(
  sessionId: string | null,
  ctx: { harness: HarnessAPI; ui: UiBackend },
): Promise<void> {
  const { harness, ui } = ctx;
  const manager = harness.sessionManager;
  const runtimeId = process.env.DSCODE_RUNTIME_ID ?? "unknown";
  const evalLogger = new Logger({ type: "harness", id: runtimeId });
  let activeRun: EvalRunContext | undefined;

  try {
    // Resolve session ID
    let resolvedId: string;
    let sessionData: SerializedSession | null = null;

    if (sessionId) {
      const found = manager.getSessionFilePath(sessionId);
      if (!found) {
        (ui as any).addError(`Session not found: ${sessionId}`);
        return;
      }
      resolvedId = found.metadata.id;
      sessionData = await manager.loadSessionFile(resolvedId);
      if (!sessionData) {
        (ui as any).addError(`Failed to load session: ${resolvedId}`);
        return;
      }
    } else {
      const currentId = manager.getCurrentSessionId();
      if (!currentId) {
        (ui as any).addError("No session to evaluate. Usage: /eval [session_id]");
        return;
      }
      resolvedId = currentId;
      sessionData = await manager.loadSessionFile(resolvedId);
      if (!sessionData) {
        // Session is current but not yet persisted; save it first
        harness.saveSessionNow();
        sessionData = await manager.loadSessionFile(resolvedId);
        if (!sessionData) {
          (ui as any).addError("Failed to load current session data.");
          return;
        }
      }
    }

    evalLogger.clear();
    (ui as any).addInfo(`正在分析 session ${resolvedId.slice(0, 8)}...`);

    // onLog pushes to TUI only — no terminal output
    const onLog = (msg: string) => { (ui as any).addInfo(msg); };

    const trajectory = await loadMultiAgentTrajectory(sessionData, harness.agentSupervisor);
    const invokingSessionId = manager.getCurrentSessionId() ?? resolvedId;
    const run = await createEvalRun(trajectory, invokingSessionId);
    activeRun = run;
    const evalStartedAt = Date.now();
    const reportProgress = (event: ChiefProgressEvent) => {
      const marker = event.status === "done" ? "OK" : event.status === "failed" ? "FAILED" : "...";
      const worker = event.workerAgentId ? ` (${event.workerAgentId.slice(0, 6)})` : "";
      onLog(`[${event.index}/${event.total}] ${event.application}${worker} ${marker}`);
    };
    onLog(
      `CHIEF: ${trajectory.steps.length} Steps, ${trajectory.actors.length} Agents, ` +
      `${trajectory.evidence.completeness} evidence`,
    );
    const result = await runChiefPipeline({
      trajectory,
      harness,
      run,
      logger: evalLogger,
      onProgress: reportProgress,
    });
    // Step 8: LLM semantic rule merge (use session's projectPath, not harness cwd)
    const projectPath = sessionData?.metadata?.projectPath ?? harness.config?.projectPath;
    if (projectPath) {
      const store = loadRuleStore(projectPath, evalLogger);
      const merged = await semanticMerge(result.rules, store, harness, evalLogger);
      saveRuleStore(merged, evalLogger);
    }
    const dashboardStartedAt = Date.now();
    await updateRunStage(run, "dashboard", {
      status: "running",
      application: "coordinator",
    });
    reportProgress({
      runId: run.manifest.runId,
      targetSessionId: resolvedId,
      stage: "dashboard",
      application: "coordinator",
      index: 7,
      total: 7,
      status: "running",
      message: "Generating Dashboard",
    });
    const runOutputPath = join(run.outputDir, "dashboard.html");
    generateDashboard(result, runOutputPath);
    const outputPath = join(evalDir(), `${resolvedId.slice(0, 8)}.html`);
    generateDashboard(result, outputPath);
    await updateRunStage(run, "dashboard", {
      status: "done",
      application: "coordinator",
    });
    reportProgress({
      runId: run.manifest.runId,
      targetSessionId: resolvedId,
      stage: "dashboard",
      application: "coordinator",
      index: 7,
      total: 7,
      status: "done",
      durationMs: Date.now() - dashboardStartedAt,
      message: "Dashboard generated",
    });
    await finishEvalRun(run, "completed");
    activeRun = undefined;

    // Open in browser
    openDashboard(outputPath);

    const analysisLabel = "CHIEF Multi-Agent";
    const attributionInfo = result.attribution
      ? ` | Root cause: ${result.attribution.mistakeAgent}@${result.attribution.mistakeStep === null ? "Agent" : `Step${result.attribution.mistakeStep}`}`
      : "";
    const confidence = result.attribution && "confidence" in result.attribution
      ? ` | Confidence: ${(result.attribution.confidence * 100).toFixed(0)}%`
      : "";
    const rulesTriggered = result.rules ? result.rules.length : 0;
    const workerCount = harness.agentSupervisor.list().filter((process) =>
      process.recording === "process-only"
      && process.role === "subagent"
      && process.context.cwd === run.runRoot
    ).length;
    (ui as any).addInfo(
      `Dashboard generated: ${outputPath}\n` +
      `[${analysisLabel}] Target: ${resolvedId.slice(0, 8)} | Duration: ${Date.now() - evalStartedAt}ms | ` +
      `Workers: ${workerCount} | Actors: ${trajectory.actors.length} | Evidence: ${trajectory.evidence.completeness} | ` +
      `Tool calls: ${result.stats.toolCalls} | Error rate: ${result.stats.errorRate}${attributionInfo}${confidence} | Rules: ${rulesTriggered}`,
    );
  } catch (err) {
    if (activeRun?.manifest.status === "active") {
      await finishEvalRun(activeRun, "failed").catch(() => undefined);
    }
    evalLogger.error("Pipeline", `crash: ${err instanceof Error ? err.message : String(err)}`);
    if (err instanceof Error && err.stack) {
      evalLogger.error("Pipeline", `stack:\n${err.stack}`);
    }
    (ui as any).addError(`eval: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export { computeStats, generateDashboard, openDashboard, analyzeWithLLM };
export type { EvalResult, PhaseInfo, DeviationPoint, RootCause, SessionMeta, ToolStats, TimelineEvent, CompactMessage, HarnessRule } from "./types.js";
export type { SessionSkeleton, FocusReport, AttentionZone, ZoneAnalysis, ScanResult, FocusAttribution, CascadeEdge } from "./focus/types.js";
export { buildSkeleton } from "./focus/skeleton.js";
