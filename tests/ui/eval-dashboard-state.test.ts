import { describe, expect, it } from "vitest";

import type { EvalDashboardServerEvent, ViewMode } from "../../web/src/types/index.js";
import {
  EVAL_DASHBOARD_STAGES,
  reduceEvalDashboardState,
} from "../../web/src/utils/evalDashboardState.js";
import {
  canEnterSessionDashboard,
  evalCommandForSelection,
  sessionDashboardTransitionAction,
  shouldRenderMessageInput,
  viewModeAfterSessionChange,
  viewModeForMessageCount,
} from "../../web/src/utils/viewMode.js";

const evidence = {
  totalActors: 3,
  subagentCount: 2,
  fullTranscripts: 3,
  summaryTranscripts: 0,
  missingTranscripts: 0,
  completeness: "complete" as const,
  affectedAgentIds: [],
};

function starting(): EvalDashboardServerEvent {
  return {
    type: "eval_dashboard",
    status: "starting",
    requestedSessionId: "historical-prefix",
    startedAt: 100,
  };
}

function running(
  runId = "run-b",
  stage: "prepare" | "backtrack" = "backtrack",
): EvalDashboardServerEvent {
  return {
    type: "eval_dashboard",
    status: "running",
    targetSessionId: "historical-session-A",
    runId,
    stage,
    stageStatus: stage === "prepare" ? "done" : "running",
    index: stage === "prepare" ? 1 : 4,
    total: 7,
    application: stage === "prepare" ? "coordinator" : "chief-backtrack",
    workerAgentId: stage === "prepare" ? undefined : "agent-abcdef123",
    retryCount: 1,
    message: stage === "prepare" ? "frozen" : "screening",
    startedAt: 100,
    actorCount: 3,
    stepCount: 12,
    evidence,
  };
}

describe("Eval Dashboard frontend state", () => {
  it("moves through starting, running and completed without regeneration", () => {
    const prepared = reduceEvalDashboardState(null, starting());
    expect(prepared).toMatchObject({
      status: "starting",
      requestedSessionId: "historical-prefix",
    });
    expect(prepared.runId).toBeUndefined();
    expect(prepared.stages.map((stage) => stage.stage)).toEqual(
      EVAL_DASHBOARD_STAGES,
    );

    const active = reduceEvalDashboardState(prepared, running());
    expect(active).toMatchObject({
      status: "running",
      targetSessionId: "historical-session-A",
      runId: "run-b",
      activeStage: "backtrack",
      application: "chief-backtrack",
      workerAgentId: "agent-abcdef123",
      retryCount: 1,
      actorCount: 3,
      stepCount: 12,
      evidence,
    });
    expect(active.stages[3]).toMatchObject({
      stage: "backtrack",
      status: "running",
    });

    const completed = reduceEvalDashboardState(active, {
      type: "eval_dashboard",
      status: "completed",
      targetSessionId: "historical-session-A",
      runId: "run-b",
      html: "<html>coordinator report</html>",
      generatedAt: 500,
    });
    expect(completed).toMatchObject({
      status: "completed",
      targetSessionId: "historical-session-A",
      runId: "run-b",
      html: "<html>coordinator report</html>",
    });
  });

  it("suppresses stale lifecycle events from an older run", () => {
    const active = reduceEvalDashboardState(
      reduceEvalDashboardState(null, starting()),
      running("run-b"),
    );

    const staleCompleted = reduceEvalDashboardState(active, {
      type: "eval_dashboard",
      status: "completed",
      targetSessionId: "historical-session-A",
      runId: "run-a",
      html: "<html>stale</html>",
      generatedAt: 400,
    });
    const staleFailed = reduceEvalDashboardState(active, {
      type: "eval_dashboard",
      status: "failed",
      targetSessionId: "historical-session-A",
      runId: "run-a",
      stage: "graph",
      error: "stale failure",
    });

    expect(staleCompleted).toBe(active);
    expect(staleFailed).toBe(active);
  });

  it("renders terminal failure as text and never as partial HTML", () => {
    const active = reduceEvalDashboardState(
      reduceEvalDashboardState(null, starting()),
      running(),
    );
    const failed = reduceEvalDashboardState(active, {
      type: "eval_dashboard",
      status: "failed",
      targetSessionId: "historical-session-A",
      runId: "run-b",
      stage: "backtrack",
      error: "<img src=x onerror=alert(1)>",
    });

    expect(failed).toMatchObject({
      status: "failed",
      activeStage: "backtrack",
      error: "<img src=x onerror=alert(1)>",
      html: undefined,
    });
  });

  it("keeps the three view modes and Session switching semantics distinct", () => {
    const modes: ViewMode[] = [
      "chat",
      "session_dashboard",
      "eval_dashboard",
    ];
    expect(modes).toHaveLength(3);
    expect(viewModeAfterSessionChange("session_dashboard", "A", "B")).toBe("chat");
    expect(viewModeAfterSessionChange("eval_dashboard", "A", "B")).toBe("eval_dashboard");
    expect(viewModeAfterSessionChange("session_dashboard", null, "A")).toBe("session_dashboard");
    expect(viewModeForMessageCount("session_dashboard", 0)).toBe("chat");
    expect(viewModeForMessageCount("eval_dashboard", 0)).toBe("eval_dashboard");
    expect(shouldRenderMessageInput("chat")).toBe(true);
    expect(shouldRenderMessageInput("session_dashboard")).toBe(true);
    expect(shouldRenderMessageInput("eval_dashboard")).toBe(false);
  });

  it("allows Session Dashboard entry only from a non-empty Chat view", () => {
    expect(canEnterSessionDashboard("chat", 1)).toBe(true);
    expect(canEnterSessionDashboard("chat", 0)).toBe(false);
    expect(canEnterSessionDashboard("eval_dashboard", 1)).toBe(false);
    expect(canEnterSessionDashboard("session_dashboard", 1)).toBe(false);
  });

  it("cancels a pending Session Dashboard transition after Eval takes over", () => {
    expect(sessionDashboardTransitionAction("chat", true)).toBe("wait");
    expect(sessionDashboardTransitionAction("chat", false)).toBe("commit");
    expect(sessionDashboardTransitionAction("eval_dashboard", false)).toBe("cancel");
    expect(sessionDashboardTransitionAction("eval_dashboard", true)).toBe("cancel");
  });

  it("dispatches /eval for empty or terminal selector states", () => {
    for (const status of [null, "completed", "failed"] as const) {
      expect(evalCommandForSelection(status)).toEqual({
        type: "slash",
        command: "/eval",
      });
    }
    expect(evalCommandForSelection("starting")).toBeNull();
    expect(evalCommandForSelection("running")).toBeNull();
  });
});
