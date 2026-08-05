// ── CHIEF Schemas ──
// TypeScript types for the CHIEF causal graph analysis pipeline.
// All types map to the dscode session format: thinking → toolCall → toolResult.

import type { SerializedSession } from "../session/types.js";
import type { Logger } from "../utils/logger.js";

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
  phaseStatus?: "ok" | "warn" | "danger";
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
  deviationDescription?: string;
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
  rootCauseTitle?: string;
  rootCauseSeverity?: "primary" | "secondary";
  rulesApplied: ("Rule1" | "Rule2" | "Rule3" | "Rule4")[];
  recoveryArcs?: RecoveryArc[];
}

// ── Recovery Arc ──

export interface RecoveryArc {
  errorStep: number;
  errorAgent: string;
  errorSummary: string;
  detectionStep: number;
  detectionType: "tool_error" | "user_complaint" | "test_failure" | "screenshot_divergence" | "self_correction";
  correctionStep: number;
  correctionAgent: string;
  correctionSummary: string;
  effective: boolean;
  stepsToRecover: number;
  misdiagnosisCount: number;
  rootCauseHypothesis: string;
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
  | { ok: false; errors: string[]; partial?: T };

// ── Safe JSON Parse ──
// Unified try/catch wrapper for all LLM JSON parsing.
// Returns null on failure instead of throwing.

export function safeJsonParse<T>(
  json: string,
  stepName: string,
  validator: (parsed: unknown) => ValidationResult<T>,
  logger?: Logger,
): T | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (logger) logger.warn(stepName, `JSON parse: ${msg}`);
  }
  const result = validator(parsed);
  if (!result.ok) {
    if (logger) logger.warn(stepName, `validation: ${result.errors.join("; ")}`);
    // Return partial results if available
    if (result.partial !== undefined) return result.partial;
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

function requiredString(obj: Record<string, unknown>, errors: string[], ...keys: string[]): string {
  for (const key of keys) {
    const v = obj[key];
    if (isString(v) && v.length > 0) return v;
  }
  errors.push(`Missing or empty field: ${keys.join("/")}`);
  return "";
}

function requiredNumber(obj: Record<string, unknown>, errors: string[], ...keys: string[]): number {
  for (const key of keys) {
    const v = obj[key];
    if (isNumber(v)) return v;
  }
  errors.push(`Missing or invalid number field: ${keys.join("/")}`);
  return 0;
}

function requiredArray(obj: Record<string, unknown>, errors: string[], ...keys: string[]): unknown[] {
  for (const key of keys) {
    const v = obj[key];
    if (isArray(v)) return v;
  }
  errors.push(`Missing or invalid array field: ${keys.join("/")}`);
  return [];
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


function unwrapArray(obj: unknown, ...keys: string[]): unknown[] | null {
  if (isArray(obj)) return obj;
  if (isObject(obj)) {
    for (const key of keys) {
      const v = obj[key];
      if (isArray(v)) return v;
    }
  }
  return null;
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
    goal: requiredString(obj, errors, "goal"),
    preconditions: optionalStringArray(obj, "preconditions"),
    keyEvidence: optionalStringArray(obj, "keyEvidence") || optionalStringArray(obj, "key_evidence"),
    acceptanceCriteria: optionalStringArray(obj, "acceptanceCriteria") || optionalStringArray(obj, "acceptance_criteria"),
  };
}

function requiredNumberOr(obj: Record<string, unknown>, errors: string[], ...keys: string[]): number {
  for (const key of keys) {
    const v = obj[key];
    if (isNumber(v)) return v;
  }
  errors.push(`Missing or invalid number field: ${keys.join("/")}`);
  return 0;
}

export function validateSubtask(obj: unknown): ValidationResult<Subtask> {
  const errors: string[] = [];
  if (!isObject(obj)) return { ok: false, errors: ["Expected an object"] };
  const id = requiredString(obj, errors, "id");
  const stepStart = requiredNumberOr(obj, errors, "stepStart", "step_start");
  const stepEnd = requiredNumberOr(obj, errors, "stepEnd", "step_end");
  const oracleObj = obj["oracle"];
  const oracle = isObject(oracleObj) ? validateOracle(oracleObj, errors) : { goal: "", preconditions: [], keyEvidence: [], acceptanceCriteria: [] };
  const loopObj = obj["loopInfo"] || obj["loop_info"] || {};
  const loopInfo = isObject(loopObj) ? validateLoopInfo(loopObj, errors) : { isLoopRelated: false, loopRole: "none" as const, loopGroupId: null, reversibility: "reversible" as const, loopRiskScore: 0 };
  const phaseStatusRaw = optionalString(obj, "phaseStatus") || optionalString(obj, "phase_status");
  const phaseStatus = (phaseStatusRaw === "ok" || phaseStatusRaw === "warn" || phaseStatusRaw === "danger") ? phaseStatusRaw : undefined;
  return errors.length === 0
    ? { ok: true, value: { id, name: requiredString(obj, errors, "name") || `Subtask ${id}`, stepStart, stepEnd, oracle, loopInfo, phaseStatus } }
    : { ok: false, errors };
}

export function validateSubtasks(obj: unknown): ValidationResult<Subtask[]> {
  const arr = unwrapArray(obj, "subtasks", "tasks");
  if (!arr) return { ok: false, errors: ["Expected an array of subtasks"] };
  const results: Subtask[] = [];
  const allErrors: string[] = [];
  for (let i = 0; i < arr.length; i++) {
    if (!isObject(arr[i])) continue;
    const r = validateSubtask(arr[i]);
    if (r.ok) results.push(r.value);
    else allErrors.push(`Subtask[${i}]: ${r.errors.join("; ")}`);
  }
  return allErrors.length === 0 ? { ok: true, value: results } : { ok: false, errors: allErrors };
}

export function validateSubtaskEdges(obj: unknown): ValidationResult<SubtaskEdge[]> {
  const arr = unwrapArray(obj, "edges", "subtaskEdges", "subtask_edges");
  if (!arr) return { ok: false, errors: ["Expected an array of subtask edges"] };
  const results: SubtaskEdge[] = [];
  const allErrors: string[] = [];
  for (let i = 0; i < arr.length; i++) {
    const e = arr[i];
    if (!isObject(e)) continue;
    const errors: string[] = [];
    const src = requiredString(e, errors, "src", "from");
    const dst = requiredString(e, errors, "dst", "to");
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
  const arr = unwrapArray(obj, "agents", "agentNodes", "agent_nodes");
  if (!arr) return { ok: false, errors: ["Expected an array of agent nodes"] };
  const results: AgentNode[] = [];
  const allErrors: string[] = [];
  for (let i = 0; i < arr.length; i++) {
    const n = arr[i];
    if (!isObject(n)) continue;
    const errors: string[] = [];
    const subtaskId = requiredString(n, errors, "subtaskId", "subtask_id");
    const agent = requiredString(n, errors, "agent");
    const otarObj = n["otar"];
    const otar: OTAR = isObject(otarObj)
      ? {
          observation: requiredString(otarObj, errors, "observation"),
          thought: requiredString(otarObj, errors, "thought"),
          action: requiredString(otarObj, errors, "action"),
          result: requiredString(otarObj, errors, "result"),
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
  const arr = unwrapArray(obj, "edges", "agentEdges", "agent_edges");
  if (!arr) return { ok: false, errors: ["Expected an array of agent edges"] };
  const results: AgentEdge[] = [];
  const allErrors: string[] = [];
  const validDepTypes: AgentDepType[] = [
    "obs_dependency", "reasoning_continuation", "decision_dependency",
    "environment_feedback", "memory_ref", "loop_control",
  ];
  for (let i = 0; i < arr.length; i++) {
    const e = arr[i];
    if (!isObject(e)) continue;
    const errors: string[] = [];
    const subtaskId = requiredString(e, errors, "subtaskId", "subtask_id");
    const srcAgent = requiredString(e, errors, "srcAgent", "src_agent", "From_agent");
    const dstAgent = requiredString(e, errors, "dstAgent", "dst_agent", "To_agent");
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
  const stepsArr = requiredArray(obj, errors, "steps") || requiredArray(obj, errors, "candidates");
  const steps: CandidateStep[] = [];
  for (let i = 0; i < stepsArr.length; i++) {
    const s = stepsArr[i];
    if (!isObject(s)) continue;
    steps.push({
      stepId: requiredNumberOr(s, errors, "stepId", "step_id"),
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
      deviationDescription: optionalString(s, "deviationDescription") || optionalString(s, "deviation_description") || undefined,
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
  const rootCauseTitleRaw = optionalString(obj, "rootCauseTitle") || optionalString(obj, "root_cause_title");
  const rulesApplied = rawRules.filter((r: string) => validRules.includes(r)) as Attribution["rulesApplied"];
  const rootCauseSeverityRaw = optionalString(obj, "rootCauseSeverity") || optionalString(obj, "root_cause_severity");
  const rootCauseTitle = rootCauseTitleRaw || undefined;
  const rootCauseSeverity = (rootCauseSeverityRaw === "primary" || rootCauseSeverityRaw === "secondary") ? rootCauseSeverityRaw : undefined;
  const result: Attribution = {
    mistakeAgent: requiredString(obj, errors, "mistakeAgent", "mistake_agent", "Agent Name"),
    mistakeStep: requiredNumberOr(obj, errors, "mistakeStep", "mistake_step", "Step Number"),
    reason: requiredString(obj, errors, "reason", "Reason for Mistake"),
    rulesApplied,
    rootCauseTitle,
    rootCauseSeverity,
  };
  return errors.length === 0 ? { ok: true, value: result } : { ok: false, errors };
}

export function validateStepDataFlows(obj: unknown): ValidationResult<StepDataFlow[]> {
  const arr = unwrapArray(obj, "dataFlows", "stepDataFlows", "data_flows");
  if (!arr) return { ok: false, errors: ["Expected an array of data flows"] };
  const results: StepDataFlow[] = [];
  const allErrors: string[] = [];
  for (let i = 0; i < arr.length; i++) {
    const f = arr[i];
    if (!isObject(f)) continue;
    const errors: string[] = [];
    results.push({
      subtaskId: requiredString(f, errors, "subtaskId", "subtask_id"),
      fromStep: requiredNumberOr(f, errors, "fromStep", "from_step"),
      toStep: requiredNumberOr(f, errors, "toStep", "to_step"),
      sourceAgent: requiredString(f, errors, "sourceAgent", "source_agent"),
      targetAgent: requiredString(f, errors, "targetAgent", "target_agent"),
      dataItem: requiredString(f, errors, "dataItem", "data_item"),
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
  const layer = requiredString(obj, errors, "layer");
  const actionRaw = optionalString(obj, "action");
  const action = VALID_ACTIONS.includes(actionRaw) ? actionRaw as "modify" | "add" | "remove" | "reorder" : "modify";
  const current = obj["current"];
  const proposed = requiredString(obj, errors, "proposed");
  const rationale = requiredString(obj, errors, "rationale");
  if (errors.length > 0) return null;
  return { layer, action, current: isString(current) ? current : undefined, proposed, rationale };
}

export interface HarnessRuleOutput {
  id: string;
  category: string;
  targetLayer: string;
  targetScope: "application" | "shared";
  targetApplication?: string;
  abstract: string;
  rawDescription: string;
  severity: number;
  suggestion: { layer: string; action: "modify" | "add" | "remove" | "reorder"; current?: string; proposed: string; rationale: string };
}

export function validateHarnessRuleOutput(obj: unknown): ValidationResult<HarnessRuleOutput> {
  const errors: string[] = [];
  if (!isObject(obj)) return { ok: false, errors: ["Expected an object"] };

  const id = requiredString(obj, errors, "id");
  const categoryRaw = optionalString(obj, "category");
  const category = VALID_CATEGORIES.includes(categoryRaw) ? categoryRaw : "other";
  const targetLayer = requiredString(obj, errors, "targetLayer") || optionalString(obj, "target_layer");
  const targetScopeRaw = optionalString(obj, "targetScope") || optionalString(obj, "target_scope");
  const targetScope = targetScopeRaw === "application" ? "application" : "shared";
  const targetApplication = optionalString(obj, "targetApplication")
    || optionalString(obj, "target_application")
    || undefined;
  if (targetScope === "application" && !targetApplication) {
    errors.push("Application-scoped rule requires targetApplication");
  }
  const abstract = requiredString(obj, errors, "abstract");
  const rawDescription = requiredString(obj, errors, "rawDescription") || optionalString(obj, "raw_description");
  const severity = requiredNumber(obj, errors, "severity");

  const suggObj = obj["suggestion"];
  const suggestion = isObject(suggObj) ? validateRuleSuggestion(suggObj, errors) : null;
  if (!suggestion) errors.push("Missing or invalid suggestion");

  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      id, category, targetLayer, targetScope, targetApplication, abstract, rawDescription,
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
    else allErrors.push(`Rule[${i}](${typeof obj[i] === "object" && obj[i] ? (obj[i] as Record<string,unknown>)["id"] || "?" : "?"}): ${r.errors.join("; ")}`);
  }
  return allErrors.length === 0 ? { ok: true, value: results } : { ok: false, partial: results, errors: allErrors };
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

  const newRuleId = requiredString(obj, errors, "newRuleId") || optionalString(obj, "new_rule_id");
  const decisionRaw = optionalString(obj, "decision");
  const decision = decisionRaw === "merge" || decisionRaw === "new" ? decisionRaw : "new";
  const targetRuleId = optionalString(obj, "targetRuleId") || optionalString(obj, "target_rule_id") || undefined;
  const reasoning = requiredString(obj, errors, "reasoning");

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
