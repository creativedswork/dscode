import type { HarnessAPI } from "../../core/harness-api.js";
import type { Logger } from "../../utils/logger.js";
import type { CausalGraphSnapshot } from "../schemas.js";
import { attributeRulesWithAgent } from "../rules/extraction.js";
import type { HarnessRule } from "../rules/types.js";
import { computeStats } from "../stats.js";
import type { MultiAgentTrajectory } from "../trajectory.js";
import type {
  DeviationPoint,
  EvalResult,
  PhaseInfo,
  TimelineEvent,
} from "../types.js";
import { runStructuredAgent } from "./runner.js";
import type {
  ChiefAttribution,
  ChiefBacktrack,
  ChiefGraph,
  ChiefOracle,
} from "./types.js";
import {
  validateChiefAttribution,
  validateChiefBacktrack,
  validateChiefGraph,
  validateChiefOracles,
} from "./validation.js";
import {
  finishEvalRun,
  updateRunStage,
  writeStageOutput,
  type ChiefStage,
  type EvalRunContext,
} from "./workspace.js";

export interface ChiefProgressEvent {
  runId: string;
  targetSessionId: string;
  stage: ChiefStage;
  application: string;
  workerAgentId?: string;
  index: number;
  total: number;
  status: "running" | "done" | "failed";
  durationMs?: number;
  retryCount?: number;
  message: string;
}

export interface RunChiefPipelineOptions {
  trajectory: MultiAgentTrajectory;
  harness: HarnessAPI;
  run: EvalRunContext;
  signal?: AbortSignal;
  logger?: Logger;
  onProgress?: (event: ChiefProgressEvent) => void;
}

const PIPELINE_STAGE_COUNT = 7;

function graphPrompt(run: EvalRunContext): string {
  return `Build the CHIEF hierarchical causal graph for this frozen eval run.

Workspace: ${run.runRoot}
Read manifest.json and all required library files. Step chunks are listed in the manifest.

Return one JSON object with this exact shape:
{
  "subtasks": [{
    "id": "subtask-stable-id",
    "name": "short name",
    "stepIds": [0],
    "status": "ok|warn|danger",
    "summary": "what happened"
  }],
  "agents": [{
    "subtaskId": "subtask-stable-id",
    "agentId": "exact actor ID",
    "application": "exact Application",
    "role": "main|subagent",
    "stepIds": [0],
    "observation": "OTAR observation",
    "thought": "OTAR thought",
    "action": "OTAR action, including tool names as actions",
    "result": "OTAR result"
  }],
  "edges": [{
    "source": "subtask ID, Agent ID, or step:N",
    "target": "subtask ID, Agent ID, or step:N",
    "type": "control|data|result|planning",
    "strength": 0.0,
    "evidenceStepIds": [0],
    "summary": "causal dependency"
  }],
  "dataFlows": [{
    "sourceStepId": 0,
    "targetStepId": 1,
    "sourceAgentId": "exact actor ID",
    "targetAgentId": "exact actor ID",
    "dataItem": "transferred data",
    "correctness": "correct|misinterpreted|misused|fabricated|unknown"
  }]
}

Every Step must appear in exactly one subtask. Agent stepIds must be owned by that exact actor and belong to the node's subtask. Preserve cross-Agent control and data dependencies.`;
}

function oraclePrompt(run: EvalRunContext): string {
  return `Synthesize a Virtual Oracle for every subtask in output/graph.json.

Workspace: ${run.runRoot}
Read manifest.json, output/graph.json, and only the trajectory chunks needed to verify expectations.

Return one JSON array with exactly one entry per graph subtask:
[{
  "subtaskId": "exact subtask ID",
  "goal": "expected goal",
  "preconditions": ["precondition or constraint"],
  "keyEvidence": ["observable evidence to inspect"],
  "acceptanceCriteria": ["criterion that proves success"]
}]

Do not omit, duplicate, or invent subtask IDs. Keep expected behavior distinct from observed behavior.`;
}

function backtrackPrompt(run: EvalRunContext): string {
  return `Perform CHIEF hierarchical backtracking using output/graph.json and output/oracle.json.

Workspace: ${run.runRoot}
Screen in strict order: Subtask -> real Agent process -> Step. Follow cross-Agent control and data-flow edges. Missing or summary-only transcript evidence must not produce invented Step candidates.

Return one JSON object:
{
  "subtaskCandidates": [{"id": "exact subtask ID", "score": 0.0, "reason": "evidence"}],
  "agentCandidates": [{"id": "exact Agent ID", "score": 0.0, "reason": "evidence"}],
  "stepCandidates": [{"id": "Step ID encoded as a string", "score": 0.0, "reason": "evidence"}],
  "screenedSubtasks": ["all exact subtask IDs considered"],
  "screenedAgentIds": ["all exact Agent IDs considered"],
  "screenedStepIds": [0]
}

Include at least one subtask candidate and one Agent candidate.`;
}

function attributionPrompt(run: EvalRunContext): string {
  return `Produce the final CHIEF progressive attribution from output/graph.json, output/oracle.json, and output/backtrack.json.

Workspace: ${run.runRoot}
Apply evidence in order: local, planning/control, data flow, deviation/irrecoverability. Attribute one real Agent. Use Step granularity only with full transcript evidence; otherwise set mistakeStep to null and choose Agent or subtask granularity.

Return one JSON object:
{
  "mistakeAgentId": "exact Agent ID",
  "mistakeApplication": "exact Application",
  "mistakeSubtaskId": "exact subtask ID",
  "mistakeStep": 0,
  "granularity": "subtask|agent|step",
  "confidence": 0.0,
  "evidenceQuality": "full|summary|missing",
  "reason": "causal explanation",
  "rootCauseTitle": "short title",
  "rootCauseSeverity": "primary|secondary",
  "rulesApplied": ["local|planning_control|data_flow|deviation_irrecoverability"],
  "recoveryArcs": [{
    "errorAgentId": "exact Agent ID",
    "errorApplication": "exact Application",
    "errorStep": 0,
    "detectionAgentId": "exact Agent ID",
    "detectionApplication": "exact Application",
    "detectionStep": 1,
    "correctionAgentId": "exact Agent ID",
    "correctionApplication": "exact Application",
    "correctionStep": 2,
    "detectionType": "tool_error|user_complaint|test_failure|screenshot_divergence|self_correction|agent_review",
    "errorSummary": "error",
    "correctionSummary": "correction",
    "effective": true,
    "stepsToRecover": 2,
    "misdiagnosisCount": 0,
    "rootCauseHypothesis": "hypothesis"
  }]
}

Use an empty recoveryArcs array when no validated recovery exists. Treat an
effective early recovery as reversible evidence, but do not erase responsibility
when correction happened only after downstream failure.`;
}

function toSnapshot(
  graph: ChiefGraph,
  oracles: ChiefOracle[],
  trajectory: MultiAgentTrajectory,
): CausalGraphSnapshot {
  const oracleBySubtask = new Map(oracles.map((oracle) => [oracle.subtaskId, oracle]));
  const actorById = new Map(trajectory.actors.map((actor) => [actor.agentId, actor]));
  const subtaskIds = new Set(graph.subtasks.map((subtask) => subtask.id));
  const displayActor = (agentId: string) => {
    const actor = actorById.get(agentId);
    return actor ? `${actor.application} (${agentId.slice(0, 6)})` : agentId;
  };
  return {
    subtasks: graph.subtasks.map((subtask) => {
      const agentNodes = graph.agents.filter((agent) => agent.subtaskId === subtask.id);
      return {
        id: subtask.id,
        name: subtask.name,
        stepRange: `${Math.min(...subtask.stepIds)}-${Math.max(...subtask.stepIds)}`,
        oracleGoal: oracleBySubtask.get(subtask.id)?.goal ?? "",
        loopSummary: "CHIEF hierarchical subtask",
        agentCount: new Set(agentNodes.map((agent) => agent.agentId)).size,
        keyActions: agentNodes.map((agent) =>
          `${displayActor(agent.agentId)}: ${agent.action.slice(0, 120)}`,
        ),
        hasErrors: subtask.status !== "ok",
        status: subtask.status,
      };
    }),
    subtaskEdges: graph.edges
      .filter((edge) => subtaskIds.has(edge.source) && subtaskIds.has(edge.target))
      .map((edge) => ({
        src: edge.source,
        dst: edge.target,
        type: edge.type,
        strength: edge.strength,
        keyDataTransfers: graph.dataFlows
          .filter((flow) => edge.evidenceStepIds.includes(flow.sourceStepId))
          .map((flow) => flow.dataItem),
        failureModeSummary: edge.summary,
      })),
    agentSummaries: graph.agents.map((agent) => ({
      subtaskId: agent.subtaskId,
      agent: displayActor(agent.agentId),
      keyAction: agent.action.slice(0, 120),
      stepIds: agent.stepIds,
    })),
    agentEdges: graph.edges
      .filter((edge) => actorById.has(edge.source) && actorById.has(edge.target))
      .map((edge) => ({
        src: displayActor(edge.source),
        dst: displayActor(edge.target),
        type: edge.type,
        strength: edge.strength,
        keyDataTransfers: [],
        failureModeSummary: edge.summary,
      })),
    dataFlows: graph.dataFlows.map((flow) => ({
      dataItem: flow.dataItem,
      path: `step${flow.sourceStepId}(${displayActor(flow.sourceAgentId)}) -> step${flow.targetStepId}(${displayActor(flow.targetAgentId)})`,
      correctness: flow.correctness,
    })),
    totalSteps: trajectory.steps.length,
  };
}

function composeResult(
  trajectory: MultiAgentTrajectory,
  graph: ChiefGraph,
  oracles: ChiefOracle[],
  backtrack: ChiefBacktrack,
  attribution: ChiefAttribution,
  rules: HarnessRule[],
): EvalResult {
  const sessionStats = computeStats(trajectory);
  const stepsById = new Map(trajectory.steps.map((step) => [step.stepId, step]));
  const phases: PhaseInfo[] = graph.subtasks.map((subtask) => {
    const steps = subtask.stepIds
      .map((stepId) => stepsById.get(stepId))
      .filter((step) => !!step);
    return {
      label: subtask.name,
      startIdx: Math.min(...subtask.stepIds),
      endIdx: Math.max(...subtask.stepIds),
      status: subtask.status,
      summary: subtask.summary,
      toolCalls: {
        total: steps.filter((step) => !!step.toolName).length,
        errors: steps.filter((step) => step.isError).length,
      },
    };
  });
  const deviations: DeviationPoint[] = backtrack.stepCandidates.map((candidate) => ({
    messageIdx: Number(candidate.id),
    screenshotKeyword: "",
    targetKeyword: "",
    severity: candidate.score >= 0.7 ? "high" : candidate.score >= 0.4 ? "medium" : "low",
    description: candidate.reason,
  }));
  const timeline: TimelineEvent[] = phases.map((phase) => ({
    messageIdx: phase.startIdx,
    type: "phase_start",
    label: phase.label,
    severity: phase.status,
  }));
  return {
    ...sessionStats,
    phases,
    deviations,
    rootCauses: [{
      title: attribution.rootCauseTitle,
      description: attribution.reason,
      evidenceIndices: attribution.mistakeStep === null ? [] : [attribution.mistakeStep],
      severity: attribution.rootCauseSeverity,
    }],
    rules,
    timeline,
    causalGraph: toSnapshot(graph, oracles, trajectory),
    attribution: { ...attribution, screeningStages: backtrack },
    rulesApplied: attribution.rulesApplied,
    recoveryArcs: attribution.recoveryArcs,
    actors: trajectory.actors,
    trajectoryEvidence: trajectory.evidence,
    trajectory: {
      steps: trajectory.steps,
      controlEdges: trajectory.controlEdges,
      dataEdges: trajectory.dataEdges,
    },
  };
}

async function completeStage(
  run: EvalRunContext,
  stage: ChiefStage,
  application: string,
  output: unknown,
  retryCount: number,
): Promise<void> {
  await writeStageOutput(run, stage, output);
  await updateRunStage(run, stage, {
    status: "done",
    application,
    retryCount,
  });
}

export async function runChiefPipeline(
  options: RunChiefPipelineOptions,
): Promise<EvalResult> {
  const { trajectory, harness, run, signal, logger, onProgress } = options;
  const emit = (
    event: Omit<ChiefProgressEvent, "runId" | "targetSessionId" | "total">,
  ) => {
    const full: ChiefProgressEvent = {
      runId: run.manifest.runId,
      targetSessionId: trajectory.session.metadata.id,
      total: PIPELINE_STAGE_COUNT,
      ...event,
    };
    onProgress?.(full);
    logger?.info(
      "CHIEF",
      JSON.stringify({
        runId: full.runId,
        targetSessionId: full.targetSessionId,
        stage: full.stage,
        status: full.status,
        application: full.application,
        workerAgentId: full.workerAgentId,
        durationMs: full.durationMs,
        retryCount: full.retryCount,
      }),
    );
  };
  const execute = async <T>(
    stage: ChiefStage,
    application: string,
    index: number,
    prompt: string,
    validate: (value: unknown) => import("../schemas.js").ValidationResult<T>,
  ): Promise<T> => {
    const startedAt = Date.now();
    let workerAgentId: string | undefined;
    let retryCount = 0;
    emit({
      stage,
      application,
      index,
      status: "running",
      message: `${application} is running`,
    });
    try {
      const result = await runStructuredAgent({
        host: harness,
        application,
        prompt,
        workspace: run.runRoot,
        stage,
        validate,
        runContext: run,
        signal,
        logger,
        onWorker: (agentId, attempt) => {
          workerAgentId = agentId;
          retryCount = attempt - 1;
          emit({
            stage,
            application,
            workerAgentId: agentId,
            index,
            status: "running",
            retryCount,
            message: `${application} (${agentId.slice(0, 6)}) is running`,
          });
        },
      });
      await completeStage(run, stage, application, result.value, result.attempts - 1);
      emit({
        stage,
        application,
        workerAgentId: result.workerAgentIds.at(-1) ?? workerAgentId,
        index,
        status: "done",
        durationMs: Date.now() - startedAt,
        retryCount: result.attempts - 1,
        message: `${application} completed`,
      });
      return result.value;
    } catch (error) {
      emit({
        stage,
        application,
        workerAgentId,
        index,
        status: "failed",
        durationMs: Date.now() - startedAt,
        retryCount,
        message: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  };

  try {
    emit({
      stage: "prepare",
      application: "coordinator",
      index: 1,
      status: "done",
      durationMs: 0,
      message: `${trajectory.actors.length} actors and ${trajectory.steps.length} Steps prepared`,
    });
    const graph = await execute(
      "graph",
      "chief-graph",
      2,
      graphPrompt(run),
      (value) => validateChiefGraph(value, trajectory),
    );
    const oracles = await execute(
      "oracle",
      "chief-oracle",
      3,
      oraclePrompt(run),
      (value) => validateChiefOracles(value, graph),
    );
    const backtrack = await execute(
      "backtrack",
      "chief-backtrack",
      4,
      backtrackPrompt(run),
      (value) => validateChiefBacktrack(value, trajectory, graph),
    );
    const attribution = await execute(
      "attribution",
      "chief-attribution",
      5,
      attributionPrompt(run),
      (value) => validateChiefAttribution(value, trajectory, graph),
    );
    let rules: HarnessRule[] = [];
    const rulesStartedAt = Date.now();
    let rulesWorkerAgentId: string | undefined;
    let rulesRetryCount = 0;
    emit({
      stage: "rules",
      application: "eval-rule-attribution",
      index: 6,
      status: "running",
      message: "eval-rule-attribution is running",
    });
    try {
      rules = await attributeRulesWithAgent({
        trajectory,
        attribution,
        graph,
        oracles,
        backtrack,
        harness,
        run,
        signal,
        logger,
        onWorker: (agentId, attempt) => {
          rulesWorkerAgentId = agentId;
          rulesRetryCount = attempt - 1;
          emit({
            stage: "rules",
            application: "eval-rule-attribution",
            workerAgentId: agentId,
            index: 6,
            status: "running",
            retryCount: rulesRetryCount,
            message: `eval-rule-attribution (${agentId.slice(0, 6)}) is running`,
          });
        },
      });
      await completeStage(run, "rules", "eval-rule-attribution", rules, 0);
      emit({
        stage: "rules",
        application: "eval-rule-attribution",
        workerAgentId: rulesWorkerAgentId,
        index: 6,
        status: "done",
        durationMs: Date.now() - rulesStartedAt,
        retryCount: rulesRetryCount,
        message: "eval-rule-attribution completed",
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") throw error;
      logger?.warn(
        "RuleAttribution",
        `Optional stage failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      emit({
        stage: "rules",
        application: "eval-rule-attribution",
        workerAgentId: rulesWorkerAgentId,
        index: 6,
        status: "failed",
        durationMs: Date.now() - rulesStartedAt,
        retryCount: rulesRetryCount,
        message: error instanceof Error ? error.message : String(error),
      });
    }
    const result = composeResult(trajectory, graph, oracles, backtrack, attribution, rules);
    await writeStageOutput(run, "result", result);
    return result;
  } catch (error) {
    await finishEvalRun(run, "failed");
    throw error;
  }
}
