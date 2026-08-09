import type { EvalApplicationPort } from "../application/harness-api.js";
import type { SerializedSession } from "../session/types.js";
import type { Logger } from "../utils/logger.js";
import { runChiefPipeline } from "./chief/pipeline.js";
import { createEvalRun, finishEvalRun } from "./chief/workspace.js";
import type { SessionStats } from "./stats.js";
import { loadMultiAgentTrajectory } from "./trajectory.js";
import type { EvalResult } from "./types.js";

/**
 * Compatibility entry point for callers that previously selected the legacy
 * causal-graph path. All requests now execute the same Supervisor-backed CHIEF
 * pipeline regardless of trajectory size.
 */
export async function runCausalGraphPipeline(
  data: SerializedSession,
  harness: EvalApplicationPort,
  onLog?: (message: string) => void,
  logger?: Logger,
): Promise<EvalResult> {
  const trajectory = await loadMultiAgentTrajectory(data, harness.agents);
  const run = await createEvalRun(
    trajectory,
    harness.currentSessionId() ?? data.metadata.id,
  );
  const result = await runChiefPipeline({
    trajectory,
    harness,
    run,
    logger,
    onProgress: (event) => {
      onLog?.(`[${event.index}/${event.total}] ${event.application}: ${event.status}`);
    },
  });
  await finishEvalRun(run, "completed");
  return result;
}

/** @deprecated Session size no longer changes eval semantics. */
export async function runFocusPipeline(
  data: SerializedSession,
  harness: EvalApplicationPort,
  _stats?: SessionStats,
  onLog?: (message: string) => void,
  logger?: Logger,
): Promise<EvalResult> {
  return runCausalGraphPipeline(data, harness, onLog, logger);
}

export async function analyzeWithLLM(
  data: SerializedSession,
  harness: EvalApplicationPort,
  onLog?: (message: string) => void,
  logger?: Logger,
): Promise<EvalResult> {
  return runCausalGraphPipeline(data, harness, onLog, logger);
}
