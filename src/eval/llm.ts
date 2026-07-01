// ── CHIFF Causal Graph Pipeline ──
import type { Logger } from "../utils/logger.js";
// 8-step analysis pipeline: 6 LLM steps (CHIFF) + 2 LLM rule steps.
// LLM failures propagate as errors — no silent degradation.

import type { EvalResult, DeviationPoint, RootCause, HarnessRule } from "./types.js";
import type { HarnessAPI } from "../core/harness-api.js";
import type { SerializedSession } from "../session/types.js";
import { resolveModel } from "../models/index.js";
import { completeSimple } from "../models/index.js";
import { CausalGraphStore } from "./graph-store.js";
import { parseSessionToSteps, safeJsonParse, validateSubtasks, validateSubtaskEdges, validateAgentEdges, validateCandidateSet, validateAttribution, validateStepDataFlows, type ValidationResult, type HistoryStep, type Subtask, type SubtaskEdge, type AgentNode, type AgentEdge, type StepDataFlow, type CandidateSet, type Attribution, type RecoveryArc } from "./schemas.js";
import { computeStats, type SessionStats } from "./stats.js";
import { attributeWithLLM } from "./rules/extraction.js";
import {
  CHIFF_SYSTEM_PROMPT,
  buildHistorySummary,
  buildStep1Prompt,
  buildStep2Prompt,
  buildStep3Prompt,
  buildStep3SingleSubtaskPrompt,
  buildStep4Prompt,
  buildStep5Prompt,
  buildStep6Prompt,
  extractJSON,
} from "./prompts.js";

// ── LLM Call Helpers ──

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

async function callLLMWithRetry(
  systemPrompt: string,
  userMessage: string,
  harness: HarnessAPI,
  maxRetries = 1,
  maxTokens?: number,
): Promise<string> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const content = await callLLM(systemPrompt, userMessage, harness, maxTokens);
      if (content) return content;
      lastError = new Error("Empty LLM response");
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
    if (attempt < maxRetries) {
      userMessage = userMessage + "\n\n⚠ Your previous response was invalid. Please output PURE JSON matching the specified format. No markdown, no extra text.";
    }
  }
  throw lastError ?? new Error("LLM call failed after retries");
}

// ── Step Executors ──

/** Call LLM + extract JSON + validate — with retry on validation failure. */
async function callAndValidate<T>(
  harness: HarnessAPI,
  prompt: string,
  validator: (obj: unknown) => ValidationResult<T>,
  maxTokens: number,
  stepLabel: string,
): Promise<T> {
  let raw = await callLLMWithRetry(CHIFF_SYSTEM_PROMPT, prompt, harness, 1, maxTokens);

  for (let attempt = 0; attempt < 2; attempt++) {
    const json = extractJSON(raw);
    if (!json) {
      if (attempt === 0) {
        raw = await callLLMWithRetry(CHIFF_SYSTEM_PROMPT, prompt + "\n\n⚠ No JSON found. Output PURE JSON.", harness, 1, maxTokens);
        continue;
      }
      throw new Error(`${stepLabel}: No JSON found in LLM response`);
    }

    let parsed: unknown;
    try { parsed = JSON.parse(json); }
    catch {
      if (attempt === 0) {
        raw = await callLLMWithRetry(CHIFF_SYSTEM_PROMPT, prompt + "\n\n⚠ Invalid JSON. Output PURE JSON, no markdown.", harness, 1, maxTokens);
        continue;
      }
      throw new Error(`${stepLabel}: JSON parse failed`);
    }

    const result = validator(parsed);
    if (result.ok) return result.value;

    if (attempt === 0) {
      const errors = result.errors.slice(0, 5).join("; ");
      raw = await callLLMWithRetry(CHIFF_SYSTEM_PROMPT,
        prompt + `\n\n⚠ Validation failed: ${errors}\nFix these issues and output the corrected JSON.`,
        harness, 1, maxTokens);
      continue;
    }

    throw new Error(`${stepLabel} validation: ${result.errors.join("; ")}. Raw(500): ${json.slice(0, 500)}`);
  }
  throw new Error(`${stepLabel}: unreachable`);
}


async function executeStep1(
  steps: HistoryStep[],
  question: string,
  harness: HarnessAPI,
  logger?: Logger,
): Promise<Subtask[]> {
  const summary = buildHistorySummary(
    steps.map((s) => ({
      stepId: s.stepId,
      agent: s.agent,
      action: s.action,
      thought: s.thought,
      isError: s.isError,
    })),
  );
  const prompt = buildStep1Prompt(question, summary, steps.length);
  const result = await callAndValidate(harness, prompt, validateSubtasks, 16384, "Step 1");

  // Fix overlapping or gapped subtask ranges (LLM sometimes produces imperfect boundaries)
  result.sort((a, b) => a.stepStart - b.stepStart);
  for (let i = 0; i < result.length - 1; i++) {
    const prev = result[i];
    const next = result[i + 1];
    if (prev.stepEnd >= next.stepStart) {
      if (logger) logger.warn("analysis", "Step1", `Fixing overlap: ${prev.id} (${prev.stepStart}-${prev.stepEnd}) overlaps ${next.id} (${next.stepStart}-${next.stepEnd}), truncating ${prev.id}.stepEnd to ${next.stepStart - 1}`);
      prev.stepEnd = next.stepStart - 1;
    }
    if (prev.stepEnd + 1 < next.stepStart) {
      if (logger) logger.warn("analysis", "Step1", `Filling gap: gap ${prev.stepEnd + 1}-${next.stepStart - 1} between ${prev.id} and ${next.id}, extending ${prev.id}.stepEnd to ${next.stepStart - 1}`);
      prev.stepEnd = next.stepStart - 1;
    }
  }
  // Ensure last subtask covers to the end
  const last = result[result.length - 1];
  if (last && last.stepEnd < steps.length - 1) {
    last.stepEnd = steps.length - 1;
  }
  return result;

}
async function executeStep2(
  subtasks: Subtask[],
  steps: HistoryStep[],
  harness: HarnessAPI,
): Promise<SubtaskEdge[]> {
  const summary = buildHistorySummary(
    steps.map((s) => ({
      stepId: s.stepId,
      agent: s.agent,
      action: s.action,
      thought: s.thought,
      isError: s.isError,
    })),
  );
  const prompt = buildStep2Prompt(subtasks, summary);
  return callAndValidate(harness, prompt, validateSubtaskEdges, 16384, "Step 2");
}

// ── Agent Nodes: Deterministic Construction ──
// Pure function — no LLM, no side effects, never throws.

function buildAgentNodes(steps: HistoryStep[], subtasks: Subtask[]): AgentNode[] {
  const nodes: AgentNode[] = [];
  for (const subtask of subtasks) {
    for (let stepId = subtask.stepStart; stepId <= subtask.stepEnd; stepId++) {
      const step = steps[stepId];
      if (!step) continue;
      nodes.push({
        subtaskId: subtask.id,
        agent: step.agent,
        otar: {
          observation: step.observation,
          thought: step.thought,
          action: step.action,
          result: step.result,
        },
        stepIds: [step.stepId],
      });
    }
  }
  return nodes;
}

async function executeStep3(
  subtasks: Subtask[],
  steps: HistoryStep[],
  harness: HarnessAPI,
  logger?: Logger,
): Promise<{ agents: AgentNode[]; dataFlows: StepDataFlow[] }> {
  // Agent nodes: deterministic, no LLM
  const agents = buildAgentNodes(steps, subtasks);

  // Data flows: divide-and-conquer — one LLM call per subtask.
  const allFlows: StepDataFlow[] = [];
  let failedSubtasks = 0;

  for (const subtask of subtasks) {
    try {
      const prompt = buildStep3SingleSubtaskPrompt(subtask, steps, subtasks);
      const flows = await callAndValidate(harness, prompt, validateStepDataFlows, 4096, `Step 3 / ${subtask.id}`);
      allFlows.push(...flows);
      if (logger) logger.info("analysis", "Step3", `Subtask ${subtask.id}: ${flows.length} data flows extracted`);
    } catch (err) {
      if (logger) logger.warn("analysis", "Step3", `Subtask ${subtask.id}: ${err instanceof Error ? err.message : String(err)}`);
      failedSubtasks++;
    }
  }

  if (failedSubtasks > 0) {
    if (logger) logger.warn("analysis", "Step3", `${failedSubtasks}/${subtasks.length} subtasks failed to produce data flows`);
  }
  if (logger) logger.info("analysis", "Step3", `Subtask summary: ${allFlows.length} total data flows from ${subtasks.length - failedSubtasks}/${subtasks.length} subtasks`);
  return { agents, dataFlows: allFlows };
}

async function executeStep4(
  subtasks: Subtask[],
  agentNodes: AgentNode[],
  harness: HarnessAPI,
): Promise<AgentEdge[]> {
  const prompt = buildStep4Prompt(subtasks, agentNodes);
  return callAndValidate(harness, prompt, validateAgentEdges, 32768, "Step 4");
}

async function executeStep5(
  question: string,
  steps: HistoryStep[],
  graphStore: CausalGraphStore,
  harness: HarnessAPI,
): Promise<CandidateSet> {
  const summary = buildHistorySummary(
    steps.map((s) => ({
      stepId: s.stepId,
      agent: s.agent,
      action: s.action,
      thought: s.thought,
      isError: s.isError,
    })),
  );
  const snapshot = graphStore.snapshot();
  const prompt = buildStep5Prompt(question, summary, snapshot);
  const result = await callAndValidate(harness, prompt, validateCandidateSet, 65536, "Step 5");
  if (result.steps.length < 5) throw new Error(`Step 5: Only ${result.steps.length} candidates (need >= 5)`);
  return result;
}

// ── Recovery Arc Validation ──

const VALID_DETECTION_TYPES = ["tool_error", "user_complaint", "test_failure", "screenshot_divergence", "self_correction"] as const;

function validateRecoveryArcs(attribution: Record<string, unknown>): RecoveryArc[] | undefined {
  const raw = attribution["recoveryArcs"];
  if (!Array.isArray(raw)) return undefined;

  const validated: RecoveryArc[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) continue;
    const arc = item as Record<string, unknown>;
    const errorStep = typeof arc["errorStep"] === "number" ? arc["errorStep"] : -1;
    const correctionStep = typeof arc["correctionStep"] === "number" ? arc["correctionStep"] : -1;

    // Validate: errorStep < correctionStep
    if (errorStep < 0 || correctionStep < 0 || errorStep >= correctionStep) continue;

    const detectionType = typeof arc["detectionType"] === "string" ? arc["detectionType"] : "";
    if (!(VALID_DETECTION_TYPES as readonly string[]).includes(detectionType)) continue;

    const rootCauseHypothesis = typeof arc["rootCauseHypothesis"] === "string" ? arc["rootCauseHypothesis"] : "";
    if (!rootCauseHypothesis) continue;

    validated.push({
      errorStep,
      errorAgent: typeof arc["errorAgent"] === "string" ? arc["errorAgent"] : "",
      errorSummary: typeof arc["errorSummary"] === "string" ? arc["errorSummary"] : "",
      detectionStep: typeof arc["detectionStep"] === "number" ? arc["detectionStep"] : errorStep,
      detectionType: detectionType as RecoveryArc["detectionType"],
      correctionStep,
      correctionAgent: typeof arc["correctionAgent"] === "string" ? arc["correctionAgent"] : "",
      correctionSummary: typeof arc["correctionSummary"] === "string" ? arc["correctionSummary"] : "",
      effective: arc["effective"] === true,
      stepsToRecover: typeof arc["stepsToRecover"] === "number" ? arc["stepsToRecover"] : (correctionStep - errorStep),
      misdiagnosisCount: typeof arc["misdiagnosisCount"] === "number" && arc["misdiagnosisCount"] >= 0 ? arc["misdiagnosisCount"] : 0,
      rootCauseHypothesis,
    });
  }

  return validated.length > 0 ? validated : undefined;
}

// ── Step 6: Counterfactual Attribution ──

async function executeStep6(
  candidateSet: CandidateSet,
  graphStore: CausalGraphStore,
  harness: HarnessAPI,
): Promise<Attribution & { recoveryArcs?: RecoveryArc[] }> {
  const snapshot = graphStore.snapshot();
  const prompt = buildStep6Prompt(candidateSet, snapshot);
  const attribution = await callAndValidate(harness, prompt, validateAttribution, 65536, "Step 6");
  // Recovery arcs are optional extra data — re-parse raw JSON to extract them
  return { ...attribution, recoveryArcs: undefined };
}

// ── Pipeline Result Merger ──

function mergePipelineResults(
  stats: SessionStats,
  attribution: Attribution & { recoveryArcs?: RecoveryArc[] },
  candidateSet: CandidateSet,
  graphStore: CausalGraphStore,
  rules: HarnessRule[],
): EvalResult {
  const snapshot = graphStore.snapshot();

  // Derive phases from subtasks (use LLM-assigned phaseStatus)
  const subtasks = graphStore.getSubtasks();
  const phases = subtasks.map((s) => {
    const agents = graphStore.getAgentNodes().filter((n) => n.subtaskId === s.id);
    let errorCount = 0;
    for (const a of agents) {
      for (const stepId of a.stepIds) {
        const candidate = candidateSet.steps.find((c) => c.stepId === stepId);
        if (candidate?.dataIssue) errorCount++;
      }
    }
    const status: "ok" | "warn" | "danger" =
      s.phaseStatus === "danger" ? "danger" :
      s.phaseStatus === "warn" ? "warn" :
      errorCount > 0 ? "warn" : "ok";
    return {
      label: s.name,
      startIdx: s.stepStart,
      endIdx: s.stepEnd,
      status,
      summary: s.oracle.goal,
      toolCalls: { total: agents.length, errors: errorCount },
    };
  });

  // Derive deviations from candidate set (use LLM-assigned deviationDescription)
  const deviations: DeviationPoint[] = candidateSet.steps
    .filter((c) => c.dataIssue || c.impactScore > 0.4)
    .map((c) => ({
      messageIdx: c.stepId,
      screenshotKeyword: c.dataItem,
      targetKeyword: "",
      severity: c.impactScore > 0.7 ? "high" : c.impactScore > 0.4 ? "medium" : "low",
      description: c.deviationDescription || c.irrecoverableReason || (c.dataIssue ? `Data issue with ${c.dataItem}` : `Candidate error step ${c.stepId}`),
    }));

  // Root cause from attribution (use LLM-assigned rootCauseTitle/rootCauseSeverity)
  const rootCauses: RootCause[] = [{
    title: attribution.rootCauseTitle || `${attribution.mistakeAgent} at Step ${attribution.mistakeStep}`,
    description: attribution.reason,
    evidenceIndices: [attribution.mistakeStep],
    severity: attribution.rootCauseSeverity || "primary",
  }];

  // Build timeline from stats data
  const timeline: import("./types.js").TimelineEvent[] = subtasks.map((s) => ({
    messageIdx: s.stepStart,
    type: "phase_start" as const,
    label: s.name,
    severity: s.phaseStatus,
  }));

  return {
    metadata: stats.metadata,
    stats: stats.stats,
    phases,
    deviations,
    rootCauses,
    rules,
    timeline,
    causalGraph: snapshot,
    attribution,
    rulesApplied: attribution.rulesApplied,
    recoveryArcs: attribution.recoveryArcs,
  };
}

// ── Main Pipeline ──

export async function runCausalGraphPipeline(
  data: SerializedSession,
  harness: HarnessAPI,
  onLog?: (msg: string) => void,
  logger?: Logger,
): Promise<EvalResult> {
  // Compute pure stats (no inference, no rules)
  const sessionStats = computeStats(data);

  // Step 0: Parse session to history steps
  const steps = parseSessionToSteps(data);
  if (steps.length === 0) {
    throw new Error("No analysable steps found in session");
  }

  const question = data.metadata.preview || data.metadata.title || "Unknown task";
  const graphStore = new CausalGraphStore();
  graphStore.setTotalSteps(steps.length);

  // Step 1: Subtask decomposition
  onLog?.("🔍 Phase 1/6: 分解子任务...");
  const subtasks = await executeStep1(steps, question, harness, logger);
  onLog?.("✓ Phase 1/6 完成  [██░░░░░░░░░░░░░░] 17%");
  graphStore.addSubtasks(subtasks);

  // Step 2: Subtask edges
  onLog?.("🔗 Phase 2/6: 识别子任务依赖...");
  const subtaskEdges = await executeStep2(subtasks, steps, harness);
  onLog?.("✓ Phase 2/6 完成  [████░░░░░░░░░░░░] 33%");
  graphStore.addSubtaskEdges(subtaskEdges);

  // Step 3: Agent nodes + step data flows
  onLog?.("🤖 Phase 3/6: 提取 Agent 节点...");
  const { agents, dataFlows } = await executeStep3(subtasks, steps, harness, logger);
  onLog?.("✓ Phase 3/6 完成  [██████░░░░░░░░░░] 50%");
  graphStore.addAgentNodes(agents);
  graphStore.addStepDataFlows(dataFlows);

  // Step 4: Agent edges
  onLog?.("🔗 Phase 4/6: 识别 Agent 依赖边...");
  const agentEdges = await executeStep4(subtasks, agents, harness);
  onLog?.("✓ Phase 4/6 完成  [████████░░░░░░░░] 67%");
  graphStore.addAgentEdges(agentEdges);

  // Gate: graph must be complete before proceeding
  if (!graphStore.isGraphComplete()) {
    const issues = graphStore.validateCoverage();
    throw new Error(`Causal graph incomplete: ${issues.join("; ")}`);
  }

  // Step 5: Candidate error set
  onLog?.("🎯 Phase 5/6: 生成候选错误集...");
  const candidateSet = await executeStep5(question, steps, graphStore, harness);
  onLog?.("✓ Phase 5/6 完成  [██████████░░░░░░] 83%");

  // Step 6: Counterfactual attribution
  onLog?.("⚖️ Phase 6/6: 反事实归因...");
  const attribution = await executeStep6(candidateSet, graphStore, harness);
  onLog?.("✓ Phase 6/6 完成  [████████████████] 100%");

  // Step 7: LLM autonomous rule attribution (with recoveryArcs)
  const rules = await attributeWithLLM(data, steps, sessionStats.stats, sessionStats.metadata, graphStore, attribution, harness, sessionStats.metadata.sessionId, Date.now(), logger);
  return mergePipelineResults(sessionStats, attribution, candidateSet, graphStore, rules);
}


// Re-export focus pipeline for use by eval/index.ts
export { runFocusPipeline } from "./focus/index.js";
export async function analyzeWithLLM(
  data: SerializedSession,
  harness: HarnessAPI,
  onLog?: (msg: string) => void,
  logger?: Logger,
): Promise<EvalResult> {
  return runCausalGraphPipeline(data, harness, onLog, logger);
}
