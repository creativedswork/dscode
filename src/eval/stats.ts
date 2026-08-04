import type { MultiAgentTrajectory } from "./trajectory.js";
import type { AgentStats, SessionMeta, ToolStats } from "./types.js";

// ── Helpers ──

function formatDuration(ms: number): string {
  const totalMinutes = Math.round(ms / 60000);
  if (totalMinutes < 1) return "< 1m";
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  if (hours === 0) return `${mins}m`;
  return `${hours}h ${mins}m`;
}

function formatTime(ts: number): string {
  if (ts == null || isNaN(ts)) return "unknown";
  try {
    return new Date(ts).toISOString().replace("T", " ").slice(0, 19);
  } catch {
    return "unknown";
  }
}

export interface SessionStats {
  metadata: SessionMeta;
  stats: ToolStats;
  agentStats: AgentStats;
}

export function computeStats(trajectory: MultiAgentTrajectory): SessionStats {
  const meta = trajectory.session.metadata;
  const duration = meta.updatedAt - meta.createdAt;
  const metadata: SessionMeta = {
    sessionId: meta.id,
    title: meta.title,
    model: `${meta.modelProvider ?? "unknown"}/${meta.modelId ?? "unknown"}`,
    totalMessages: meta.messageCount,
    duration: formatDuration(duration),
    projectPath: meta.projectPath ?? "",
    startedAt: formatTime(meta.createdAt),
    endedAt: formatTime(meta.updatedAt),
  };

  const toolSteps = trajectory.steps.filter((step) => !!step.toolName);
  const toolCalls = toolSteps.length;
  const toolErrors = toolSteps.filter((step) => step.isError).length;
  const screenshotsTaken = toolSteps.filter((step) =>
    step.toolName?.toLowerCase().includes("screenshot"),
  ).length;
  const errorRate = toolCalls > 0 ? ((toolErrors / toolCalls) * 100).toFixed(1) + "%" : "0.0%";
  const stats: ToolStats = {
    toolCalls,
    toolErrors,
    errorRate,
    screenshotsTaken,
    userComplaints: 0,
  };

  const subagents = trajectory.actors.filter((actor) => actor.role === "subagent");
  const countState = (state: string) =>
    subagents.filter((actor) => actor.state === state).length;
  const completed = countState("completed");
  const failed = countState("failed");
  const terminated = countState("terminated");
  const killed = countState("killed");
  const terminal = completed + failed + terminated + killed;
  const agentStats: AgentStats = {
    totalActors: trajectory.actors.length,
    subagents: subagents.length,
    applications: new Set(trajectory.actors.map((actor) => actor.application)).size,
    completed,
    failed,
    terminated,
    killed,
    processSuccessRate: terminal > 0
      ? `${((completed / terminal) * 100).toFixed(1)}%`
      : "100.0%",
    fullTranscripts: trajectory.evidence.fullTranscripts,
    summaryTranscripts: trajectory.evidence.summaryTranscripts,
    missingTranscripts: trajectory.evidence.missingTranscripts,
  };

  return { metadata, stats, agentStats };
}
