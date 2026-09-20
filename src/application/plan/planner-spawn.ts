import type { AgentSupervisor } from "../../agents/process/supervisor.js";
import type { AgentExitResult } from "../../agents/process/types.js";
import type { PlanExecutionService } from "./execution-service.js";
import { PLANNER_APPLICATION_NAME } from "./planner-application.js";
import type { PlannerProcessHandle } from "./planner-process.js";
import type { PlanService } from "./plan-service.js";
import type { PlannerRouteRequest } from "./route.js";
import type { PlanRecord } from "./types.js";
import { planExecutionUnits } from "./execution-model.js";

interface SpawnPlannerOptions {
  supervisor: AgentSupervisor;
  service: PlanService;
  execution: PlanExecutionService;
  mainAgentId: string;
  planId: string;
  request: Readonly<PlannerRouteRequest>;
  expectedVersion?: number;
  recoveryPlan?: Readonly<PlanRecord>;
  onBound(plannerAgentId: string): void;
  onExit(exit: Readonly<AgentExitResult>): Promise<void>;
}

export function spawnPlanner(
  options: SpawnPlannerOptions,
): Promise<PlannerProcessHandle> {
  const main = options.supervisor.require(options.mainAgentId);
  const recovery = options.recoveryPlan;
  const routeRequirements =
    options.request.decision.assessment?.requirements ?? [];
  const needsAlignment =
    !recovery
    && routeRequirements.length > 0;
  const recoveryState = recovery && JSON.stringify({
    planId: recovery.planId,
    status: recovery.status === "needs_replan" ? "drafting" : recovery.status,
    version: recovery.version + 1,
    revision: recovery.revision + Number(recovery.status === "needs_replan"),
    goal: recovery.goal,
    constraints: recovery.constraints,
    alignmentRequirements: recovery.alignmentRequirements ?? [],
    decisions: recovery.decisions,
    executionSteps: planExecutionUnits(recovery).map((step) => ({
      stepId: step.stepId,
      order: step.order,
      title: step.title,
      description: step.description,
      dependsOn: step.dependsOn,
      verifications: step.verifications,
      effectGrants: step.effectGrants,
      status: step.status,
    })),
    pendingInteraction: recovery.pendingInteraction,
  });
  let resolveStarted!: (handle: PlannerProcessHandle) => void;
  let rejectStarted!: (error: Error) => void;
  const started = new Promise<PlannerProcessHandle>((resolve, reject) => {
    resolveStarted = resolve;
    rejectStarted = reject;
  });
  const execution = options.supervisor.spawn({
    application: PLANNER_APPLICATION_NAME,
    parentAgentId: options.mainAgentId,
    description: "Planner: prepare an auditable execution plan",
    input: {
      prompt: [
        `Plan ID: ${options.planId}`,
        `Request ID: ${options.request.requestId}`,
        recovery
          ? "Recover this persisted Plan without repeating completed work."
          : needsAlignment
          ? "Request user alignment before investigation or technical planning."
          : options.expectedVersion === undefined
          ? "Create the goal and constraints, resolve technical choices, then compile and internally authorize."
          : "Replan autonomously from the public trajectory, then compile and internally authorize.",
        options.request.decision.assessment
          ? `Public route assessment: ${JSON.stringify(options.request.decision.assessment)}`
          : "",
        needsAlignment
          ? "Do not inspect the repository or infer a default preference. Ask about one pending alignment requirement at a time: append one concise user-visible decision that names that requirement in resolvesRequirementIds, provide two or three viable candidates marked constraintFit \"uncertain\", and immediately call plan_request_decision. After every response, recheck all alignmentRequirements and ask the next single question while any remain pending. Resolve technical choices only after the user responds. Do not compile or authorize until none remain pending."
          : "",
        recovery?.pendingInteraction?.kind === "decision"
          ? "The decision interaction is already persisted. Call plan_request_decision with its existing interactionId and decisionNodeId, then wait for the response."
          : "",
        recoveryState ? `Persisted public Plan state: ${recoveryState}` : "",
        "",
        options.request.requestText,
      ].join("\n"),
    },
    attachment: "foreground",
    recording: "process-only",
    restoreParentOnExit: false,
    onSpawn: async (plannerAgentId) => {
      const result = recovery
        ? recovery.status === "needs_replan"
          ? await options.execution.deriveReplan(
              options.planId,
              recovery.version,
              plannerAgentId,
              options.mainAgentId,
            )
          : await options.service.recovery.rebindPlanner(
              options.planId,
              recovery.version,
              options.mainAgentId,
              plannerAgentId,
            )
        : options.expectedVersion === undefined
        ? await options.service.create({
            planId: options.planId,
            sessionId: main.parentSessionId,
            mainAgentId: options.mainAgentId,
            plannerAgentId,
            request: {
              requestId: options.request.requestId,
              text: options.request.requestText,
              submittedAt: Date.now(),
            },
            status: "drafting",
            goal: options.request.requestText,
            constraints: [],
            ...(routeRequirements.length > 0
              ? { alignmentRequirements: structuredClone(routeRequirements) }
              : {}),
            decisions: [],
            executionSteps: [],
            execution: { steps: [] },
            sideEffectSummary: "",
            trajectoryEvents: [],
          })
        : await options.execution.deriveReplan(
            options.planId,
            options.expectedVersion,
            plannerAgentId,
            options.mainAgentId,
          );
      if (!result.ok) throw new Error(`Planner start conflict: ${options.planId}`);
      options.onBound(plannerAgentId);
      resolveStarted({
        planId: options.planId,
        plannerAgentId,
        mainAgentId: options.mainAgentId,
      });
    },
  });
  void execution.then(
    ({ result }) => {
      if (result) void options.onExit(result).catch(() => {});
    },
    (error) => rejectStarted(error instanceof Error ? error : new Error(String(error))),
  );
  return started;
}
