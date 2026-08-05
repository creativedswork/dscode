// ── CHIEF Iterative Focusing Types ──
// Types for the three-pass focusing pipeline: Scan → Zoom → Synthesize.
// Reuses existing CHIEF schemas (SubtaskEdge, AgentNode, AgentEdge, StepDataFlow)
// for zone-level analysis results.

import type {
  SubtaskEdge,
  AgentNode,
  AgentEdge,
  StepDataFlow,
} from "../schemas.js";

// ── Session Skeleton (deterministic, from rule engine output) ──

export interface SkeletonMeta {
  question: string;
  totalSteps: number;
  totalMessages: number;
  errorRate: string;
  duration: string;
  model: string;
}

export interface SkeletonStats {
  toolCalls: number;
  toolErrors: number;
  userComplaints: number;
  screenshotsTaken: number;
}

export interface PhaseEntry {
  id: string;
  label: string;
  stepRange: string;
  status: "ok" | "warn" | "danger";
  toolSummary: string;
}

export type SignalType =
  | "user_complaint"
  | "tool_error"
  | "screenshot_divergence"
  | "phase_boundary"
  | "root_cause_evidence";

export type SignalPriority = "high" | "medium";

export interface SignalAnchor {
  stepId: number;
  type: SignalType;
  label: string;
  priority: SignalPriority;
}

export interface HotZoneStep {
  stepId: number;
  agent: string;
  action: string;
  thought: string;
  result: string;
  isError: boolean;
}

export interface HotZone {
  stepStart: number;
  stepEnd: number;
  suspicionScore: number;
  primarySignal: SignalType;
  signals: SignalAnchor[];
  steps: HotZoneStep[];
}

export interface ColdZone {
  stepRange: string;
  toolCountByAgent: Record<string, number>;
  errorCount: number;
  userMessages: number;
}

export interface DataItemTracking {
  dataItem: string;
  operationCount: number;
  stepIds: number[];
  agents: string[];
  isHot: boolean;
}

export interface SessionSkeleton {
  meta: SkeletonMeta;
  stats: SkeletonStats;
  phases: PhaseEntry[];
  signalAnchors: SignalAnchor[];
  hotZones: HotZone[];
  coldZones: ColdZone[];
  dataItems: DataItemTracking[];
}

// ── Pass 1: Scan ──

export type PrimarySignalType =
  | "user_complaint_cluster"
  | "error_burst"
  | "repair_loop"
  | "screenshot_divergence"
  | "irreversible_action"
  | "taste_drift";

export interface AttentionZone {
  id: string;
  stepStart: number;
  stepEnd: number;
  suspicionScore: number;
  primarySignal: PrimarySignalType;
  summary: string;
  keyAgents: string[];
  keyDataItems: string[];
}

export interface ScanResult {
  zones: AttentionZone[];
  globalAssessment: string;
  noIssuesDetected: boolean;
}

// ── Pass 2: Zoom ──

export interface ZoneSubtask {
  id: string;
  name: string;
  stepStart: number;
  stepEnd: number;
  oracle: { goal: string; preconditions: string[]; keyEvidence: string[]; acceptanceCriteria: string[] };
  loopInfo: {
    isLoopRelated: boolean;
    loopRole: "entry" | "internal" | "exit" | "none";
    loopGroupId: string | null;
    reversibility: "reversible" | "partial" | "irreversible";
    loopRiskScore: number;
  };
}

export interface ZoneCandidate {
  stepId: number;
  agentsInStep: string[];
  dataIssue: boolean;
  dataItem: string;
  sourceStep: number | null;
  irrecoverable: boolean;
  irrecoverableReason: string;
  affectedSteps: number[];
  impactScore: number;
  confidence: number;
  errorType?: "hash_ambiguity" | "network_timeout" | "permission_denied" | "file_not_found" | "syntax_error" | "runtime_exception" | "unknown" | "tool_misuse" | "misdiagnosis" | "overcorrection" | "perception_gap" | "taste_degraded" | "scope_creep" | "repair_loop" | "deadlock" | "context_overflow";
  errorLayer?: "tool_error" | "agent_error" | "process_error";
}

export interface ZoneAnalysis {
  zoneId: string;
  subtasks: ZoneSubtask[];
  subtaskEdges: SubtaskEdge[];
  agentNodes: AgentNode[];
  agentEdges: AgentEdge[];
  stepDataFlows: StepDataFlow[];
  candidates: ZoneCandidate[];
  topCandidate: ZoneCandidate | null;
  zoneGraphComplete: boolean;
}

// ── Pass 3: Synthesize ──

export type CascadeMechanism =
  | "data_contamination"
  | "irreversible_lock_in"
  | "perception_blind_spot"
  | "repair_cascade"
  | "taste_drift_propagation";

export interface CascadeEdge {
  fromZoneId: string;
  fromStepId: number;
  toZoneId: string;
  toStepId: number;
  dataItem: string;
  mechanism: CascadeMechanism;
}

export interface AlternateRootCause {
  stepId: number;
  agent: string;
  reason: string;
  confidence: number;
}

export interface FocusAttribution {
  mistakeAgent: string;
  mistakeStep: number;
  zoneId: string;
  reason: string;
  rulesApplied: string[];
  cascadePath: CascadeEdge[];
  alternateRootCauses: AlternateRootCause[];
  recoveryArcs?: import("../schemas.js").RecoveryArc[];
}

// ── Focus Report (pipeline output) ──

export interface FocusReport {
  skeleton: SessionSkeleton;
  scan: ScanResult;
  zoneAnalyses: ZoneAnalysis[];
  attribution: FocusAttribution;
  totalLLMCalls: number;
}
