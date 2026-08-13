import { useEffect, useId, useState } from "react";
import {
  CheckCircle,
  CircleNotch,
  PauseCircle,
  StopCircle,
  XCircle,
} from "@phosphor-icons/react";

import type { AgentActivity, AgentActivityState } from "../types";
import { formatAgentDisplayId } from "../../../src/ui/shared/agent-id.js";
import { Markdown } from "./Markdown";

const INPUT_SUMMARY_LENGTH = 140;
const RESULT_SUMMARY_LENGTH = 220;

export function summarizeAgentText(text: string, maxLength: number): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

export function formatAgentDuration(activity: AgentActivity, now = Date.now()): string {
  const start = activity.startedAt ?? activity.createdAt;
  const end = activity.endedAt ?? now;
  const seconds = Math.max(0, Math.floor((end - start) / 1000));
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

export const AGENT_STATUS_LABELS: Record<AgentActivityState, string> = {
  created: "Created",
  running: "Running",
  waiting: "Waiting",
  stopped: "Stopped",
  completed: "Completed",
  failed: "Failed",
  terminated: "Terminated",
  killed: "Killed",
};

const TOOL_STATUS_LABELS = {
  running: "Running",
  permission: "Permission required",
  completed: "Completed",
  failed: "Failed",
} as const;

function isLive(state: AgentActivityState): boolean {
  return state === "created" || state === "running" || state === "waiting";
}

function StatusIcon({ state }: { state: AgentActivityState }) {
  const props = { size: 16, weight: "bold" as const, "aria-hidden": true };
  if (state === "completed") return <CheckCircle {...props} />;
  if (state === "failed") return <XCircle {...props} />;
  if (state === "waiting") return <PauseCircle {...props} />;
  if (state === "terminated" || state === "killed" || state === "stopped") {
    return <StopCircle {...props} />;
  }
  return <CircleNotch {...props} className="agent-activity-spinner" />;
}

export function AgentActivityCard({
  activity,
}: {
  activity: AgentActivity;
}) {
  const [expanded, setExpanded] = useState(false);
  const [toolsExpanded, setToolsExpanded] = useState(
    activity.state !== "completed",
  );
  const [, setTick] = useState(0);
  const detailsId = useId();
  const toolsId = useId();
  const result = activity.error ?? activity.output ?? "";
  const label = activity.label?.trim() || "SubAgent";
  const inputSummary = summarizeAgentText(activity.input, INPUT_SUMMARY_LENGTH);
  const resultSummary = summarizeAgentText(result, RESULT_SUMMARY_LENGTH);
  const hasDetails = !!result && result.trim() !== resultSummary;
  const progress = activity.progress;
  const progressPercent = progress?.current != null && progress.total
    ? Math.min(100, Math.max(0, Math.round((progress.current / progress.total) * 100)))
    : undefined;
  const tools = activity.tools ?? [];
  const activeToolCount = tools.filter((tool) =>
    tool.status === "running" || tool.status === "permission"
  ).length;
  const completedToolCount = tools.filter((tool) =>
    tool.status === "completed"
  ).length;

  useEffect(() => {
    if (!isLive(activity.state)) return;
    const interval = window.setInterval(() => setTick((value) => value + 1), 1000);
    return () => window.clearInterval(interval);
  }, [activity.state]);

  useEffect(() => {
    if (!hasDetails) setExpanded(false);
  }, [hasDetails]);

  useEffect(() => {
    if (activity.state === "completed") {
      setToolsExpanded(false);
    }
  }, [activity.state]);

  return (
    <article
      className={`agent-activity-card state-${activity.state}`}
      data-collider="agent-card"
      aria-label={`${label} SubAgent Activity`}
    >
      <header className="agent-activity-header">
        <div className="agent-activity-title">
          <span className="agent-activity-status-icon">
            <StatusIcon state={activity.state} />
          </span>
          <span className="agent-activity-application">{label}</span>
        </div>
        <div className="agent-activity-state" role="status">
          <span>{AGENT_STATUS_LABELS[activity.state]}</span>
          <span aria-hidden="true">·</span>
          <span className="agent-activity-duration">{formatAgentDuration(activity)}</span>
        </div>
      </header>

      <div className="agent-activity-input" title={activity.input}>
        {inputSummary || "No input summary"}
      </div>

      {progress && isLive(activity.state) && !activity.permission && (
        <div className="agent-activity-progress" aria-label="Agent progress">
          <div className="agent-activity-progress-row">
            <span>{progress.message || progress.phase || "Working"}</span>
            {progressPercent != null && <span>{progressPercent}%</span>}
          </div>
          {progressPercent != null && (
            <div
              className="agent-activity-progress-track"
              role="progressbar"
              aria-valuenow={progressPercent}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <span style={{ width: `${progressPercent}%` }} />
            </div>
          )}
        </div>
      )}

      {tools.length > 0 && (
        <section className="agent-activity-tools" aria-label="Agent tools">
          {toolsExpanded && (
            <div id={toolsId} className="agent-activity-tool-list">
              {tools.map((tool) => (
                <div
                  key={tool.toolCallId}
                  className={`agent-activity-tool state-${tool.status}`}
                >
                  <div className="agent-activity-tool-header">
                    <span className="agent-activity-tool-name">{tool.name}</span>
                    <span className="agent-activity-tool-status">
                      {TOOL_STATUS_LABELS[tool.status]}
                    </span>
                  </div>
                  {tool.summary && (
                    <div className="agent-activity-tool-summary">
                      {tool.summary}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          <button
            type="button"
            className="agent-activity-tools-toggle"
            aria-expanded={toolsExpanded}
            aria-controls={toolsId}
            onClick={() => setToolsExpanded((value) => !value)}
          >
            <span>{toolsExpanded ? "Hide tools" : "Show tools"}</span>
            <span>
              {tools.length} total
              {completedToolCount > 0 ? ` · ${completedToolCount} done` : ""}
              {activeToolCount > 0 ? ` · ${activeToolCount} active` : ""}
            </span>
          </button>
        </section>
      )}

      {resultSummary && (
        <div
          id={detailsId}
          className={[
            "agent-activity-result",
            activity.error ? "error" : "",
            hasDetails && !expanded ? "collapsed" : "",
            expanded ? "expanded" : "",
          ].filter(Boolean).join(" ")}
          tabIndex={expanded ? 0 : undefined}
        >
          <Markdown
            className="agent-activity-markdown"
            isStreaming={isLive(activity.state)}
          >
            {result}
          </Markdown>
        </div>
      )}

      <footer className="agent-activity-footer">
        <span>agent id: {formatAgentDisplayId(activity.agentId)} · {activity.attachment}</span>
        {hasDetails && (
          <button
            type="button"
            className="agent-activity-details-toggle"
            aria-expanded={expanded}
            aria-controls={detailsId}
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? "Hide details" : "Details"}
          </button>
        )}
      </footer>

    </article>
  );
}
