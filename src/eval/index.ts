// ── Eval Module Entry Point ──
// Orchestrates session analysis: load, analyze (LLM or rule engine), dashboard, open.

import { homedir } from "node:os";
import { join } from "node:path";
import type { HarnessAPI } from "../core/harness-api.js";
import type { UiBackend } from "../ui/backend.js";
import { formatAgentDisplayId } from "../ui/shared/agent-id.js";
import type { SerializedSession } from "../session/types.js";
import { Logger } from "../utils/logger.js";
import { computeStats } from "./stats.js";
import { generateDashboard, generateDashboardArtifacts, openDashboard } from "./dashboard.js";
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
  const evalStartedAt = Date.now();
  const requestedSessionId = sessionId ?? undefined;
  let activeRun: EvalRunContext | undefined;
  let resolvedTargetSessionId: string | undefined;

  harness.events.emit({
    type: "eval:dashboard",
    state: {
      status: "starting",
      requestedSessionId,
      startedAt: evalStartedAt,
    },
  });

  const failBeforeRun = (error: string, targetSessionId?: string) => {
    harness.events.emit({
      type: "eval:dashboard",
      state: {
        status: "failed",
        requestedSessionId,
        targetSessionId,
        error,
      },
    });
    (ui as any).addError(error);
  };

  try {
    // Resolve session ID
    let resolvedId: string;
    let sessionData: SerializedSession | null = null;

    if (sessionId) {
      const found = manager.getSessionFilePath(sessionId);
      if (!found) {
        failBeforeRun(`Session not found: ${sessionId}`);
        return;
      }
      resolvedId = found.metadata.id;
      resolvedTargetSessionId = resolvedId;
      sessionData = await manager.loadSessionFile(resolvedId);
      if (!sessionData) {
        failBeforeRun(`Failed to load session: ${resolvedId}`, resolvedId);
        return;
      }
    } else {
      const currentId = manager.getCurrentSessionId();
      if (!currentId) {
        failBeforeRun("No session to evaluate. Usage: /eval [session_id]");
        return;
      }
      resolvedId = currentId;
      resolvedTargetSessionId = resolvedId;
      sessionData = await manager.loadSessionFile(resolvedId);
      if (!sessionData) {
        // Session is current but not yet persisted; save it first
        harness.saveSessionNow();
        sessionData = await manager.loadSessionFile(resolvedId);
        if (!sessionData) {
          failBeforeRun("Failed to load current session data.", resolvedId);
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
    const reportProgress = (event: ChiefProgressEvent) => {
      const marker = event.status === "done" ? "OK" : event.status === "failed" ? "FAILED" : "...";
      const worker = event.workerAgentId ? ` (${formatAgentDisplayId(event.workerAgentId)})` : "";
      onLog(`[${event.index}/${event.total}] ${event.application}${worker} ${marker}`);
      harness.events.emit({
        type: "eval:dashboard",
        state: {
          status: "running",
          targetSessionId: event.targetSessionId,
          runId: event.runId,
          stage: event.stage,
          stageStatus: event.status,
          index: event.index,
          total: event.total,
          application: event.application,
          workerAgentId: event.workerAgentId,
          retryCount: event.retryCount,
          durationMs: event.durationMs,
          message: event.message,
          startedAt: evalStartedAt,
          actorCount: trajectory.actors.length,
          stepCount: trajectory.steps.length,
          evidence: trajectory.evidence,
        },
      });
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
    const outputPath = join(evalDir(), `${resolvedId.slice(0, 8)}.html`);
    const html = generateDashboardArtifacts(result, [runOutputPath, outputPath]);
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

    harness.events.emit({
      type: "eval:dashboard",
      state: {
        status: "completed",
        targetSessionId: resolvedId,
        runId: run.manifest.runId,
        html,
        outputPath,
        generatedAt: Date.now(),
      },
    });

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
    const error = err instanceof Error ? err.message : String(err);
    evalLogger.error("Pipeline", `crash: ${error}`);
    if (err instanceof Error && err.stack) {
      evalLogger.error("Pipeline", `stack:\n${err.stack}`);
    }
    harness.events.emit({
      type: "eval:dashboard",
      state: {
        status: "failed",
        requestedSessionId,
        targetSessionId: activeRun?.manifest.targetSessionId ?? resolvedTargetSessionId,
        runId: activeRun?.manifest.runId,
        stage: activeRun?.manifest.currentStage,
        error,
      },
    });
    (ui as any).addError(`eval: ${error}`);
  }
}

export { computeStats, generateDashboard, openDashboard, analyzeWithLLM };
export type { EvalResult, PhaseInfo, DeviationPoint, RootCause, SessionMeta, ToolStats, TimelineEvent, CompactMessage, HarnessRule } from "./types.js";
export type { SessionSkeleton, FocusReport, AttentionZone, ZoneAnalysis, ScanResult, FocusAttribution, CascadeEdge } from "./focus/types.js";
export { buildSkeleton } from "./focus/skeleton.js";
