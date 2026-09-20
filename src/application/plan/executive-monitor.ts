import { randomUUID } from "node:crypto";

import {
  EXECUTION_EPISODE_POLICY,
  type ExecutionActionFingerprint,
  type ExecutionEpisodePolicy,
  type ExecutionImpasseRule,
  type ExecutionProgressSnapshot,
  type PersistedExecutionEpisode,
} from "./execution-episode-types.js";
import { hasExecutionProgress } from "./execution-progress.js";

export interface StartExecutionEpisode {
  planId: string;
  planRevision: number;
  planDigest: string;
  sessionId: string;
  mainAgentId: string;
  progress: ExecutionProgressSnapshot;
  reflectionUsed?: boolean;
  phase?: "running" | "reflecting";
  episodeId?: string;
}

export interface MonitorObservation {
  episode: Readonly<PersistedExecutionEpisode>;
  stop: boolean;
  impasse?: ExecutionImpasseRule;
}

const MAX_INCIDENT_ERRORS = 3;

export function startExecutionEpisode(
  input: StartExecutionEpisode,
  now = Date.now(),
  policy: ExecutionEpisodePolicy = EXECUTION_EPISODE_POLICY,
): PersistedExecutionEpisode {
  return {
    episodeId: input.episodeId ?? randomUUID(),
    planId: input.planId,
    planRevision: input.planRevision,
    planDigest: input.planDigest,
    sessionId: input.sessionId,
    mainAgentId: input.mainAgentId,
    phase: input.phase ?? "running",
    policy: { ...policy },
    turnCount: 0,
    toolCallCount: 0,
    noProgressActionCount: 0,
    reflectionUsed: input.reflectionUsed ?? false,
    startedAt: now,
    updatedAt: now,
    progress: structuredClone(input.progress),
    recentFingerprints: [],
    recoveryReceipts: [],
  };
}

export class ExecutiveMonitor {
  constructor(
    private episode: PersistedExecutionEpisode,
    private readonly now: () => number = Date.now,
  ) {}

  snapshot(): Readonly<PersistedExecutionEpisode> {
    return structuredClone(this.episode);
  }

  recordAction(
    action: ExecutionActionFingerprint,
    progress: ExecutionProgressSnapshot,
    error?: string,
  ): MonitorObservation {
    if (!this.isActive()) return { episode: this.snapshot(), stop: true };
    this.episode.toolCallCount += 1;
    if (hasExecutionProgress(this.episode.progress, progress)) {
      this.acceptProgress(progress);
    } else {
      this.episode.noProgressActionCount += 1;
      this.episode.recentFingerprints.push(action.fingerprint);
      this.episode.recentFingerprints = this.episode.recentFingerprints.slice(
        -this.episode.policy.maxNoProgressActions,
      );
    }
    const rule = this.actionImpasse(action.fingerprint);
    return this.finishObservation(rule, progress, error);
  }

  recordTurn(
    progress: ExecutionProgressSnapshot,
    error?: string,
  ): MonitorObservation {
    if (!this.isActive()) return { episode: this.snapshot(), stop: true };
    this.episode.turnCount += 1;
    if (hasExecutionProgress(this.episode.progress, progress)) {
      this.acceptProgress(progress);
    }
    const maxTurns = this.episode.phase === "reflecting"
      ? this.episode.policy.reflectionMaxTurns
      : this.episode.policy.maxTurns;
    return this.finishObservation(
      this.episode.turnCount >= maxTurns ? "max_turns" : undefined,
      progress,
      error,
    );
  }

  markCompleted(progress: ExecutionProgressSnapshot): MonitorObservation {
    this.episode.phase = "completed";
    this.episode.progress = structuredClone(progress);
    this.episode.updatedAt = this.now();
    return { episode: this.snapshot(), stop: true };
  }

  private actionImpasse(fingerprint: string): ExecutionImpasseRule | undefined {
    const maxTools = this.episode.phase === "reflecting"
      ? this.episode.policy.reflectionMaxToolCalls
      : this.episode.policy.maxToolCalls;
    if (this.episode.toolCallCount >= maxTools) return "max_tool_calls";
    if (
      this.episode.recentFingerprints.filter((item) => item === fingerprint).length
      >= this.episode.policy.maxEquivalentActions
    ) return "max_equivalent_actions";
    if (
      this.episode.noProgressActionCount
      >= this.episode.policy.maxNoProgressActions
    ) return "max_no_progress_actions";
    return undefined;
  }

  private finishObservation(
    rule: ExecutionImpasseRule | undefined,
    progress: ExecutionProgressSnapshot,
    error?: string,
  ): MonitorObservation {
    this.episode.updatedAt = this.now();
    if (!rule) return { episode: this.snapshot(), stop: false };
    const reflectionAvailable = !this.episode.reflectionUsed;
    const fingerprint = this.episode.recentFingerprints.at(-1);
    this.episode.incident = {
      rule,
      occurredAt: this.episode.updatedAt,
      reflectionAvailable,
      unchangedProgress: structuredClone(progress),
      ...(fingerprint
        ? {
          fingerprint,
          equivalentActionCount: this.episode.recentFingerprints.filter(
            (item) => item === fingerprint,
          ).length,
        }
        : {}),
      errors: error ? [error].slice(-MAX_INCIDENT_ERRORS) : [],
    };
    if (reflectionAvailable) {
      this.episode.phase = "reflecting";
      this.episode.reflectionUsed = true;
      this.episode.turnCount = 0;
      this.episode.toolCallCount = 0;
      this.episode.noProgressActionCount = 0;
      this.episode.recentFingerprints = [];
    } else {
      this.episode.phase = "paused_inconclusive";
    }
    return { episode: this.snapshot(), stop: true, impasse: rule };
  }

  private acceptProgress(progress: ExecutionProgressSnapshot): void {
    if (this.episode.phase === "reflecting") {
      this.episode.phase = "running";
    }
    this.episode.progress = structuredClone(progress);
    this.episode.noProgressActionCount = 0;
    this.episode.recentFingerprints = [];
  }

  private isActive(): boolean {
    return this.episode.phase === "running"
      || this.episode.phase === "reflecting";
  }
}
