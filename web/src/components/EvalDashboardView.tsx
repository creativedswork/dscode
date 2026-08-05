import { useEffect, useMemo, useState } from "react";
import { ArrowSquareOut, Check, LockSimple, Warning } from "@phosphor-icons/react";
import { ArtifactContainer } from "./ArtifactContainer";
import type { EvalDashboardCacheEntry } from "../utils/evalDashboardCache";
import type {
  EvalDashboardStageState,
  EvalDashboardViewState,
} from "../utils/evalDashboardState";
import { formatAgentDisplayId } from "../../../src/ui/shared/agent-id.js";

interface EvalDashboardViewProps {
  state: EvalDashboardViewState;
  latestSuccessful?: EvalDashboardCacheEntry;
  onBackToChat: () => void;
  onRetry: () => void;
  onOpenExternal: (html: string) => void;
}

const STAGE_LABELS: Record<EvalDashboardStageState["stage"], string> = {
  prepare: "prepare",
  graph: "chief-graph",
  oracle: "chief-oracle",
  backtrack: "chief-backtrack",
  attribution: "chief-attribution",
  rules: "rules",
  dashboard: "dashboard",
};

const STAGE_DESCRIPTIONS: Record<EvalDashboardStageState["stage"], string> = {
  prepare: "Trajectory frozen",
  graph: "Build and validate causal graph",
  oracle: "Synthesize Virtual Oracle",
  backtrack: "Screen causal candidates",
  attribution: "Attribute the root cause",
  rules: "Extract reusable rules",
  dashboard: "Write validated report",
};

function shortId(value: string | undefined, length = 8): string {
  return value ? value.slice(0, length) : "pending";
}

function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function formatDuration(ms: number | undefined): string {
  if (ms === undefined) return "...";
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

function formatGeneratedAt(timestamp: number): string {
  return new Date(timestamp).toLocaleString();
}

function useElapsedTime(state: EvalDashboardViewState): string {
  const terminal = state.status === "completed" || state.status === "failed";
  const terminalAt = state.generatedAt ?? Date.now();
  const [now, setNow] = useState(terminal ? terminalAt : Date.now());

  useEffect(() => {
    if (terminal) {
      setNow(state.generatedAt ?? Date.now());
      return;
    }
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [state.generatedAt, state.runId, state.status, terminal]);

  return formatElapsed(now - state.startedAt);
}

function StageRow({ stage }: { stage: EvalDashboardStageState }) {
  const active = stage.status === "running";
  const done = stage.status === "done";
  const failed = stage.status === "failed";
  return (
    <div
      className="eval-stage-row"
      data-stage-status={stage.status}
      style={{ backgroundColor: active ? "var(--color-accent-bg)" : "transparent" }}
    >
      <span
        className="eval-stage-index"
        style={{
          color: done
            ? "var(--color-success-text)"
            : failed
              ? "var(--color-error-text)"
              : active
                ? "var(--color-accent)"
                : "var(--color-text-muted)",
          borderColor: done
            ? "var(--color-success-text)"
            : failed
              ? "var(--color-error-text)"
              : active
                ? "var(--color-accent)"
                : "var(--color-border)",
          backgroundColor: done
            ? "var(--color-success)"
            : failed
              ? "var(--color-error)"
              : "transparent",
        }}
      >
        {done ? <Check size={10} weight="bold" /> : failed ? "!" : stage.index}
      </span>
      <span className="eval-stage-name">{STAGE_LABELS[stage.stage]}</span>
      <span className="eval-stage-description">
        {stage.message || (stage.status === "pending" ? "Waiting" : STAGE_DESCRIPTIONS[stage.stage])}
      </span>
      <span className="eval-stage-time">
        {done || failed ? formatDuration(stage.durationMs) : active ? "..." : "-"}
      </span>
    </div>
  );
}

export function EvalDashboardView({
  state,
  latestSuccessful,
  onBackToChat,
  onRetry,
  onOpenExternal,
}: EvalDashboardViewProps) {
  const elapsed = useElapsedTime(state);
  const target = state.targetSessionId ?? state.requestedSessionId;
  const evidenceLabel = state.evidence?.completeness;
  const meta = useMemo(() => {
    const parts = [
      `target ${shortId(target)}`,
      state.runId ? `run ${shortId(state.runId, 6)}` : "run pending",
    ];
    if (state.actorCount !== undefined) parts.push(`${state.actorCount} actors`);
    if (state.stepCount !== undefined) parts.push(`${state.stepCount} Steps`);
    if (evidenceLabel) parts.push(`${evidenceLabel} evidence`);
    return parts.join(" · ");
  }, [evidenceLabel, state.actorCount, state.runId, state.stepCount, target]);
  const historicalReport = state.status === "failed"
    && state.targetSessionId
    && latestSuccessful?.targetSessionId === state.targetSessionId
      ? latestSuccessful
      : undefined;
  const displayedHtml = state.status === "completed"
    ? state.html
    : historicalReport?.html;

  const statusLabel = state.status === "starting"
    ? "Preparing"
    : state.status === "completed"
      ? "Completed"
      : state.status === "failed"
        ? historicalReport
          ? "Failed · Previous report"
          : "Failed"
        : "Running";

  return (
    <section className="flex-1 min-h-0 flex flex-col overflow-hidden" style={{ backgroundColor: "var(--color-bg)" }}>
      <div className="eval-toolbar">
        <div className="min-w-0 flex-1">
          <div className="eval-toolbar-title">
            CHIEF Multi-Agent Evaluation
            <span className="eval-toolbar-badge">
              CHIEF
            </span>
          </div>
          <div className="eval-toolbar-meta">
            {meta}
          </div>
        </div>
        <span className={`eval-status-chip ${state.status}`}>
          {statusLabel}
        </span>
        {displayedHtml && (
          <button
            type="button"
            className="eval-action-button"
            onClick={() => onOpenExternal(displayedHtml)}
            title="Open report in external browser"
          >
            <ArrowSquareOut size={14} weight="bold" />
            <span className="eval-open-label">Open</span>
          </button>
        )}
      </div>

      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        {state.status === "starting" && (
          <div className="eval-state-wrap">
            <div className="eval-state-card eval-state-card-centered">
              <span className="eval-spinner" />
              <div className="eval-eyebrow">OPENING EVAL MODE</div>
              <h2 className="eval-state-title">Preparing the evaluation target</h2>
              <p className="eval-state-copy">
                Resolving the requested Session and freezing its Main/SubAgent membership before any evaluator worker starts.
              </p>
            </div>
          </div>
        )}

        {state.status === "running" && (
          <div className="eval-state-wrap">
            <div className="eval-state-card eval-running-card">
              <div className="eval-eyebrow">CHIEF EVALUATION · RUN {shortId(state.runId, 6).toUpperCase()}</div>
              <h2 className="eval-state-title">Tracing the causal path</h2>
              <p className="eval-state-copy">
                This can take several minutes. The validated report remains unavailable until every required stage completes.
              </p>
              <div className="eval-run-overview">
                <div className="eval-run-stat"><span>Elapsed</span><strong>{elapsed}</strong></div>
                <div className="eval-run-stat"><span>Target</span><strong>{shortId(state.targetSessionId)}</strong></div>
                <div className="eval-run-stat"><span>Trajectory</span><strong>{state.actorCount} actors · {state.stepCount} steps</strong></div>
                <div className="eval-run-stat"><span>Evidence</span><strong>{evidenceLabel ?? "pending"}</strong></div>
              </div>
              <div className="eval-worker-strip">
                <span className="eval-worker-pulse" />
                <span>Active worker</span>
                <code>
                  {state.application ?? "coordinator"}
                  {state.workerAgentId ? ` (${formatAgentDisplayId(state.workerAgentId)})` : ""}
                </code>
                <span className="eval-worker-attempt">
                  attempt {(state.retryCount ?? 0) + 1}/2
                </span>
              </div>
              <div className="eval-stage-list">
                {state.stages.map((stage) => <StageRow key={stage.stage} stage={stage} />)}
              </div>
            </div>
          </div>
        )}

        {state.status === "completed" && state.html && (
          <ArtifactContainer
            presentation={{
              kind: "eval_dashboard",
              html: state.html,
              loading: false,
            }}
          />
        )}

        {state.status === "failed" && historicalReport && (
          <div className="eval-failed-report">
            <div className="eval-failed-report-notice" role="alert">
              <Warning size={18} weight="bold" />
              <div className="min-w-0 flex-1">
                <strong>
                  Current evaluation failed
                  {state.activeStage ? ` at ${STAGE_LABELS[state.activeStage]}` : ""}
                </strong>
                <span className="eval-failed-report-error">{state.error}</span>
                <span>
                  Showing the last complete report for this target: run{" "}
                  <code>{shortId(historicalReport.runId, 6)}</code>
                  {" · "}
                  {formatGeneratedAt(historicalReport.generatedAt)}
                </span>
              </div>
              <div className="eval-failed-report-actions">
                <button type="button" className="eval-action-button primary" onClick={onRetry}>Retry</button>
                <button type="button" className="eval-action-button" onClick={onBackToChat}>Back to chat</button>
              </div>
            </div>
            <ArtifactContainer
              presentation={{
                kind: "eval_dashboard",
                html: historicalReport.html,
                loading: false,
              }}
            />
          </div>
        )}

        {state.status === "failed" && !historicalReport && (
          <div className="eval-state-wrap">
            <div className="eval-state-card eval-failed-card">
              <div className="w-9 h-9 grid place-items-center rounded-lg font-bold" style={{ color: "var(--color-error-text)", backgroundColor: "var(--color-error)" }}>
                <Warning size={18} weight="bold" />
              </div>
              <h2 className="eval-state-title">
                Evaluation stopped{state.activeStage ? ` at ${STAGE_LABELS[state.activeStage]}` : ""}
              </h2>
              <p className="eval-state-copy whitespace-pre-wrap break-words">{state.error}</p>
              <p className="eval-state-copy mt-2">The latest successful report was not replaced.</p>
              <div className="flex flex-wrap gap-2 mt-5">
                <button type="button" className="eval-action-button primary" onClick={onRetry}>Retry evaluation</button>
                <button type="button" className="eval-action-button" onClick={onBackToChat}>Back to chat</button>
              </div>
            </div>
          </div>
        )}
      </div>

      <footer className="eval-readonly-bar">
        <span className="flex items-center gap-1.5">
          <LockSimple size={12} weight="bold" />
          {historicalReport
            ? "Read-only historical eval artifact · current run failed"
            : "Read-only eval artifact · report input cannot modify this HTML"}
        </span>
        <code>
          {historicalReport
            ? `${shortId(historicalReport.targetSessionId)}:${shortId(historicalReport.runId, 6)} · failed ${shortId(state.runId, 6)}`
            : state.targetSessionId && state.runId
              ? `${shortId(state.targetSessionId)}:${shortId(state.runId, 6)}`
              : "target pending"}
        </code>
      </footer>
    </section>
  );
}
