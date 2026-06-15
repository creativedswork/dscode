// ── LLM Autonomous Rule Attribution (CHIFF Step 7) ──
import { logEval } from "../logger.js";
// Replaces all deterministic rule extraction. The LLM receives the
// full CHIFF context and autonomously identifies Agent config issues.

import type { HarnessRule, RuleEvidence } from "./types.js";
import type { CausalGraphStore } from "../graph-store.js";
import type { Attribution, RecoveryArc } from "../schemas.js";
import type { SessionMeta, ToolStats } from "../types.js";
import type { SerializedSession } from "../../session/types.js";
import { existsSync, readFileSync } from "node:fs";
import type { HarnessAPI } from "../../core/harness-api.js";
import { join } from "node:path";
import { resolveModel } from "../../models/index.js";
import { completeSimple } from "@mariozechner/pi-ai";
import { parseSessionToSteps, type HistoryStep } from "../schemas.js";
import { RULE_ATTRIBUTION_SYSTEM, buildStep7Prompt, buildHistorySummary, extractJSON } from "../prompts.js";
import { safeJsonParse, validateHarnessRuleOutputs, type HarnessRuleOutput } from "../schemas.js";
import { computeSeverity } from "./types.js";

// ── Helper: LLM call ──

async function callLLM(
  systemPrompt: string,
  userMessage: string,
  harness: HarnessAPI,
  maxTokens?: number,
): Promise<string> {
  const model = resolveModel(harness.config.provider, harness.config.modelId);
  const response = await completeSimple(
    model,
    {
      systemPrompt,
      messages: [{ role: "user" as const, content: userMessage, timestamp: Date.now() }],
    },
    { apiKey: harness.config.apiKey, maxTokens },
  );
  const content = typeof response.content === "string"
    ? response.content
    : Array.isArray(response.content)
      ? ((response.content as unknown) as Record<string, unknown>[]).find((b) => b["type"] === "text")?.["text"] as string ?? ""
      : "";
  return content;
}

// ── Helper: Build session fragments ──

function buildSessionFragments(
  steps: HistoryStep[],
  mistakeStep: number | null,
): string {
  if (mistakeStep === null || steps.length === 0) {
    // No attribution — show first and last 5 steps
    const fragments: string[] = [];
    for (let i = 0; i < Math.min(5, steps.length); i++) {
      const s = steps[i];
      fragments.push(`Step ${s.stepId} [${s.agent}]: ${s.action.slice(0, 100)}${s.isError ? " ❌" : ""}`);
    }
    if (steps.length > 10) fragments.push("...");
    for (let i = Math.max(5, steps.length - 5); i < steps.length; i++) {
      const s = steps[i];
      fragments.push(`Step ${s.stepId} [${s.agent}]: ${s.action.slice(0, 100)}${s.isError ? " ❌" : ""}`);
    }
    return fragments.join("\n");
  }

  // Show steps around the mistake_step (±5)
  const start = Math.max(0, mistakeStep - 5);
  const end = Math.min(steps.length, mistakeStep + 6);
  const fragments: string[] = [];
  for (let i = start; i < end; i++) {
    const s = steps[i];
    const marker = s.stepId === mistakeStep ? " ◀ ROOT CAUSE" : "";
    const thought = s.thought ? ` | thought: ${s.thought.slice(0, 80)}` : "";
    fragments.push(
      `Step ${s.stepId} [${s.agent}]${marker}${s.isError ? " ❌" : ""}\n  action: ${s.action.slice(0, 120)}${thought}`,
    );
  }
  return fragments.join("\n\n");
}

// ── Helper: Build config excerpts ──

function buildConfigExcerpts(meta: SessionMeta): string {
  const parts: string[] = [];

  // Read project config files

    const projectPath = meta.projectPath;
    if (!projectPath) return "(Agent configuration not available — no project path)";

    // Read AGENTS.md from project root
    const agentsMdPath = join(projectPath, "AGENTS.md");
    if (existsSync(agentsMdPath)) {
      try {
        const agentsMdContent = readFileSync(agentsMdPath, "utf8");
        parts.push(`AGENTS.md:\n${agentsMdContent.slice(0, 1200)}`);
      } catch {
        // File read failed — skip
      }
    }

    // Read docs/STYLE.md if available
    const stylePath = join(projectPath, "docs", "STYLE.md");
    if (existsSync(stylePath)) {
      try {
        const styleContent = readFileSync(stylePath, "utf8");
        parts.push(`CODING STYLE:\n${styleContent.slice(0, 600)}`);
      } catch {
        // File read failed — skip
      }
    }
  return parts.join("\n\n") || "(Agent configuration not available)";
}

// ── Helper: Build candidate set summary ──

function buildCandidateSummary(graphStore: CausalGraphStore | null): string {
  if (!graphStore) return "(no candidate set — rule engine fallback)";

  try {
    const snapshot = graphStore.snapshot();
    // Data flows with anomalies
    const anomalyFlows = snapshot.dataFlows
      .filter((f) => f.correctness !== "correct")
      .slice(0, 5)
      .map((f) => `  ${f.dataItem}: ${f.path} (${f.correctness})`)
      .join("\n");

    // Subtask edges with failure modes
    const failingEdges = snapshot.subtaskEdges
      .filter((e) => e.failureModeSummary)
      .slice(0, 3)
      .map((e) => `  ${e.src}→${e.dst}: ${e.failureModeSummary}`)
      .join("\n");

    return [
      anomalyFlows ? `Data flow anomalies:\n${anomalyFlows}` : "",
      failingEdges ? `Failing subtask transitions:\n${failingEdges}` : "",
    ].filter(Boolean).join("\n\n") || "(no anomalies detected in causal graph)";
  } catch {
    return "(candidate set unavailable)";
  }
}

// ── Helper: Build stats summary ──

function buildStatsSummary(stats: ToolStats): string {
  return `Tool calls: ${stats.toolCalls} | Errors: ${stats.toolErrors} | Error rate: ${stats.errorRate} | Screenshots: ${stats.screenshotsTaken} | User complaints: ${stats.userComplaints}`;
}

// ── Main: LLM-powered rule attribution ──

export async function attributeWithLLM(
  data: SerializedSession,
  steps: HistoryStep[],
  stats: ToolStats,
  meta: SessionMeta,
  graphStore: CausalGraphStore | null,
  attribution: Attribution | null,
  harness: HarnessAPI,
  sessionId: string,
  timestamp: number,
): Promise<HarnessRule[]> {
  const recoveryArcs = attribution?.recoveryArcs;
  const mistakeStep = attribution?.mistakeStep ?? null;

  const graphSnapshot = graphStore?.snapshot() ?? null;
  const candidateSummary = buildCandidateSummary(graphStore);
  const sessionFragments = buildSessionFragments(steps, mistakeStep);
  const configExcerpts = buildConfigExcerpts(meta);
  const statsSummary = buildStatsSummary(stats);

  const prompt = buildStep7Prompt(
    graphSnapshot,
    attribution ? {
      mistakeAgent: attribution.mistakeAgent,
      mistakeStep: attribution.mistakeStep,
      reason: attribution.reason,
      rulesApplied: attribution.rulesApplied,
    } : null,
    candidateSummary,
    sessionFragments,
    configExcerpts,
    statsSummary,
    recoveryArcs,
  );

  logEval("info", "RuleAttribution", `Prompt size: ${prompt.length} chars, graph ${graphSnapshot ? `${graphSnapshot.dataFlows.length} dataFlows, ${graphSnapshot.subtasks.length} subtasks` : 'none'}`);
  // LLM call with retry
  let rawOutput: string;
  let rulesOutput: HarnessRuleOutput[] = [];

  try {
    rawOutput = await callLLM(RULE_ATTRIBUTION_SYSTEM, prompt, harness, 16384);
  } catch (err) {
    console.warn("[harness-rule-attribution] LLM call failed:", (err as Error).message);
    return [];
  }

  // Parse and validate
  for (let attempt = 0; attempt < 2; attempt++) {
    const json = extractJSON(rawOutput);
    if (!json) {
      if (attempt === 0) {
        // Retry with format hint
        const retryPrompt = prompt + "\n\n⚠ Your previous response was not valid JSON. Output PURE JSON array only.";
        try {
          rawOutput = await callLLM(RULE_ATTRIBUTION_SYSTEM, retryPrompt, harness, 16384);
          continue;
        } catch {
          console.warn("[harness-rule-attribution] Retry LLM call failed");
          return [];
        }
      }
      console.warn("[harness-rule-attribution] No JSON found in LLM response after retry");
      return [];
    }

    const parsed = safeJsonParse(json, "rule-attribution", validateHarnessRuleOutputs);
    if (parsed !== null) {
      rulesOutput = parsed;
      break;
    }

    if (attempt === 0) {
      const retryPrompt = prompt + `\n\n⚠ JSON parse or validation failed. Output PURE JSON array with correct fields.`;
      try {
        rawOutput = await callLLM(RULE_ATTRIBUTION_SYSTEM, retryPrompt, harness, 16384);
        continue;
      } catch {
        console.warn("[harness-rule-attribution] Validation retry failed");
        return [];
      }
    }
  }
  logEval("info", "RuleAttribution", `Generated ${rulesOutput.length} rules`);
  if (rulesOutput.length === 0) {
    logEval("info", "RuleAttribution", `Raw LLM response (first 500): ${rawOutput.slice(0, 500)}`);
  }

  // Convert HarnessRuleOutput → HarnessRule
  return rulesOutput.map((r) => ({
    id: r.id,
    category: r.category as HarnessRule["category"],
    targetLayer: r.targetLayer,
    abstract: r.abstract,
    rawDescription: r.rawDescription,
    severity: r.severity,
    evidence: [{
      sessionId,
      timestamp,
      occurrences: 1,
      sampleSteps: [mistakeStep ?? 0],
    }],
    suggestion: r.suggestion,
  }));
}
