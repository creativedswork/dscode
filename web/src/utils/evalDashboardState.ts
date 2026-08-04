import type {
  EvalDashboardEvidenceSummary,
  EvalDashboardServerEvent,
  EvalDashboardStage,
} from "../types";
import type { EvalDashboardCacheEntry } from "./evalDashboardCache";

export const EVAL_DASHBOARD_STAGES: EvalDashboardStage[] = [
  "prepare",
  "graph",
  "oracle",
  "backtrack",
  "attribution",
  "rules",
  "dashboard",
];

export interface EvalDashboardStageState {
  stage: EvalDashboardStage;
  index: number;
  status: "pending" | "running" | "done" | "failed";
  application?: string;
  workerAgentId?: string;
  retryCount?: number;
  durationMs?: number;
  message?: string;
}

export interface EvalDashboardViewState {
  status: "starting" | "running" | "completed" | "failed";
  requestedSessionId?: string;
  targetSessionId?: string;
  runId?: string;
  startedAt: number;
  actorCount?: number;
  stepCount?: number;
  evidence?: EvalDashboardEvidenceSummary;
  stages: EvalDashboardStageState[];
  activeStage?: EvalDashboardStage;
  application?: string;
  workerAgentId?: string;
  retryCount?: number;
  html?: string;
  generatedAt?: number;
  error?: string;
}

function pendingStages(): EvalDashboardStageState[] {
  return EVAL_DASHBOARD_STAGES.map((stage, index) => ({
    stage,
    index: index + 1,
    status: "pending",
  }));
}

function sameActiveRun(
  current: EvalDashboardViewState | null,
  event: Exclude<EvalDashboardServerEvent, { status: "starting" }>,
): boolean {
  if (!current?.runId || !event.runId) return true;
  return current.runId === event.runId;
}

function updateStage(
  stages: EvalDashboardStageState[],
  event: Extract<EvalDashboardServerEvent, { status: "running" }>,
): EvalDashboardStageState[] {
  return stages.map((stage) => stage.stage === event.stage
    ? {
        ...stage,
        status: event.stageStatus,
        application: event.application,
        workerAgentId: event.workerAgentId,
        retryCount: event.retryCount,
        durationMs: event.durationMs,
        message: event.message,
      }
    : stage);
}

export function reduceEvalDashboardState(
  current: EvalDashboardViewState | null,
  event: EvalDashboardServerEvent,
): EvalDashboardViewState {
  if (event.status === "starting") {
    return {
      status: "starting",
      requestedSessionId: event.requestedSessionId,
      startedAt: event.startedAt,
      stages: pendingStages(),
    };
  }

  if (!sameActiveRun(current, event)) {
    return current!;
  }

  if (event.status === "running") {
    if (
      current?.runId === event.runId
      && (current.status === "completed" || current.status === "failed")
    ) {
      return current;
    }
    const stages = current?.runId === event.runId
      ? current.stages
      : pendingStages();
    return {
      ...current,
      status: "running",
      targetSessionId: event.targetSessionId,
      runId: event.runId,
      startedAt: event.startedAt,
      actorCount: event.actorCount,
      stepCount: event.stepCount,
      evidence: event.evidence,
      stages: updateStage(stages, event),
      activeStage: event.stage,
      application: event.application,
      workerAgentId: event.workerAgentId,
      retryCount: event.retryCount,
      html: undefined,
      generatedAt: undefined,
      error: undefined,
    };
  }

  if (event.status === "completed") {
    if (current?.status === "failed" && current.runId === event.runId) {
      return current;
    }
    return {
      ...current,
      status: "completed",
      targetSessionId: event.targetSessionId,
      runId: event.runId,
      startedAt: current?.startedAt ?? event.generatedAt,
      stages: current?.stages ?? pendingStages(),
      activeStage: "dashboard",
      application: undefined,
      workerAgentId: undefined,
      retryCount: undefined,
      html: event.html,
      generatedAt: event.generatedAt,
      error: undefined,
    };
  }

  return {
    ...current,
    status: "failed",
    requestedSessionId: event.requestedSessionId ?? current?.requestedSessionId,
    targetSessionId: event.targetSessionId ?? current?.targetSessionId,
    runId: event.runId ?? current?.runId,
    startedAt: current?.startedAt ?? Date.now(),
    stages: current?.stages ?? pendingStages(),
    activeStage: event.stage ?? current?.activeStage,
    application: undefined,
    workerAgentId: undefined,
    retryCount: undefined,
    html: undefined,
    generatedAt: undefined,
    error: event.error,
  };
}

export function evalDashboardStateFromCache(
  entry: EvalDashboardCacheEntry,
): EvalDashboardViewState {
  return {
    status: "completed",
    targetSessionId: entry.targetSessionId,
    runId: entry.runId,
    startedAt: entry.generatedAt,
    stages: pendingStages().map((stage) => ({ ...stage, status: "done" })),
    activeStage: "dashboard",
    html: entry.html,
    generatedAt: entry.generatedAt,
  };
}
