import type { CausalGraphSnapshot, Attribution } from "./schemas.js";
import type { HarnessRule } from "./rules/types.js";
export type { HarnessRule } from "./rules/types.js";


// ── Eval Types ──
// Data structures for session quality analysis.

export interface PhaseInfo {
  label: string;
  startIdx: number;
  endIdx: number;
  status: "ok" | "warn" | "danger";
  summary: string;
  toolCalls: { total: number; errors: number };
}

export interface DeviationPoint {
  messageIdx: number;
  screenshotKeyword: string;
  targetKeyword: string;
  severity: "low" | "medium" | "high";
  description: string;
}

export interface RootCause {
  title: string;
  description: string;
  evidenceIndices: number[];
  severity: "primary" | "secondary";
}

export interface SessionMeta {
  sessionId: string;
  title: string;
  model: string;
  totalMessages: number;
  duration: string;
  projectPath: string;
  startedAt: string;
  endedAt: string;
}

export interface ToolStats {
  toolCalls: number;
  toolErrors: number;
  errorRate: string;
  screenshotsTaken: number;
  userComplaints: number;
}

export interface TimelineEvent {
  messageIdx: number;
  type: "phase_start" | "deviation" | "complaint" | "error" | "screenshot";
  label: string;
  severity?: "ok" | "warn" | "danger";
}


export interface EvalResult {
  metadata: SessionMeta;
  stats: ToolStats;
  phases: PhaseInfo[];
  deviations: DeviationPoint[];
  rootCauses: RootCause[];
  rules: HarnessRule[];
  analysisMode: "llm" | "rule";
  timeline: TimelineEvent[];
  causalGraph: CausalGraphSnapshot | null;
  attribution: Attribution | null;
  rulesApplied: string[];
}

export interface CompactMessage {
  idx: number;
  role: "user" | "assistant";
  intent?: string;
  toolsCalled?: string[];
  screenshotDesc?: string;
  error?: string;
  userEmotion?: "neutral" | "frustrated" | "confused";
  keyQuote?: string;
  toolArgs?: string;
  toolResult?: string;
  thinking?: string;
}
