// ── Eval Module Entry Point ──
// Orchestrates session analysis: load, analyze (LLM or rule engine), dashboard, open.

import { homedir } from "node:os";
import { join } from "node:path";
import type { HarnessAPI } from "../core/harness-api.js";
import type { UiBackend } from "../ui/backend.js";
import type { SerializedSession } from "../session/types.js";
import { analyzeSession, compactSession } from "./analyzer.js";
import { generateDashboard, openDashboard } from "./dashboard.js";
import { analyzeWithLLM } from "./llm.js";

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
    const result = await analyzeWithLLM(sessionData, harness);

    // Generate dashboard
    const outputPath = join(evalDir(), `${resolvedId.slice(0, 8)}.html`);
    generateDashboard(result, outputPath);

    // Open in browser
    openDashboard(outputPath);

    const analysisLabel = result.analysisMode === "llm" ? "CHIFF Causal Graph" : "Rule Engine";
    const attributionInfo = result.attribution
      ? ` | Root cause: ${result.attribution.mistakeAgent}@Step${result.attribution.mistakeStep}`
      : "";
    ui.addInfo(
      `Dashboard generated: ${outputPath}\n` +
      `[${analysisLabel}] Messages: ${result.metadata.totalMessages} | Tool calls: ${result.stats.toolCalls} | ` +
      `Error rate: ${result.stats.errorRate}${attributionInfo}`,
    );
  } catch (err) {
    ui.addError(`eval: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export { analyzeSession, compactSession, generateDashboard, openDashboard, analyzeWithLLM };
export type { EvalResult, PhaseInfo, DeviationPoint, RootCause, SessionMeta, ToolStats, TimelineEvent, CompactMessage } from "./types.js";
