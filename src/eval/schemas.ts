// ── CHIFF Schemas ──
// TypeScript types for the CHIFF causal graph analysis pipeline.
// All types map to the dscode session format: thinking → toolCall → toolResult.

import type { SerializedSession } from "../session/types.js";

// ── Step 0: Parsed History Steps ──

export interface HistoryStep {
  stepId: number;
  agent: string;                   // tool name (e.g. "read_file", "write_file")
  observation: string;             // user msg or preceding toolResult that triggered this action
  thought: string;                 // from thinking block
  action: string;                  // "toolName(key_arg1=val1, ...)"
  result: string;                  // first 500 chars of toolResult text
  messageIdx: number;              // original session messages[] index
  isError: boolean;
  timestamp: number;
}

// ── Step 1: Subtask Decomposition ──

export interface LoopInfo {
  isLoopRelated: boolean;
  loopRole: "entry" | "internal" | "exit" | "none";
  loopGroupId: string | null;
  reversibility: "reversible" | "partial" | "irreversible";
  loopRiskScore: number;
}

export interface Oracle {
  goal: string;
  preconditions: string[];
  keyEvidence: string[];
  acceptanceCriteria: string[];
}

export interface Subtask {
  id: string;                      // "S1", "S2", ...
  name: string;
  stepStart: number;
  stepEnd: number;                 // inclusive
  oracle: Oracle;
  loopInfo: LoopInfo;
}

// ── Step 2: Subtask Edges ──

export type FailureModeType = "loop_issue" | "data_issue" | "irrecoverability_issue" | "taste_drift";

export interface FailureMode {
  type: FailureModeType;
  description: string;
  severity: number;                // 0.0-1.0
}

export interface DataTransferItem {
  dataItem: string;
  dataType: "numeric" | "text" | "list" | "boolean";
  producerSteps: number[];
  consumerSteps: number[];
  usageType: "calculation" | "condition" | "retrieval" | "reference";
  correctness: "correct" | "misinterpreted" | "misused" | "fabricated" | "taste_degraded";
}

export interface SubtaskEdge {
  src: string;                     // "S1"
  dst: string;                     // "S2" (adjacent pairs only)
  type: "data_dependency" | "logical_prereq";
  strength: number;                // 0.0-1.0
  explanation: string;
  dataTransfer: DataTransferItem[];
  failureModes: FailureMode[];
}

// ── Step 3: Agent Nodes (OTAR) + Step Data Flows ──

export interface OTAR {
  observation: string;
  thought: string;
  action: string;
  result: string;
}

export interface AgentNode {
  subtaskId: string;
  agent: string;                   // tool name
  otar: OTAR;
  stepIds: number[];
}

export interface StepDataFlow {
  subtaskId: string;
  fromStep: number;
  toStep: number;
  sourceAgent: string;
  targetAgent: string;
  dataItem: string;
  dataType: "numeric" | "text" | "list" | "boolean";
  transformation: string;
  correctness: "correct" | "misinterpreted" | "misused" | "fabricated" | "taste_degraded";
  confidence: number;              // 0.0-1.0
}

// ── Step 4: Agent Edges ──

export type AgentDepType =
  | "obs_dependency"
  | "reasoning_continuation"
  | "decision_dependency"
  | "environment_feedback"
  | "memory_ref"
  | "loop_control";

export interface AgentEdge {
  subtaskId: string;
  srcAgent: string;
  dstAgent: string;
  depType: AgentDepType;
  strength: number;
  explanation: string;
  failureModes: FailureMode[];
}

// ── Step 5: Candidate Error Set ──

export interface CandidateStep {
  stepId: number;
  agentsInStep: string[];
  inLoop: boolean;
  loopRole: "entry" | "internal" | "exit" | "none";
  dataIssue: boolean;
  dataItem: string;
  sourceStep: number | null;
  irrecoverable: boolean;
  irrecoverableReason: string;
  affectedSteps: number[];
  impactScore: number;             // 0.0-1.0
  confidence: number;              // 0.0-1.0
}

export interface CandidateSet {
  subtasks: string[];
  agents: string[];
  steps: CandidateStep[];          // must have >= 5
}

// ── Step 6: Attribution ──

export interface Attribution {
  mistakeAgent: string;
  mistakeStep: number;
  reason: string;
  rulesApplied: ("Rule1" | "Rule2" | "Rule3")[];
}

// ── Causal Graph Snapshot (for LLM prompt injection) ──

export interface SubtaskSummary {
  id: string;
  name: string;
  stepRange: string;               // "0-3"
  oracleGoal: string;
  loopSummary: string;
  agentCount: number;
  keyActions: string[];
  hasErrors: boolean;
  status: "ok" | "warn" | "danger";
}

export interface EdgeSummary {
  src: string;
  dst: string;
  type: string;
  strength: number;
  keyDataTransfers: string[];
  failureModeSummary: string;
}

export interface AgentSummary {
  subtaskId: string;
  agent: string;
  keyAction: string;
  stepIds: number[];
}

export interface DataFlowSummary {
  dataItem: string;
  path: string;                    // "step3(write_file) → step7(read_file) → step11(write_file)"
  correctness: string;
}

export interface CausalGraphSnapshot {
  subtasks: SubtaskSummary[];
  subtaskEdges: EdgeSummary[];
  agentSummaries: AgentSummary[];
  agentEdges: EdgeSummary[];
  dataFlows: DataFlowSummary[];
  totalSteps: number;
}

// ── Runtime Validation ──

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; errors: string[] };

// ── Safe JSON Parse ──
// Unified try/catch wrapper for all LLM JSON parsing.
// Returns null on failure instead of throwing.

export function safeJsonParse<T>(
  json: string,
  stepName: string,
  validator: (parsed: unknown) => ValidationResult<T>,
): T | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[${stepName}] JSON parse: ${msg}`);
    return null;
  }
  const result = validator(parsed);
  if (!result.ok) {
    console.warn(`[${stepName}] validation: ${result.errors.join("; ")}`);
    return null;
  }
  return result.value;
}

function isString(v: unknown): v is string {
  return typeof v === "string";
}

function isNumber(v: unknown): v is number {
  return typeof v === "number" && !isNaN(v);
}

function isArray(v: unknown): v is unknown[] {
  return Array.isArray(v);
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function requiredString(obj: Record<string, unknown>, key: string, errors: string[]): string {
  const v = obj[key];
  if (!isString(v) || v.length === 0) {
    errors.push(`Missing or empty field: ${key}`);
    return "";
  }
  return v;
}

function requiredNumber(obj: Record<string, unknown>, key: string, errors: string[]): number {
  const v = obj[key];
  if (!isNumber(v)) {
    errors.push(`Missing or invalid number field: ${key} (got ${JSON.stringify(v)})`);
    return 0;
  }
  return v;
}

function requiredArray(obj: Record<string, unknown>, key: string, errors: string[]): unknown[] {
  const v = obj[key];
  if (!isArray(v)) {
    errors.push(`Missing or invalid array field: ${key}`);
    return [];
  }
  return v;
}

function optionalString(obj: Record<string, unknown>, key: string): string {
  const v = obj[key];
  return isString(v) ? v : "";
}

function optionalNumber(obj: Record<string, unknown>, key: string, fallback: number): number {
  const v = obj[key];
  return isNumber(v) ? v : fallback;
}

function optionalStringArray(obj: Record<string, unknown>, key: string): string[] {
  const v = obj[key];
  if (!isArray(v)) return [];
  return v.filter(isString);
}

// ── Validators ──

function validateLoopInfo(obj: Record<string, unknown>, errors: string[]): LoopInfo {
  const loopRoles = ["entry", "internal", "exit", "none"];
  const reversibilities = ["reversible", "partial", "irreversible"];
  const loopRole = optionalString(obj, "loopRole") || optionalString(obj, "loop_role");
  return {
    isLoopRelated: obj["isLoopRelated"] === true || obj["is_loop_related"] === true,
    loopRole: loopRoles.includes(loopRole) ? loopRole as LoopInfo["loopRole"] : "none",
    loopGroupId: optionalString(obj, "loopGroupId") || optionalString(obj, "loop_group_id") || null,
    reversibility: reversibilities.includes(optionalString(obj, "reversibility"))
      ? optionalString(obj, "reversibility") as LoopInfo["reversibility"] : "reversible",
    loopRiskScore: optionalNumber(obj, "loopRiskScore", 0) || optionalNumber(obj, "loop_risk_score", 0),
  };
}

function validateOracle(obj: Record<string, unknown>, errors: string[]): Oracle {
  return {
    goal: requiredString(obj, "goal", errors),
    preconditions: optionalStringArray(obj, "preconditions"),
    keyEvidence: optionalStringArray(obj, "keyEvidence") || optionalStringArray(obj, "key_evidence"),
    acceptanceCriteria: optionalStringArray(obj, "acceptanceCriteria") || optionalStringArray(obj, "acceptance_criteria"),
  };
}

export function validateSubtask(obj: unknown): ValidationResult<Subtask> {
  const errors: string[] = [];
  if (!isObject(obj)) return { ok: false, errors: ["Expected an object"] };
  const id = requiredString(obj, "id", errors);
  const stepStart = requiredNumber(obj, "stepStart", errors) || requiredNumber(obj, "step_start", errors);
  const stepEnd = requiredNumber(obj, "stepEnd", errors) || requiredNumber(obj, "step_end", errors);
  const oracleObj = obj["oracle"];
  const oracle = isObject(oracleObj) ? validateOracle(oracleObj, errors) : { goal: "", preconditions: [], keyEvidence: [], acceptanceCriteria: [] };
  const loopObj = obj["loopInfo"] || obj["loop_info"] || {};
  const loopInfo = isObject(loopObj) ? validateLoopInfo(loopObj, errors) : { isLoopRelated: false, loopRole: "none" as const, loopGroupId: null, reversibility: "reversible" as const, loopRiskScore: 0 };
  return errors.length === 0
    ? { ok: true, value: { id, name: requiredString(obj, "name", errors) || `Subtask ${id}`, stepStart, stepEnd, oracle, loopInfo } }
    : { ok: false, errors };
}

export function validateSubtasks(obj: unknown): ValidationResult<Subtask[]> {
  if (!isArray(obj)) return { ok: false, errors: ["Expected an array of subtasks"] };
  const results: Subtask[] = [];
  const allErrors: string[] = [];
  for (let i = 0; i < obj.length; i++) {
    if (!isObject(obj[i])) continue;
    const r = validateSubtask(obj[i]);
    if (r.ok) results.push(r.value);
    else allErrors.push(`Subtask[${i}]: ${r.errors.join("; ")}`);
  }
  return allErrors.length === 0 ? { ok: true, value: results } : { ok: false, errors: allErrors };
}

export function validateSubtaskEdges(obj: unknown): ValidationResult<SubtaskEdge[]> {
  if (!isArray(obj)) return { ok: false, errors: ["Expected an array of subtask edges"] };
  const results: SubtaskEdge[] = [];
  const allErrors: string[] = [];
  for (let i = 0; i < obj.length; i++) {
    const e = obj[i];
    if (!isObject(e)) continue;
    const errors: string[] = [];
    const src = requiredString(e, "src", errors) || requiredString(e, "from", errors);
    const dst = requiredString(e, "dst", errors) || requiredString(e, "to", errors);
    const type = (optionalString(e, "type") || "data_dependency") as SubtaskEdge["type"];
    const dataTransfer = (isArray(e["dataTransfer"]) || isArray(e["data_transfer"])
      ? (isArray(e["dataTransfer"]) ? e["dataTransfer"] : e["data_transfer"]) as DataTransferItem[]
      : []);
    const failureModes = (isArray(e["failureModes"]) || isArray(e["failure_modes"])
      ? (isArray(e["failureModes"]) ? e["failureModes"] : e["failure_modes"]) as FailureMode[]
      : []);
    if (errors.length === 0) {
      results.push({
        src, dst, type,
        strength: optionalNumber(e, "strength", 0.5),
        explanation: optionalString(e, "explanation"),
        dataTransfer,
        failureModes,
      });
    } else {
      allErrors.push(`SubtaskEdge[${i}]: ${errors.join("; ")}`);
    }
  }
  return allErrors.length === 0 ? { ok: true, value: results } : { ok: false, errors: allErrors };
}

export function validateAgentNodes(obj: unknown): ValidationResult<AgentNode[]> {
  if (!isArray(obj)) return { ok: false, errors: ["Expected an array of agent nodes"] };
  const results: AgentNode[] = [];
  const allErrors: string[] = [];
  for (let i = 0; i < obj.length; i++) {
    const n = obj[i];
    if (!isObject(n)) continue;
    const errors: string[] = [];
    const subtaskId = requiredString(n, "subtaskId", errors) || requiredString(n, "subtask_id", errors);
    const agent = requiredString(n, "agent", errors);
    const otarObj = n["otar"];
    const otar: OTAR = isObject(otarObj)
      ? {
          observation: requiredString(otarObj, "observation", errors),
          thought: requiredString(otarObj, "thought", errors),
          action: requiredString(otarObj, "action", errors),
          result: requiredString(otarObj, "result", errors),
        }
      : { observation: "", thought: "", action: "", result: "" };
    const stepIds = (isArray(n["stepIds"]) || isArray(n["step_ids"])
      ? ((isArray(n["stepIds"]) ? n["stepIds"] : n["step_ids"]) as number[])
      : []);
    if (errors.length === 0) {
      results.push({ subtaskId, agent, otar, stepIds: stepIds.filter(isNumber) });
    } else {
      allErrors.push(`AgentNode[${i}]: ${errors.join("; ")}`);
    }
  }
  return allErrors.length === 0 ? { ok: true, value: results } : { ok: false, errors: allErrors };
}

export function validateAgentEdges(obj: unknown): ValidationResult<AgentEdge[]> {
  if (!isArray(obj)) return { ok: false, errors: ["Expected an array of agent edges"] };
  const results: AgentEdge[] = [];
  const allErrors: string[] = [];
  const validDepTypes: AgentDepType[] = [
    "obs_dependency", "reasoning_continuation", "decision_dependency",
    "environment_feedback", "memory_ref", "loop_control",
  ];
  for (let i = 0; i < obj.length; i++) {
    const e = obj[i];
    if (!isObject(e)) continue;
    const errors: string[] = [];
    const subtaskId = requiredString(e, "subtaskId", errors) || requiredString(e, "subtask_id", errors);
    const srcAgent = requiredString(e, "srcAgent", errors) || requiredString(e, "src_agent", errors) || requiredString(e, "From_agent", errors);
    const dstAgent = requiredString(e, "dstAgent", errors) || requiredString(e, "dst_agent", errors) || requiredString(e, "To_agent", errors);
    const rawDepType = optionalString(e, "depType") || optionalString(e, "agent_dependency_type") || "obs_dependency";
    const depType: AgentDepType = validDepTypes.includes(rawDepType as AgentDepType) ? rawDepType as AgentDepType : "obs_dependency";
    const failureModes = (isArray(e["failureModes"]) || isArray(e["failure_modes"]) || isArray(e["agent_failure_modes"])
      ? (isArray(e["failureModes"]) ? e["failureModes"] : isArray(e["failure_modes"]) ? e["failure_modes"] : e["agent_failure_modes"]) as FailureMode[]
      : []);
    if (errors.length === 0) {
      results.push({
        subtaskId, srcAgent, dstAgent, depType,
        strength: optionalNumber(e, "strength", 0.5) || optionalNumber(e, "agent_strength", 0.5),
        explanation: optionalString(e, "explanation"),
        failureModes,
      });
    } else {
      allErrors.push(`AgentEdge[${i}]: ${errors.join("; ")}`);
    }
  }
  return allErrors.length === 0 ? { ok: true, value: results } : { ok: false, errors: allErrors };
}

export function validateCandidateSet(obj: unknown): ValidationResult<CandidateSet> {
  if (!isObject(obj)) return { ok: false, errors: ["Expected an object"] };
  const errors: string[] = [];
  const stepsArr = requiredArray(obj, "steps", errors);
  const steps: CandidateStep[] = [];
  for (let i = 0; i < stepsArr.length; i++) {
    const s = stepsArr[i];
    if (!isObject(s)) continue;
    steps.push({
      stepId: requiredNumber(s, "stepId", errors) || requiredNumber(s, "step_id", errors),
      agentsInStep: optionalStringArray(s, "agentsInStep") || optionalStringArray(s, "agents_in_step"),
      inLoop: s["inLoop"] === true || s["in_loop"] === true,
      loopRole: (optionalString(s, "loopRole") || optionalString(s, "loop_role") || "none") as CandidateStep["loopRole"],
      dataIssue: s["dataIssue"] === true || s["data_issue"] === true,
      dataItem: optionalString(s, "dataItem") || optionalString(s, "data_item"),
      sourceStep: optionalNumber(s, "sourceStep", null as unknown as number) || optionalNumber(s, "source_step", null as unknown as number) || null,
      irrecoverable: s["irrecoverable"] === true,
      irrecoverableReason: optionalString(s, "irrecoverableReason") || optionalString(s, "irrecoverable_reason"),
      affectedSteps: (optionalStringArray(s, "affectedSteps") || optionalStringArray(s, "affected_steps")).map(Number).filter((n: number) => !isNaN(n)),
      impactScore: optionalNumber(s, "impactScore", 0) || optionalNumber(s, "impact_score", 0),
      confidence: optionalNumber(s, "confidence", 0.5),
    });
  }
  return errors.length === 0
    ? { ok: true, value: { subtasks: optionalStringArray(obj, "subtasks"), agents: optionalStringArray(obj, "agents"), steps } }
    : { ok: false, errors };
}

export function validateAttribution(obj: unknown): ValidationResult<Attribution> {
  if (!isObject(obj)) return { ok: false, errors: ["Expected an object"] };
  const errors: string[] = [];
  const validRules = ["Rule1", "Rule2", "Rule3"];
  const rawRules = optionalStringArray(obj, "rulesApplied") || optionalStringArray(obj, "rules_applied");
  const rulesApplied = rawRules.filter((r: string) => validRules.includes(r)) as Attribution["rulesApplied"];
  const result: Attribution = {
    mistakeAgent: requiredString(obj, "mistakeAgent", errors) || requiredString(obj, "mistake_agent", errors) || requiredString(obj, "Agent Name", errors),
    mistakeStep: requiredNumber(obj, "mistakeStep", errors) || requiredNumber(obj, "mistake_step", errors) || requiredNumber(obj, "Step Number", errors),
    reason: requiredString(obj, "reason", errors) || requiredString(obj, "Reason for Mistake", errors),
    rulesApplied,
  };
  return errors.length === 0 ? { ok: true, value: result } : { ok: false, errors };
}

export function validateStepDataFlows(obj: unknown): ValidationResult<StepDataFlow[]> {
  if (!isArray(obj)) return { ok: false, errors: ["Expected an array of step data flows"] };
  const results: StepDataFlow[] = [];
  const allErrors: string[] = [];
  for (let i = 0; i < obj.length; i++) {
    const f = obj[i];
    if (!isObject(f)) continue;
    const errors: string[] = [];
    results.push({
      subtaskId: requiredString(f, "subtaskId", errors) || requiredString(f, "subtask_id", errors),
      fromStep: requiredNumber(f, "fromStep", errors) || requiredNumber(f, "from_step", errors),
      toStep: requiredNumber(f, "toStep", errors) || requiredNumber(f, "to_step", errors),
      sourceAgent: requiredString(f, "sourceAgent", errors) || requiredString(f, "source_agent", errors),
      targetAgent: requiredString(f, "targetAgent", errors) || requiredString(f, "target_agent", errors),
      dataItem: requiredString(f, "dataItem", errors) || requiredString(f, "data_item", errors),
      dataType: (optionalString(f, "dataType") || optionalString(f, "data_type") || "text") as StepDataFlow["dataType"],
      transformation: optionalString(f, "transformation"),
      correctness: (optionalString(f, "correctness") || "correct") as StepDataFlow["correctness"],
      confidence: optionalNumber(f, "confidence", 0.5),
    });
    if (errors.length > 0) allErrors.push(`StepDataFlow[${i}]: ${errors.join("; ")}`);
  }
  return allErrors.length === 0 ? { ok: true, value: results } : { ok: false, errors: allErrors };
}

// ── Session Parser ──

function getTextContent(msg: Record<string, unknown>): string {
  const c = msg["content"];
  if (typeof c === "string") return c;
  if (Array.isArray(c)) {
    const textBlock = (c as unknown[]).find((b: unknown) => isObject(b) && (b as Record<string, unknown>)["type"] === "text");
    return textBlock && isObject(textBlock) ? String((textBlock as Record<string, unknown>)["text"] ?? "") : "";
  }
  return "";
}

function getThinkingText(msg: Record<string, unknown>): string {
  if (typeof msg["thinking"] === "string") return msg["thinking"];
  const c = msg["content"];
  if (Array.isArray(c)) {
    const thinkBlock = (c as unknown[]).find((b: unknown) => isObject(b) && (b as Record<string, unknown>)["type"] === "thinking");
    return thinkBlock && isObject(thinkBlock) ? String((thinkBlock as Record<string, unknown>)["thinking"] ?? "") : "";
  }
  return "";
}

function getToolCalls(msg: Record<string, unknown>): Array<{ name: string; args: Record<string, unknown> }> {
  const c = msg["content"];
  if (!Array.isArray(c)) return [];
  const tools: Array<{ name: string; args: Record<string, unknown> }> = [];
  for (const block of c) {
    if (isObject(block) && (block as Record<string, unknown>)["type"] === "toolCall") {
      tools.push({
        name: String((block as Record<string, unknown>)["name"] ?? "unknown"),
        args: (block as Record<string, unknown>)["arguments"] as Record<string, unknown> ?? {},
      });
    }
  }
  return tools;
}

function getToolResults(messages: Record<string, unknown>[], startIdx: number): Array<{ content: string; isError: boolean; toolName: string }> {
  const results: Array<{ content: string; isError: boolean; toolName: string }> = [];
  for (let i = startIdx + 1; i < messages.length; i++) {
    const msg = messages[i];
    if (msg["role"] === "toolResult") {
      results.push({
        content: getTextContent(msg),
        isError: msg["isError"] === true || (isObject(msg["details"]) && !!(msg["details"] as Record<string, unknown>)["error"]),
        toolName: String(msg["toolName"] ?? msg["toolCallId"] ?? ""),
      });
    } else if (msg["role"] === "assistant" || msg["role"] === "user") {
      break; // stop at next non-toolResult
    }
  }
  return results;
}

function summarizeArgs(args: Record<string, unknown>): string {
  const keys = Object.keys(args);
  if (keys.length === 0) return "";
  const parts = keys.slice(0, 3).map((k) => {
    const v = args[k];
    const str = typeof v === "string" ? v : JSON.stringify(v);
    return `${k}=${str.length > 80 ? str.slice(0, 80) + "..." : str}`;
  });
  return parts.join(", ");
}

export function parseSessionToSteps(data: SerializedSession): HistoryStep[] {
  const messages = data.messages as Record<string, unknown>[];
  const steps: HistoryStep[] = [];
  let stepId = 0;
  let lastUserText = "";
  let lastToolResultText = "";

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    const role = String(msg["role"] ?? "");

    if (role === "user") {
      lastUserText = getTextContent(msg);
      lastToolResultText = ""; // reset after user speaks
    }

    if (role === "assistant") {
      const thinking = getThinkingText(msg);
      const toolCalls = getToolCalls(msg);
      const textContent = getTextContent(msg);

      if (toolCalls.length > 0) {
        // Get tool results that follow this assistant message
        const toolResults = getToolResults(messages, i);

        for (let t = 0; t < toolCalls.length; t++) {
          const tc = toolCalls[t];
          const tr = toolResults[t] ?? { content: "", isError: false, toolName: tc.name };
          const argsSummary = summarizeArgs(tc.args);

          steps.push({
            stepId: stepId++,
            agent: tc.name,
            observation: lastUserText || lastToolResultText || textContent.slice(0, 300),
            thought: thinking.slice(0, 600),
            action: argsSummary ? `${tc.name}(${argsSummary})` : tc.name,
            result: tr.content.slice(0, 500),
            messageIdx: i,
            isError: tr.isError,
            timestamp: (msg["timestamp"] as number) ?? 0,
          });

          // Update last tool result for chaining
          lastToolResultText = tr.content.slice(0, 300);
          lastUserText = ""; // consumed
        }
      } else if (thinking || textContent) {
        // Assistant message without tool calls (text-only response)
        steps.push({
          stepId: stepId++,
          agent: "assistant",
          observation: lastUserText || lastToolResultText,
          thought: thinking.slice(0, 600),
          action: "respond",
          result: textContent.slice(0, 500),
          messageIdx: i,
          isError: false,
          timestamp: (msg["timestamp"] as number) ?? 0,
        });
        lastUserText = "";
      }
    }
  }

  return steps;
}

// ── Harness Rule Schemas (LLM output validation) ──

const VALID_CATEGORIES = ["identity", "tool_use", "tool_registry", "agents_md", "skill", "other"];
const VALID_ACTIONS = ["modify", "add", "remove", "reorder"];

export function validateRuleSuggestion(obj: unknown, errors: string[]): { layer: string; action: "modify" | "add" | "remove" | "reorder"; current?: string; proposed: string; rationale: string } | null {
  if (!isObject(obj)) { errors.push("suggestion must be an object"); return null; }
  const layer = requiredString(obj, "layer", errors);
  const actionRaw = optionalString(obj, "action");
  const action = VALID_ACTIONS.includes(actionRaw) ? actionRaw as "modify" | "add" | "remove" | "reorder" : "modify";
  const current = obj["current"];
  const proposed = requiredString(obj, "proposed", errors);
  const rationale = requiredString(obj, "rationale", errors);
  if (errors.length > 0) return null;
  return { layer, action, current: isString(current) ? current : undefined, proposed, rationale };
}

export interface HarnessRuleOutput {
  id: string;
  category: string;
  targetLayer: string;
  abstract: string;
  rawDescription: string;
  severity: number;
  suggestion: { layer: string; action: "modify" | "add" | "remove" | "reorder"; current?: string; proposed: string; rationale: string };
}

export function validateHarnessRuleOutput(obj: unknown): ValidationResult<HarnessRuleOutput> {
  const errors: string[] = [];
  if (!isObject(obj)) return { ok: false, errors: ["Expected an object"] };

  const id = requiredString(obj, "id", errors);
  const categoryRaw = optionalString(obj, "category");
  const category = VALID_CATEGORIES.includes(categoryRaw) ? categoryRaw : "other";
  const targetLayer = requiredString(obj, "targetLayer", errors) || optionalString(obj, "target_layer");
  const abstract = requiredString(obj, "abstract", errors);
  const rawDescription = requiredString(obj, "rawDescription", errors) || optionalString(obj, "raw_description");
  const severity = requiredNumber(obj, "severity", errors);

  const suggObj = obj["suggestion"];
  const suggestion = isObject(suggObj) ? validateRuleSuggestion(suggObj, errors) : null;
  if (!suggestion) errors.push("Missing or invalid suggestion");

  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      id, category, targetLayer, abstract, rawDescription,
      severity: Math.max(0, Math.min(1, severity)),
      suggestion: suggestion!,
    },
  };
}

export function validateHarnessRuleOutputs(obj: unknown): ValidationResult<HarnessRuleOutput[]> {
  if (!isArray(obj)) return { ok: false, errors: ["Expected an array of rule outputs"] };
  const results: HarnessRuleOutput[] = [];
  const allErrors: string[] = [];
  for (let i = 0; i < obj.length; i++) {
    const r = validateHarnessRuleOutput(obj[i]);
    if (r.ok) results.push(r.value);
    else allErrors.push(`Rule[${i}]: ${r.errors.join("; ")}`);
  }
  return allErrors.length === 0 ? { ok: true, value: results } : { ok: false, errors: allErrors };
}

export interface MergeDecision {
  newRuleId: string;
  decision: "merge" | "new";
  targetRuleId?: string;
  reasoning: string;
}

export function validateMergeDecision(obj: unknown): ValidationResult<MergeDecision> {
  const errors: string[] = [];
  if (!isObject(obj)) return { ok: false, errors: ["Expected an object"] };

  const newRuleId = requiredString(obj, "newRuleId", errors) || optionalString(obj, "new_rule_id");
  const decisionRaw = optionalString(obj, "decision");
  const decision = decisionRaw === "merge" || decisionRaw === "new" ? decisionRaw : "new";
  const targetRuleId = optionalString(obj, "targetRuleId") || optionalString(obj, "target_rule_id") || undefined;
  const reasoning = requiredString(obj, "reasoning", errors);

  if (decision === "merge" && !targetRuleId) {
    errors.push("Merge decision requires targetRuleId");
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: { newRuleId, decision: decision as "merge" | "new", targetRuleId, reasoning } };
}

export function validateMergeDecisions(obj: unknown): ValidationResult<MergeDecision[]> {
  if (!isArray(obj)) return { ok: false, errors: ["Expected an array of merge decisions"] };
  const results: MergeDecision[] = [];
  const allErrors: string[] = [];
  for (let i = 0; i < obj.length; i++) {
    const r = validateMergeDecision(obj[i]);
    if (r.ok) results.push(r.value);
    else allErrors.push(`Decision[${i}]: ${r.errors.join("; ")}`);
  }
  return allErrors.length === 0 ? { ok: true, value: results } : { ok: false, errors: allErrors };
}

