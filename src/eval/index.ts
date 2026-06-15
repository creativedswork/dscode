// ── Eval Module Entry Point ──
// Orchestrates session analysis: load, analyze (LLM or rule engine), dashboard, open.

import { homedir } from "node:os";
import { join } from "node:path";
import type { HarnessAPI } from "../core/harness-api.js";
import type { UiBackend } from "../ui/backend.js";
import type { SerializedSession } from "../session/types.js";
import { computeStats } from "./stats.js";
import { generateDashboard, openDashboard } from "./dashboard.js";
import { analyzeWithLLM, runCausalGraphPipeline } from "./llm.js";
import { loadRuleStore, semanticMerge, saveRuleStore } from "./rules/store.js";
import { runFocusPipeline, FOCUS_PATH_THRESHOLD } from "./focus/index.js";
import { parseSessionToSteps } from "./schemas.js";

function evalDir(): string {
  return join(homedir(), ".dscode", "eval");
}

export async function runEval(
  sessionId: string | null,
  ctx: { harness: HarnessAPI; ui: UiBackend },
): Promise<void> {
  const { harness, ui } = ctx;
  const manager = harness.sessionManager;

  try {
    // Resolve session ID
    let resolvedId: string;
    let sessionData: SerializedSession | null = null;

    if (sessionId) {
      const found = manager.getSessionFilePath(sessionId);
      if (!found) {
        ui.addError(`Session not found: ${sessionId}`);
        return;
      }
      resolvedId = found.metadata.id;
      sessionData = await manager.loadSessionFile(resolvedId);
      if (!sessionData) {
        ui.addError(`Failed to load session: ${resolvedId}`);
        return;
      }
    } else {
      const currentId = manager.getCurrentSessionId();
      if (!currentId) {
        ui.addError("No session to evaluate. Usage: /eval [session_id]");
        return;
      }
      resolvedId = currentId;
      sessionData = await manager.loadSessionFile(resolvedId);
      if (!sessionData) {
        // Session is current but not yet persisted; save it first
        harness.saveSessionNow();
        sessionData = await manager.loadSessionFile(resolvedId);
        if (!sessionData) {
          ui.addError("Failed to load current session data.");
          return;
        }
      }
    }

    ui.addInfo(`正在分析 session ${resolvedId.slice(0, 8)}...`);

    // Analyze — CHIFF causal graph pipeline, rule engine as fallback
    // Analyze — path selection based on session size
    const steps = parseSessionToSteps(sessionData);
    const result = steps.length >= FOCUS_PATH_THRESHOLD
      ? await runFocusPipeline(sessionData, harness, computeStats(sessionData))
      : await runCausalGraphPipeline(sessionData, harness);

    // Step 8: LLM semantic rule merge (use session's projectPath, not harness cwd)
    const projectPath = sessionData?.metadata?.projectPath ?? harness.config?.projectPath;
    if (projectPath) {
      const store = loadRuleStore(projectPath);
      const merged = await semanticMerge(result.rules, store, harness);
      saveRuleStore(merged);
    }
    const outputPath = join(evalDir(), `${resolvedId.slice(0, 8)}.html`);
    generateDashboard(result, outputPath);

    // Open in browser
    openDashboard(outputPath);

    const analysisLabel = "CHIFF Causal Graph";
    const attributionInfo = result.attribution
      ? ` | Root cause: ${result.attribution.mistakeAgent}@Step${result.attribution.mistakeStep}`
      : "";
    const rulesTriggered = result.rules ? result.rules.length : 0;
    ui.addInfo(
      `Dashboard generated: ${outputPath}\n` +
      `[${analysisLabel}] Messages: ${result.metadata.totalMessages} | Tool calls: ${result.stats.toolCalls} | ` +
      `Error rate: ${result.stats.errorRate}${attributionInfo} | Rules: ${rulesTriggered}`,
    );
  } catch (err) {
    ui.addError(`eval: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export { computeStats, generateDashboard, openDashboard, analyzeWithLLM };
export type { EvalResult, PhaseInfo, DeviationPoint, RootCause, SessionMeta, ToolStats, TimelineEvent, CompactMessage, HarnessRule } from "./types.js";
export type { SessionSkeleton, FocusReport, AttentionZone, ZoneAnalysis, ScanResult, FocusAttribution, CascadeEdge } from "./focus/types.js";
export { buildSkeleton } from "./focus/skeleton.js";
