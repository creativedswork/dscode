import type { ValidationResult } from "../schemas.js";
import type { MultiAgentTrajectory, TrajectoryActor } from "../trajectory.js";
import type {
  ChiefAttribution,
  ChiefBacktrack,
  ChiefBacktrackCandidate,
  ChiefGraph,
  ChiefGraphEdge,
  ChiefOracle,
  ChiefRecoveryArc,
} from "./types.js";

function object(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function string(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function number(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function strings(value: unknown): string[] | undefined {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
    ? value
    : undefined;
}

function numbers(value: unknown): number[] | undefined {
  return Array.isArray(value)
    && value.every((item) => typeof item === "number" && Number.isInteger(item))
    ? value
    : undefined;
}

function unique<T>(values: readonly T[]): boolean {
  return new Set(values).size === values.length;
}

function actorMap(trajectory: MultiAgentTrajectory): Map<string, TrajectoryActor> {
  return new Map(trajectory.actors.map((actor) => [actor.agentId, actor]));
}

export function validateChiefGraph(
  value: unknown,
  trajectory: MultiAgentTrajectory,
): ValidationResult<ChiefGraph> {
  const input = object(value);
  if (!input) return { ok: false, errors: ["Expected a graph object"] };
  const errors: string[] = [];
  if (!Array.isArray(input.subtasks) || !Array.isArray(input.agents)
    || !Array.isArray(input.edges) || !Array.isArray(input.dataFlows)) {
    return {
      ok: false,
      errors: ["Graph requires subtasks, agents, edges, and dataFlows arrays"],
    };
  }
  const validSteps = new Set(trajectory.steps.map((step) => step.stepId));
  const actors = actorMap(trajectory);
  const stepOwner = new Map(trajectory.steps.map((step) => [step.stepId, step.agentId]));
  const subtaskIds = new Set<string>();
  const coveredSteps: number[] = [];
  const subtasks: ChiefGraph["subtasks"] = [];
  input.subtasks.forEach((raw, index) => {
    const item = object(raw);
    if (!item) {
      errors.push(`Subtask[${index}] must be an object`);
      return;
    }
    const id = string(item?.id);
    const stepIds = numbers(item?.stepIds);
    const status = string(item?.status);
    if (!id || !stepIds || stepIds.length === 0 || !string(item?.name)
      || !string(item?.summary) || !["ok", "warn", "danger"].includes(status ?? "")) {
      errors.push(`Subtask[${index}] has invalid required fields`);
      return;
    }
    if (subtaskIds.has(id)) errors.push(`Duplicate subtask ID: ${id}`);
    if (!unique(stepIds)) errors.push(`Subtask ${id} has duplicate Step IDs`);
    for (const stepId of stepIds) {
      if (!validSteps.has(stepId)) errors.push(`Subtask ${id} references unknown Step ${stepId}`);
    }
    subtaskIds.add(id);
    coveredSteps.push(...stepIds);
    subtasks.push({
      id,
      name: string(item.name)!,
      stepIds,
      status: status as ChiefGraph["subtasks"][number]["status"],
      summary: string(item.summary)!,
    });
  });
  if (!unique(coveredSteps)) errors.push("A Step is assigned to multiple subtasks");
  for (const stepId of validSteps) {
    if (!coveredSteps.includes(stepId)) errors.push(`Step ${stepId} is not assigned to a subtask`);
  }

  const agentKeys = new Set<string>();
  const agents: ChiefGraph["agents"] = [];
  input.agents.forEach((raw, index) => {
    const item = object(raw);
    if (!item) {
      errors.push(`Agent[${index}] must be an object`);
      return;
    }
    const subtaskId = string(item?.subtaskId);
    const agentId = string(item?.agentId);
    const application = string(item?.application);
    const role = string(item?.role);
    const stepIds = numbers(item?.stepIds);
    const actor = agentId ? actors.get(agentId) : undefined;
    const subtask = subtasks.find((candidate) => candidate.id === subtaskId);
    if (!subtaskId || !subtask || !agentId || !actor || !application
      || application !== actor.application || role !== actor.role || !stepIds) {
      errors.push(`Agent[${index}] has invalid identity or subtask fields`);
      return;
    }
    const key = `${subtaskId}:${agentId}`;
    if (agentKeys.has(key)) errors.push(`Duplicate Agent node: ${key}`);
    for (const stepId of stepIds) {
      if (stepOwner.get(stepId) !== agentId) {
        errors.push(`Agent ${agentId} does not own Step ${stepId}`);
      }
      if (!subtask.stepIds.includes(stepId)) {
        errors.push(`Agent ${agentId} Step ${stepId} is outside subtask ${subtaskId}`);
      }
    }
    agentKeys.add(key);
    agents.push({
      subtaskId,
      agentId,
      application,
      role: role as "main" | "subagent",
      stepIds,
      observation: typeof item.observation === "string" ? item.observation : "",
      thought: typeof item.thought === "string" ? item.thought : "",
      action: typeof item.action === "string" ? item.action : "",
      result: typeof item.result === "string" ? item.result : "",
    });
  });
  for (const subtask of subtasks) {
    if (!agents.some((agent) => agent.subtaskId === subtask.id)) {
      errors.push(`Subtask ${subtask.id} has no Agent node`);
    }
  }

  const entityIds = new Set<string>([
    ...subtaskIds,
    ...trajectory.actors.map((actor) => actor.agentId),
    ...trajectory.steps.map((step) => `step:${step.stepId}`),
  ]);
  const edgeTypes = ["control", "data", "result", "planning"];
  const edges: ChiefGraphEdge[] = [];
  input.edges.forEach((raw, index) => {
    const item = object(raw);
    if (!item) {
      errors.push(`Edge[${index}] must be an object`);
      return;
    }
    const source = string(item?.source);
    const target = string(item?.target);
    const type = string(item?.type);
    const strength = number(item?.strength);
    const evidenceStepIds = numbers(item?.evidenceStepIds);
    if (!source || !target || !entityIds.has(source) || !entityIds.has(target)
      || !edgeTypes.includes(type ?? "") || strength === undefined
      || strength < 0 || strength > 1 || !evidenceStepIds || !string(item?.summary)) {
      errors.push(`Edge[${index}] has invalid fields or references`);
      return;
    }
    if (evidenceStepIds.some((stepId) => !validSteps.has(stepId))) {
      errors.push(`Edge[${index}] references an unknown evidence Step`);
    }
    edges.push({
      source,
      target,
      type: type as ChiefGraphEdge["type"],
      strength,
      evidenceStepIds,
      summary: string(item.summary)!,
    });
  });

  const correctnessValues = [
    "correct",
    "misinterpreted",
    "misused",
    "fabricated",
    "unknown",
  ];
  const dataFlows: ChiefGraph["dataFlows"] = [];
  input.dataFlows.forEach((raw, index) => {
    const item = object(raw);
    if (!item) {
      errors.push(`DataFlow[${index}] must be an object`);
      return;
    }
    const sourceStepId = number(item?.sourceStepId);
    const targetStepId = number(item?.targetStepId);
    const sourceAgentId = string(item?.sourceAgentId);
    const targetAgentId = string(item?.targetAgentId);
    const correctness = string(item?.correctness);
    if (sourceStepId === undefined || targetStepId === undefined
      || stepOwner.get(sourceStepId) !== sourceAgentId
      || stepOwner.get(targetStepId) !== targetAgentId
      || !sourceAgentId || !targetAgentId || !string(item?.dataItem)
      || !correctnessValues.includes(correctness ?? "")) {
      errors.push(`DataFlow[${index}] has invalid fields or ownership`);
      return;
    }
    dataFlows.push({
      sourceStepId,
      targetStepId,
      sourceAgentId,
      targetAgentId,
      dataItem: string(item.dataItem)!,
      correctness: correctness as ChiefGraph["dataFlows"][number]["correctness"],
    });
  });
  return errors.length > 0
    ? { ok: false, errors }
    : { ok: true, value: { subtasks, agents, edges, dataFlows } };
}

export function validateChiefOracles(
  value: unknown,
  graph: ChiefGraph,
): ValidationResult<ChiefOracle[]> {
  if (!Array.isArray(value)) return { ok: false, errors: ["Expected an Oracle array"] };
  const errors: string[] = [];
  const ids = new Set(graph.subtasks.map((subtask) => subtask.id));
  const oracles: ChiefOracle[] = [];
  value.forEach((raw, index) => {
    const item = object(raw);
    if (!item) {
      errors.push(`Oracle[${index}] must be an object`);
      return;
    }
    const subtaskId = string(item?.subtaskId);
    const preconditions = strings(item?.preconditions);
    const keyEvidence = strings(item?.keyEvidence);
    const acceptanceCriteria = strings(item?.acceptanceCriteria);
    if (!subtaskId || !ids.has(subtaskId) || !string(item?.goal)
      || !preconditions || !keyEvidence || !acceptanceCriteria) {
      errors.push(`Oracle[${index}] has invalid fields or subtask reference`);
      return;
    }
    oracles.push({
      subtaskId,
      goal: string(item.goal)!,
      preconditions,
      keyEvidence,
      acceptanceCriteria,
    });
  });
  if (!unique(oracles.map((oracle) => oracle.subtaskId))) {
    errors.push("Oracle subtask IDs must be unique");
  }
  for (const id of ids) {
    if (!oracles.some((oracle) => oracle.subtaskId === id)) {
      errors.push(`Missing Oracle for subtask ${id}`);
    }
  }
  return errors.length > 0 ? { ok: false, errors } : { ok: true, value: oracles };
}

function candidates(
  value: unknown,
  label: string,
  validIds: Set<string>,
  errors: string[],
): ChiefBacktrackCandidate[] {
  if (!Array.isArray(value)) {
    errors.push(`${label} must be an array`);
    return [];
  }
  const result: ChiefBacktrackCandidate[] = [];
  value.forEach((raw, index) => {
    const item = object(raw);
    if (!item) {
      errors.push(`${label}[${index}] must be an object`);
      return;
    }
    const id = string(item?.id);
    const score = number(item?.score);
    if (!id || !validIds.has(id) || score === undefined || score < 0 || score > 1
      || !string(item?.reason)) {
      errors.push(`${label}[${index}] has invalid fields or reference`);
      return;
    }
    result.push({ id, score, reason: string(item.reason)! });
  });
  return result;
}

export function validateChiefBacktrack(
  value: unknown,
  trajectory: MultiAgentTrajectory,
  graph: ChiefGraph,
): ValidationResult<ChiefBacktrack> {
  const input = object(value);
  if (!input) return { ok: false, errors: ["Expected a backtrack object"] };
  const errors: string[] = [];
  const subtaskIds = new Set(graph.subtasks.map((subtask) => subtask.id));
  const agentIds = new Set(trajectory.actors.map((actor) => actor.agentId));
  const stepIds = new Set(trajectory.steps.map((step) => String(step.stepId)));
  const subtaskCandidates = candidates(
    input.subtaskCandidates,
    "subtaskCandidates",
    subtaskIds,
    errors,
  );
  const agentCandidates = candidates(
    input.agentCandidates,
    "agentCandidates",
    agentIds,
    errors,
  );
  const stepCandidates = candidates(
    input.stepCandidates,
    "stepCandidates",
    stepIds,
    errors,
  );
  const screenedSubtasks = strings(input.screenedSubtasks);
  const screenedAgentIds = strings(input.screenedAgentIds);
  const screenedStepIds = numbers(input.screenedStepIds);
  if (!screenedSubtasks || screenedSubtasks.some((id) => !subtaskIds.has(id))) {
    errors.push("screenedSubtasks contains an unknown subtask");
  }
  if (!screenedAgentIds || screenedAgentIds.some((id) => !agentIds.has(id))) {
    errors.push("screenedAgentIds contains an unknown Agent");
  }
  if (!screenedStepIds || screenedStepIds.some((id) => !stepIds.has(String(id)))) {
    errors.push("screenedStepIds contains an unknown Step");
  }
  if (subtaskCandidates.length === 0) errors.push("At least one subtask candidate is required");
  if (agentCandidates.length === 0) errors.push("At least one Agent candidate is required");
  return errors.length > 0
    ? { ok: false, errors }
    : {
      ok: true,
      value: {
        subtaskCandidates,
        agentCandidates,
        stepCandidates,
        screenedSubtasks: screenedSubtasks!,
        screenedAgentIds: screenedAgentIds!,
        screenedStepIds: screenedStepIds!,
      },
    };
}

function validateRecoveryArcs(
  value: unknown,
  trajectory: MultiAgentTrajectory,
): { arcs: ChiefRecoveryArc[]; diagnostics: string[] } {
  const diagnostics: string[] = [];
  if (!Array.isArray(value)) {
    diagnostics.push("recoveryArcs must be an array");
    return { arcs: [], diagnostics };
  }
  const actors = actorMap(trajectory);
  const steps = new Map(trajectory.steps.map((step) => [step.stepId, step]));
  const detectionTypes = [
    "tool_error",
    "user_complaint",
    "test_failure",
    "screenshot_divergence",
    "self_correction",
    "agent_review",
  ];
  const arcs: ChiefRecoveryArc[] = [];
  value.forEach((raw, index) => {
    const item = object(raw);
    if (!item) {
      diagnostics.push(`RecoveryArc[${index}] must be an object`);
      return;
    }
    const errorAgentId = string(item?.errorAgentId);
    const detectionAgentId = string(item?.detectionAgentId);
    const correctionAgentId = string(item?.correctionAgentId);
    const errorStepId = number(item.errorStep) ?? number(item.errorStepId);
    const detectionStepId = number(item.detectionStep) ?? number(item.detectionStepId);
    const correctionStepId = number(item.correctionStep) ?? number(item.correctionStepId);
    const errorActor = errorAgentId ? actors.get(errorAgentId) : undefined;
    const detectionActor = detectionAgentId ? actors.get(detectionAgentId) : undefined;
    const correctionActor = correctionAgentId ? actors.get(correctionAgentId) : undefined;
    const detectionType = string(item?.detectionType);
    if (!errorActor || !detectionActor || !correctionActor
      || item?.errorApplication !== errorActor.application
      || item?.detectionApplication !== detectionActor.application
      || item?.correctionApplication !== correctionActor.application
      || errorStepId === undefined || steps.get(errorStepId)?.agentId !== errorAgentId
      || detectionStepId === undefined || steps.get(detectionStepId)?.agentId !== detectionAgentId
      || correctionStepId === undefined || steps.get(correctionStepId)?.agentId !== correctionAgentId
      || errorStepId > detectionStepId || detectionStepId > correctionStepId
      || errorStepId >= correctionStepId
      || !detectionTypes.includes(detectionType ?? "")
      || !string(item?.errorSummary) || !string(item?.correctionSummary)
      || typeof item?.effective !== "boolean"
      || number(item?.misdiagnosisCount) === undefined
      || number(item.misdiagnosisCount)! < 0
      || !string(item?.rootCauseHypothesis)) {
      diagnostics.push(`RecoveryArc[${index}] has invalid fields, identity, or chronology`);
      return;
    }
    const normalizedDistance = correctionStepId - errorStepId;
    if (number(item.stepsToRecover) !== normalizedDistance) {
      diagnostics.push(
        `RecoveryArc[${index}] normalized stepsToRecover to ${normalizedDistance}`,
      );
    }
    arcs.push({
      errorAgentId: errorAgentId!,
      errorApplication: errorActor.application,
      errorStepId,
      detectionAgentId: detectionAgentId!,
      detectionApplication: detectionActor.application,
      detectionStepId,
      correctionAgentId: correctionAgentId!,
      correctionApplication: correctionActor.application,
      correctionStepId,
      detectionType: detectionType as ChiefRecoveryArc["detectionType"],
      errorSummary: string(item.errorSummary)!,
      correctionSummary: string(item.correctionSummary)!,
      effective: item.effective as boolean,
      stepsToRecover: normalizedDistance,
      misdiagnosisCount: number(item.misdiagnosisCount)!,
      rootCauseHypothesis: string(item.rootCauseHypothesis)!,
      crossAgent: errorAgentId !== correctionAgentId,
      errorStep: errorStepId,
      errorAgent: `${errorActor.application} (${errorAgentId!.slice(0, 6)})`,
      detectionStep: detectionStepId,
      correctionStep: correctionStepId,
      correctionAgent: `${correctionActor.application} (${correctionAgentId!.slice(0, 6)})`,
    });
  });
  return { arcs, diagnostics };
}

export function validateChiefAttribution(
  value: unknown,
  trajectory: MultiAgentTrajectory,
  graph: ChiefGraph,
): ValidationResult<ChiefAttribution> {
  const input = object(value);
  if (!input) return { ok: false, errors: ["Expected an attribution object"] };
  const errors: string[] = [];
  const actors = actorMap(trajectory);
  const mistakeAgentId = string(input.mistakeAgentId);
  const actor = mistakeAgentId ? actors.get(mistakeAgentId) : undefined;
  const mistakeSubtaskId = string(input.mistakeSubtaskId);
  const subtask = graph.subtasks.find((candidate) => candidate.id === mistakeSubtaskId);
  const mistakeStep = input.mistakeStep === null ? null : number(input.mistakeStep);
  const granularity = string(input.granularity);
  const confidence = number(input.confidence);
  const evidenceQuality = string(input.evidenceQuality);
  const severity = string(input.rootCauseSeverity);
  const rulesApplied = strings(input.rulesApplied);
  const validRules = [
    "local",
    "planning_control",
    "data_flow",
    "deviation_irrecoverability",
  ];
  if (!actor || input.mistakeApplication !== actor.application
    || !subtask || !granularity || !["subtask", "agent", "step"].includes(granularity)
    || mistakeStep === undefined
    || confidence === undefined || confidence < 0 || confidence > 1
    || evidenceQuality !== actor.evidenceQuality || !string(input.reason)
    || !string(input.rootCauseTitle) || !["primary", "secondary"].includes(severity ?? "")
    || !rulesApplied || rulesApplied.some((rule) => !validRules.includes(rule))) {
    errors.push("Attribution has invalid identity, confidence, or required fields");
  }
  if (typeof mistakeStep === "number") {
    const step = trajectory.steps.find((candidate) => candidate.stepId === mistakeStep);
    if (!step || step.agentId !== mistakeAgentId || !subtask?.stepIds.includes(mistakeStep)) {
      errors.push("Attribution Step is not owned by the attributed Agent and subtask");
    }
  }
  if (granularity === "step" && mistakeStep === null) {
    errors.push("Step granularity requires mistakeStep");
  }
  if (actor?.evidenceQuality !== "full" && typeof mistakeStep === "number") {
    errors.push("Summary or missing evidence cannot support Step attribution");
  }
  const recovery = validateRecoveryArcs(input.recoveryArcs, trajectory);
  return errors.length > 0
    ? { ok: false, errors }
    : {
      ok: true,
      value: {
        mistakeAgent: `${actor!.application} (${mistakeAgentId!.slice(0, 6)})`,
        mistakeAgentId: mistakeAgentId!,
        mistakeApplication: actor!.application,
        mistakeSubtaskId: mistakeSubtaskId!,
        mistakeStep: mistakeStep ?? null,
        granularity: granularity as ChiefAttribution["granularity"],
        confidence: confidence!,
        evidenceQuality: actor!.evidenceQuality,
        reason: string(input.reason)!,
        rootCauseTitle: string(input.rootCauseTitle)!,
        rootCauseSeverity: severity as ChiefAttribution["rootCauseSeverity"],
        rulesApplied: rulesApplied as ChiefAttribution["rulesApplied"],
        recoveryArcs: recovery.arcs,
        recoveryDiagnostics: recovery.diagnostics.length > 0
          ? recovery.diagnostics
          : undefined,
      },
    };
}
