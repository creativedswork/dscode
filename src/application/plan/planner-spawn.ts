import type { AgentSupervisor } from "../../agents/process/supervisor.js";
import type { AgentExitResult } from "../../agents/process/types.js";
import type { PlanExecutionService } from "./execution-service.js";
import { PLANNER_APPLICATION_NAME } from "./planner-application.js";
import type { PlannerProcessHandle } from "./planner-process.js";
import type { PlannerService } from "./planner-service.js";
import type { PlannerRouteRequest } from "./route.js";

interface SpawnPlannerOptions {
  supervisor: AgentSupervisor;
  service: PlannerService;
  execution: PlanExecutionService;
  mainAgentId: string;
  planId: string;
  request: Readonly<PlannerRouteRequest>;
  expectedVersion?: number;
  onBound(plannerAgentId: string): void;
  onExit(exit: Readonly<AgentExitResult>): Promise<void>;
}

export function spawnPlanner(
  options: SpawnPlannerOptions,
): Promise<PlannerProcessHandle> {
  const main = options.supervisor.require(options.mainAgentId);
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
        options.expectedVersion === undefined
          ? "Create the goal and constraints, resolve technical choices, then compile and internally authorize."
          : "Replan autonomously from the public trajectory, then compile and internally authorize.",
        "",
        options.request.requestText,
      ].join("\n"),
    },
    attachment: "foreground",
    recording: "process-only",
    restoreParentOnExit: false,
    onSpawn: async (plannerAgentId) => {
      const result = options.expectedVersion === undefined
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
            decisions: [],
            items: [],
            sideEffectSummary: "",
            trajectoryEvents: [],
          })
        : await options.execution.deriveReplan(
            options.planId,
            options.expectedVersion,
            plannerAgentId,
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
