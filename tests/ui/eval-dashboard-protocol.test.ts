import { describe, expect, it, vi } from "vitest";

import { HarnessEventBus } from "../../src/core/events.js";
import type { EvalDashboardState } from "../../src/core/events.js";
import {
  projectEvalDashboardState,
  WebUiBackend,
} from "../../src/ui/web/web-backend.js";

const evidence = {
  totalActors: 2,
  subagentCount: 1,
  fullTranscripts: 2,
  summaryTranscripts: 0,
  missingTranscripts: 0,
  completeness: "complete" as const,
  affectedAgentIds: [],
};

function setupBackend() {
  const events = new HarnessEventBus({ error: vi.fn() } as any);
  const harness = {
    events,
    agentSupervisor: { get: vi.fn() },
    sessionManager: { getCurrentSessionId: vi.fn(() => "current") },
  } as any;
  const backend = new WebUiBackend({
    port: 0,
    harness,
    config: {
      projectPath: "/project",
      provider: "test",
      modelId: "model",
    } as any,
    configStore: {} as any,
  });
  const broadcast = vi.spyOn((backend as any).wsServer, "broadcast");
  return { backend, events, broadcast };
}

describe("Eval Dashboard WebSocket protocol", () => {
  it("projects starting, running, completed and failed payloads", () => {
    const states: EvalDashboardState[] = [
      {
        status: "starting",
        requestedSessionId: "requested",
        startedAt: 1,
      },
      {
        status: "running",
        targetSessionId: "target",
        runId: "run",
        stage: "backtrack",
        stageStatus: "running",
        index: 4,
        total: 7,
        application: "chief-backtrack",
        workerAgentId: "agent-123456",
        retryCount: 1,
        message: "screening",
        startedAt: 1,
        actorCount: 2,
        stepCount: 8,
        evidence,
      },
      {
        status: "completed",
        targetSessionId: "target",
        runId: "run",
        html: "<html>exact</html>",
        outputPath: "/private/server/path.html",
        generatedAt: 20,
      },
      {
        status: "failed",
        targetSessionId: "target",
        runId: "run-2",
        stage: "attribution",
        error: "<script>unsafe text</script>",
      },
    ];

    const projected = states.map(projectEvalDashboardState);

    expect(projected).toEqual([
      {
        type: "eval_dashboard",
        status: "starting",
        requestedSessionId: "requested",
        startedAt: 1,
      },
      expect.objectContaining({
        type: "eval_dashboard",
        status: "running",
        targetSessionId: "target",
        runId: "run",
        stage: "backtrack",
        index: 4,
        total: 7,
        application: "chief-backtrack",
        workerAgentId: "agent-123456",
        retryCount: 1,
        evidence,
      }),
      {
        type: "eval_dashboard",
        status: "completed",
        targetSessionId: "target",
        runId: "run",
        html: "<html>exact</html>",
        generatedAt: 20,
      },
      {
        type: "eval_dashboard",
        status: "failed",
        requestedSessionId: undefined,
        targetSessionId: "target",
        runId: "run-2",
        stage: "attribution",
        error: "<script>unsafe text</script>",
      },
    ]);
    expect(projected[2]).not.toHaveProperty("outputPath");
  });

  it("broadcasts the coordinator HTML exactly once", () => {
    const { events, broadcast } = setupBackend();
    const html = "<!doctype html>\n<html><body>coordinator bytes</body></html>";

    events.emit({
      type: "eval:dashboard",
      state: {
        status: "completed",
        targetSessionId: "target",
        runId: "run",
        html,
        outputPath: "/not-exposed.html",
        generatedAt: 20,
      },
    });

    expect(broadcast).toHaveBeenCalledOnce();
    expect(broadcast).toHaveBeenCalledWith({
      type: "eval_dashboard",
      status: "completed",
      targetSessionId: "target",
      runId: "run",
      html,
      generatedAt: 20,
    });
  });

  it("does not interpret client paths as Eval Dashboard commands", async () => {
    const { backend } = setupBackend();
    const send = vi.fn();

    await (backend as any).handleMessage({ send }, {
      type: "eval_dashboard",
      path: "/etc/passwd",
    });

    expect(send).not.toHaveBeenCalled();
  });
});
