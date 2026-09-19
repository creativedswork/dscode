import { randomUUID } from "node:crypto";

import type { TaskState } from "../../agents/process/task-state.js";
import { digestCanonicalPayload } from "./digest.js";
import {
  type ExecutionEpisodeSnapshot,
  type ExecutionRecoveryCommand,
  type ExecutionRecoveryReceipt,
  type ExecutionRecoveryResult,
  type PersistedExecutionEpisode,
} from "./execution-episode-types.js";
import { captureExecutionProgress } from "./execution-progress.js";
import { startExecutionEpisode } from "./executive-monitor.js";
import { PlanStore } from "./store.js";
import type { PlanRecord, PlanRecordV2 } from "./types.js";

export function publicEpisodeSnapshot(
  episode: Readonly<PersistedExecutionEpisode> | undefined,
): Readonly<ExecutionEpisodeSnapshot> | undefined {
  if (!episode) return undefined;
  const { recentFingerprints: _, recoveryReceipts: __, ...snapshot } = episode;
  return structuredClone(snapshot);
}

export class ExecutionEpisodeService {
  constructor(
    private readonly store: PlanStore,
    private readonly now: () => number = Date.now,
    private readonly nextId: () => string = randomUUID,
  ) {}

  async get(planId: string): Promise<Readonly<ExecutionEpisodeSnapshot> | undefined> {
    const loaded = await this.store.load(planId);
    return loaded.ok && loaded.plan?.schemaVersion === 2
      ? publicEpisodeSnapshot(loaded.plan.execution.episode)
      : undefined;
  }

  async start(
    plan: Readonly<PlanRecordV2>,
    taskState?: Readonly<TaskState>,
  ): Promise<Readonly<PlanRecord>> {
    const episode = startExecutionEpisode({
      episodeId: this.nextId(),
      planId: plan.planId,
      planRevision: plan.revision,
      planDigest: plan.digest,
      sessionId: plan.sessionId,
      mainAgentId: plan.mainAgentId,
      progress: captureExecutionProgress(plan, taskState),
    }, this.now());
    return await this.store.persistExecutionEpisode(
      plan.planId,
      plan.revision,
      plan.digest,
      episode,
    ) ?? plan;
  }

  async persist(
    planId: string,
    episode: Readonly<PersistedExecutionEpisode>,
  ): Promise<Readonly<PlanRecord>> {
    const persisted = await this.store.persistExecutionEpisode(
      planId,
      episode.planRevision,
      episode.planDigest,
      episode,
    );
    if (!persisted) throw new Error("Execution episode identity is stale");
    return persisted;
  }

  async recover(
    command: ExecutionRecoveryCommand,
    taskState?: Readonly<TaskState>,
  ): Promise<ExecutionRecoveryResult> {
    try {
      const payloadDigest = digestCanonicalPayload(command);
      const result = await this.store.applyCommand({
        planId: command.planId,
        expectedVersion: command.expectedVersion,
        commandId: command.commandId,
        operation: command.operation,
        payload: command,
      }, (draft) => {
        const episode = draft.execution.episode;
        if (
          !episode
          || episode.phase !== "paused_inconclusive"
          || draft.revision !== command.revision
          || draft.digest !== command.digest
          || episode.planRevision !== command.revision
          || episode.planDigest !== command.digest
        ) {
          throw new Error("Execution recovery command conflicts with current state");
        }
        const receipt: ExecutionRecoveryReceipt = {
          commandId: command.commandId,
          operation: command.operation,
          payloadDigest,
          resultingVersion: draft.version + 1,
          completedAt: this.now(),
        };
        if (command.operation === "continue_execution") {
          const resumed = startExecutionEpisode({
            episodeId: this.nextId(),
            planId: draft.planId,
            planRevision: draft.revision,
            planDigest: draft.digest,
            sessionId: draft.sessionId,
            mainAgentId: draft.mainAgentId,
            progress: captureExecutionProgress(draft, taskState),
          }, this.now());
          receipt.episodeId = resumed.episodeId;
          resumed.recoveryReceipts = [...episode.recoveryReceipts, receipt].slice(-64);
          draft.execution.episode = resumed;
        } else {
          episode.recoveryReceipts = [...episode.recoveryReceipts, receipt].slice(-64);
          draft.status = "needs_replan";
        }
      });
      if (!result.ok) {
        return {
          ok: false,
          reason: result.reason === "command_id_reused"
            ? "command_id_reused"
            : "conflict",
          episode: "plan" in result && result.plan.schemaVersion === 2
            ? publicEpisodeSnapshot(result.plan.execution.episode)
            : result.reason === "conflict"
            && result.conflict.current.schemaVersion === 2
            ? publicEpisodeSnapshot(result.conflict.current.execution.episode)
            : undefined,
        };
      }
      if (result.plan.schemaVersion !== 2 || !result.plan.execution.episode) {
        return { ok: false, reason: "invalid_phase" };
      }
      const receipt = result.plan.execution.episode.recoveryReceipts.find(
        (candidate) => candidate.commandId === command.commandId,
      );
      if (!receipt) return { ok: false, reason: "invalid_phase" };
      return {
        ok: true,
        episode: publicEpisodeSnapshot(result.plan.execution.episode)!,
        receipt,
        duplicate: result.duplicate,
      };
    } catch {
      const episode = await this.get(command.planId);
      return { ok: false, reason: "invalid_phase", episode };
    }
  }
}
