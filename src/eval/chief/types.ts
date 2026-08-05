import type { TrajectoryEvidenceQuality } from "../trajectory.js";

export interface ChiefSubtask {
  id: string;
  name: string;
  stepIds: number[];
  status: "ok" | "warn" | "danger";
  summary: string;
}

export interface ChiefAgentNode {
  subtaskId: string;
  agentId: string;
  application: string;
  role: "main" | "subagent";
  stepIds: number[];
  observation: string;
  thought: string;
  action: string;
  result: string;
}

export interface ChiefGraphEdge {
  source: string;
  target: string;
  type: "control" | "data" | "result" | "planning";
  strength: number;
  evidenceStepIds: number[];
  summary: string;
}

export interface ChiefGraph {
  subtasks: ChiefSubtask[];
  agents: ChiefAgentNode[];
  edges: ChiefGraphEdge[];
  dataFlows: Array<{
    sourceStepId: number;
    targetStepId: number;
    sourceAgentId: string;
    targetAgentId: string;
    dataItem: string;
    correctness: "correct" | "misinterpreted" | "misused" | "fabricated" | "unknown";
  }>;
}

export interface ChiefOracle {
  subtaskId: string;
  goal: string;
  preconditions: string[];
  keyEvidence: string[];
  acceptanceCriteria: string[];
}

export interface ChiefBacktrackCandidate {
  id: string;
  score: number;
  reason: string;
}

export interface ChiefBacktrack {
  subtaskCandidates: ChiefBacktrackCandidate[];
  agentCandidates: ChiefBacktrackCandidate[];
  stepCandidates: ChiefBacktrackCandidate[];
  screenedSubtasks: string[];
  screenedAgentIds: string[];
  screenedStepIds: number[];
}

export interface ChiefRecoveryArc {
  errorAgentId: string;
  errorApplication: string;
  errorStepId: number;
  detectionAgentId: string;
  detectionApplication: string;
  detectionStepId: number;
  correctionAgentId: string;
  correctionApplication: string;
  correctionStepId: number;
  detectionType:
    | "tool_error"
    | "user_complaint"
    | "test_failure"
    | "screenshot_divergence"
    | "self_correction"
    | "agent_review";
  errorSummary: string;
  correctionSummary: string;
  effective: boolean;
  stepsToRecover: number;
  misdiagnosisCount: number;
  rootCauseHypothesis: string;
  crossAgent: boolean;
  errorStep: number;
  errorAgent: string;
  detectionStep: number;
  correctionStep: number;
  correctionAgent: string;
}

export interface ChiefAttribution {
  mistakeAgent: string;
  mistakeAgentId: string;
  mistakeApplication: string;
  mistakeSubtaskId: string;
  mistakeStep: number | null;
  granularity: "subtask" | "agent" | "step";
  confidence: number;
  evidenceQuality: TrajectoryEvidenceQuality;
  reason: string;
  rootCauseTitle: string;
  rootCauseSeverity: "primary" | "secondary";
  rulesApplied: Array<
    "local"
    | "planning_control"
    | "data_flow"
    | "deviation_irrecoverability"
  >;
  recoveryArcs: ChiefRecoveryArc[];
  recoveryDiagnostics?: string[];
  screeningStages?: ChiefBacktrack;
}
