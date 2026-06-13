// ── CHIFF Causal Graph Pipeline ──
// 8-step analysis pipeline: 6 LLM steps (CHIFF) + 2 LLM rule steps.
// Falls back to rule-engine analysis on any failure.

import type { EvalResult, DeviationPoint, RootCause, HarnessRule } from "./types.js";
import type { HarnessAPI } from "../core/harness-api.js";
import type { SerializedSession } from "../session/types.js";
import { resolveModel } from "../models/index.js";
import { completeSimple } from "@mariozechner/pi-ai";
import { CausalGraphStore } from "./graph-store.js";
import { parseSessionToSteps, validateSubtasks, validateSubtaskEdges, validateAgentNodes, validateAgentEdges, validateCandidateSet, validateAttribution, validateStepDataFlows, type HistoryStep, type Subtask, type SubtaskEdge, type AgentNode, type AgentEdge, type StepDataFlow, type CandidateSet, type Attribution } from "./schemas.js";
import { analyzeSession, compactSession } from "./analyzer.js";
import { attributeWithLLM } from "./rules/extraction.js";
import {
  CHIFF_SYSTEM_PROMPT,
  buildHistorySummary,
  buildStep1Prompt,
  buildStep2Prompt,
  buildStep3Prompt,
  buildStep4Prompt,
  buildStep5Prompt,
  buildStep6Prompt,
  extractJSON,
} from "./prompts.js";

// ── LLM Call Helper ──

async function callLLM(
  systemPrompt: string,
  userMessage: string,
  harness: HarnessAPI,
): Promise<string> {
  const model = resolveModel(harness.config.provider, harness.config.modelId);
  const response = await completeSimple(
    model,
    {
      systemPrompt,
      messages: [{ role: "user" as const, content: userMessage, timestamp: Date.now() }],
    },
    { apiKey: harness.config.apiKey },
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
): Promise<string> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const content = await callLLM(systemPrompt, userMessage, harness);
      if (content) return content;
      lastError = new Error("Empty LLM response");
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
    if (attempt < maxRetries) {
      // Retry with correction hint
      userMessage = userMessage + "\n\n⚠ Your previous response was invalid. Please output PURE JSON matching the specified format. No markdown, no extra text.";
    }
  }
  throw lastError ?? new Error("LLM call failed after retries");
}

// ── Step Executors ──

async function executeStep1(
  steps: HistoryStep[],
  question: string,
  harness: HarnessAPI,
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
  const raw = await callLLMWithRetry(CHIFF_SYSTEM_PROMPT, prompt, harness);
  const json = extractJSON(raw);
  if (!json) throw new Error("Step 1: No JSON found in LLM response");
  const parsed = JSON.parse(json);
  // Handle both {"subtasks": [...]} and [...] formats
  const arr = Array.isArray(parsed) ? parsed : parsed["subtasks"];
  const result = validateSubtasks(arr);
  if (!result.ok) throw new Error(`Step 1 validation: ${result.errors.join("; ")}`);
  return result.value;
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
  const raw = await callLLMWithRetry(CHIFF_SYSTEM_PROMPT, prompt, harness);
  const json = extractJSON(raw);
  if (!json) throw new Error("Step 2: No JSON found in LLM response");
  const parsed = JSON.parse(json);
  const arr = Array.isArray(parsed) ? parsed : parsed["edges"];
  const result = validateSubtaskEdges(arr);
  if (!result.ok) throw new Error(`Step 2 validation: ${result.errors.join("; ")}`);
  return result.value;
}

async function executeStep3(
  subtasks: Subtask[],
  steps: HistoryStep[],
  harness: HarnessAPI,
): Promise<{ agents: AgentNode[]; dataFlows: StepDataFlow[] }> {
  const summary = buildHistorySummary(
    steps.map((s) => ({
      stepId: s.stepId,
      agent: s.agent,
      action: s.action,
      thought: s.thought,
      isError: s.isError,
    })),
  );
  const prompt = buildStep3Prompt(subtasks, summary);
  const raw = await callLLMWithRetry(CHIFF_SYSTEM_PROMPT, prompt, harness);
  const json = extractJSON(raw);
  if (!json) throw new Error("Step 3: No JSON found in LLM response");
  const parsed = JSON.parse(json);
  const agentsResult = validateAgentNodes(parsed["agents"] ?? []);
  if (!agentsResult.ok) throw new Error(`Step 3 agents: ${agentsResult.errors.join("; ")}`);
  const flowsResult = validateStepDataFlows(parsed["dataFlows"] ?? []);
  if (!flowsResult.ok) throw new Error(`Step 3 data flows: ${flowsResult.errors.join("; ")}`);
  return { agents: agentsResult.value, dataFlows: flowsResult.value };
}

async function executeStep4(
  subtasks: Subtask[],
  agentNodes: AgentNode[],
  harness: HarnessAPI,
): Promise<AgentEdge[]> {
  const prompt = buildStep4Prompt(subtasks, agentNodes);
  const raw = await callLLMWithRetry(CHIFF_SYSTEM_PROMPT, prompt, harness);
  const json = extractJSON(raw);
  if (!json) throw new Error("Step 4: No JSON found in LLM response");
  const parsed = JSON.parse(json);
  const arr = Array.isArray(parsed) ? parsed : parsed["edges"];
  const result = validateAgentEdges(arr);
  if (!result.ok) throw new Error(`Step 4 validation: ${result.errors.join("; ")}`);
  return result.value;
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
  const raw = await callLLMWithRetry(CHIFF_SYSTEM_PROMPT, prompt, harness);
  const json = extractJSON(raw);
  if (!json) throw new Error("Step 5: No JSON found in LLM response");
  const parsed = JSON.parse(json);
  const result = validateCandidateSet(parsed);
  if (!result.ok) throw new Error(`Step 5 validation: ${result.errors.join("; ")}`);
  if (result.value.steps.length < 5) throw new Error(`Step 5: Only ${result.value.steps.length} candidates (need >= 5)`);
  return result.value;
}

async function executeStep6(
  candidateSet: CandidateSet,
  graphStore: CausalGraphStore,
  harness: HarnessAPI,
): Promise<Attribution> {
  const snapshot = graphStore.snapshot();
  const prompt = buildStep6Prompt(candidateSet, snapshot);
  const raw = await callLLMWithRetry(CHIFF_SYSTEM_PROMPT, prompt, harness);
  const json = extractJSON(raw);
  if (!json) throw new Error("Step 6: No JSON found in LLM response");
  const parsed = JSON.parse(json);
  const result = validateAttribution(parsed);
  if (!result.ok) throw new Error(`Step 6 validation: ${result.errors.join("; ")}`);
  return result.value;
}

// ── Pipeline Result Merger ──

function mergePipelineResults(
  ruleResult: EvalResult,
  attribution: Attribution,
  candidateSet: CandidateSet,
  graphStore: CausalGraphStore,
  rules: HarnessRule[],
): EvalResult {
  const snapshot = graphStore.snapshot();

  // Derive phases from subtasks
  const subtasks = graphStore.getSubtasks();
  const phases = subtasks.map((s) => {
    const agents = graphStore.getAgentNodes().filter((n) => n.subtaskId === s.id);
    const hasErrors = agents.some((a) => {
      return ruleResult.stats.toolErrors > 0;
    });
    return {
      label: s.name,
      startIdx: s.stepStart,
      endIdx: s.stepEnd,
      status: (hasErrors ? "warn" : "ok") as "ok" | "warn" | "danger",
      summary: s.oracle.goal,
      toolCalls: { total: agents.length, errors: 0 },
    };
  });

  // Derive deviations from candidate set
  const deviations: DeviationPoint[] = candidateSet.steps.map((c) => ({
    messageIdx: c.stepId,
    screenshotKeyword: c.dataItem,
    targetKeyword: "",
    severity: c.impactScore > 0.7 ? "high" : c.impactScore > 0.4 ? "medium" : "low",
    description: c.irrecoverableReason || (c.dataIssue ? `Data issue with ${c.dataItem}` : "Candidate error step"),
  }));

  // Root cause from attribution
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
    analysisMode: "llm" as const,
    timeline: ruleResult.timeline,
    causalGraph: snapshot,
    attribution,
    rulesApplied: attribution.rulesApplied,
  };
}

// ── Main Pipeline ──

export async function runCausalGraphPipeline(
  data: SerializedSession,
  harness: HarnessAPI,
): Promise<EvalResult> {
  // Always run rule engine first for reliable metadata/stats
  const compacted = compactSession(data);
  const ruleResult = analyzeSession(data, compacted);

  try {
    // Step 0: Parse session to history steps
    const steps = parseSessionToSteps(data);
    if (steps.length === 0) {
      throw new Error("No analysable steps found in session");
    }

    const question = data.metadata.preview || data.metadata.title || "Unknown task";
    const graphStore = new CausalGraphStore();
    graphStore.setTotalSteps(steps.length);

    // Step 1: Subtask decomposition
    const subtasks = await executeStep1(steps, question, harness);
    graphStore.addSubtasks(subtasks);

    // Step 2: Subtask edges
    const subtaskEdges = await executeStep2(subtasks, steps, harness);
    graphStore.addSubtaskEdges(subtaskEdges);

    // Step 3: Agent nodes + step data flows
    const { agents, dataFlows } = await executeStep3(subtasks, steps, harness);
    graphStore.addAgentNodes(agents);
    graphStore.addStepDataFlows(dataFlows);

    // Step 4: Agent edges
    const agentEdges = await executeStep4(subtasks, agents, harness);
    graphStore.addAgentEdges(agentEdges);

    // Gate: graph must be complete before proceeding
    if (!graphStore.isGraphComplete()) {
      const issues = graphStore.validateCoverage();
      throw new Error(`Causal graph incomplete: ${issues.join("; ")}`);
    }

    // Step 5: Candidate error set
    const candidateSet = await executeStep5(question, steps, graphStore, harness);

    // Step 6: Counterfactual attribution
    const attribution = await executeStep6(candidateSet, graphStore, harness);

    // Step 7: LLM autonomous rule attribution
    const rules = await attributeWithLLM(data, steps, ruleResult.stats, ruleResult.metadata, graphStore, attribution, harness, ruleResult.metadata.sessionId, Date.now());
    return mergePipelineResults(ruleResult, attribution, candidateSet, graphStore, rules);
  } catch {
    // Any error in the pipeline → fall back to rule engine
    // Step 7 on fallback: LLM attribution without causal graph / attribution
    const steps = parseSessionToSteps(data);
    const rules = await attributeWithLLM(data, steps, ruleResult.stats, ruleResult.metadata, null, null, harness, ruleResult.metadata.sessionId, Date.now());
    return { ...ruleResult, rules };
  }
}

// Keep the old one-shot method as a compatibility shim (calls the pipeline)
export async function analyzeWithLLM(
  data: SerializedSession,
  harness: HarnessAPI,
): Promise<EvalResult> {
  return runCausalGraphPipeline(data, harness);
}
