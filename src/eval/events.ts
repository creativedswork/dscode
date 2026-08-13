export type EvalDashboardStage =
  | "prepare"
  | "graph"
  | "oracle"
  | "backtrack"
  | "attribution"
  | "rules"
  | "dashboard";

export interface EvalDashboardEvidenceSummary {
  totalActors: number;
  subagentCount: number;
  fullTranscripts: number;
  summaryTranscripts: number;
  missingTranscripts: number;
  completeness: "complete" | "partial";
  affectedAgentIds: string[];
}

export type EvalDashboardState =
  | {
      status: "starting";
      requestedSessionId?: string;
      startedAt: number;
    }
  | {
      status: "running";
      targetSessionId: string;
      runId: string;
      stage: EvalDashboardStage;
      stageStatus: "running" | "done" | "failed";
      index: number;
      total: number;
      application: string;
      workerAgentId?: string;
      retryCount?: number;
      durationMs?: number;
      message: string;
      startedAt: number;
      actorCount: number;
      stepCount: number;
      evidence: EvalDashboardEvidenceSummary;
    }
  | {
      status: "completed";
      targetSessionId: string;
      runId: string;
      html: string;
      outputPath: string;
      generatedAt: number;
    }
  | {
      status: "failed";
      requestedSessionId?: string;
      targetSessionId?: string;
      runId?: string;
      stage?: EvalDashboardStage;
      error: string;
    };

export type EvalDashboardEvent = {
  type: "eval:dashboard";
  state: EvalDashboardState;
};
