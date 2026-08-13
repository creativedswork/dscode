import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  loadTrajectory: vi.fn(),
  createRun: vi.fn(),
  updateRunStage: vi.fn(),
  finishRun: vi.fn(),
  runPipeline: vi.fn(),
  generateArtifacts: vi.fn(),
  openDashboard: vi.fn(),
  loadRuleStore: vi.fn(),
  semanticMerge: vi.fn(),
  saveRuleStore: vi.fn(),
}));

vi.mock("../../src/eval/trajectory.js", () => ({
  loadMultiAgentTrajectory: mocks.loadTrajectory,
}));

vi.mock("../../src/eval/chief/workspace.js", () => ({
  createEvalRun: mocks.createRun,
  updateRunStage: mocks.updateRunStage,
  finishEvalRun: mocks.finishRun,
}));

vi.mock("../../src/eval/chief/pipeline.js", () => ({
  runChiefPipeline: mocks.runPipeline,
}));

vi.mock("../../src/eval/dashboard.js", () => ({
  generateDashboard: vi.fn(),
  generateDashboardArtifacts: mocks.generateArtifacts,
}));

vi.mock("../../src/ui/shared/open-path.js", () => ({
  openPath: mocks.openDashboard,
}));

vi.mock("../../src/eval/rules/store.js", () => ({
  loadRuleStore: mocks.loadRuleStore,
  semanticMerge: mocks.semanticMerge,
  saveRuleStore: mocks.saveRuleStore,
}));

vi.mock("../../src/ui/tui/app.js", () => ({
  TuiApp: class {
    upsertAgentActivity = vi.fn();
  },
}));

import { HarnessEventBus } from "../../src/application/events.js";
import type { EvalDashboardState } from "../../src/application/events.js";
import { runEval } from "../../src/eval/index.js";
import { TuiBackend } from "../../src/ui/tui/backend.js";

const targetSessionId = "TARGET-SESSION-CANONICAL";
const runId = "run-123456";
const reportHtml = "<!doctype html><html><body>exact report</body></html>";

function sessionData() {
  return {
    version: 3,
    metadata: {
      id: targetSessionId,
      projectPath: "/project",
    },
    messages: [],
    agentMessages: [],
  } as any;
}

function trajectory() {
  return {
    session: sessionData(),
    actors: [{
      agentId: "main-agent",
      application: "main",
      role: "main",
      evidenceQuality: "full",
    }],
    steps: [{
      stepId: 0,
      agentId: "main-agent",
      application: "main",
      role: "main",
      kind: "response",
      observation: "",
      thought: "",
      action: "respond",
      result: "done",
      timestamp: 1,
      localOrder: 0,
      isError: false,
      evidenceQuality: "full",
    }],
    controlEdges: [],
    dataEdges: [],
    evidence: {
      totalActors: 1,
      subagentCount: 0,
      fullTranscripts: 1,
      summaryTranscripts: 0,
      missingTranscripts: 0,
      completeness: "complete",
      affectedAgentIds: [],
    },
  } as any;
}

function runContext() {
  return {
    evalRoot: "/tmp/eval",
    targetRoot: "/tmp/eval/TARGET",
    runRoot: `/tmp/eval/TARGET/runs/${runId}`,
    libraryDir: `/tmp/eval/TARGET/runs/${runId}/library`,
    outputDir: `/tmp/eval/TARGET/runs/${runId}/output`,
    manifestPath: `/tmp/eval/TARGET/runs/${runId}/manifest.json`,
    manifest: {
      runId,
      targetSessionId,
      status: "active",
      currentStage: "prepare",
    },
  } as any;
}

function setup(loadSessionFile = vi.fn(async () => sessionData())) {
  const events = new HarnessEventBus({ error: vi.fn() } as any);
  const states: EvalDashboardState[] = [];
  events.on("eval:dashboard", (event) => states.push(event.state));
  const harness = {
    events,
    hostId: () => "host-test",
    agents: { list: vi.fn(() => []) },
    currentSessionId: vi.fn(() => "INVOKING-SESSION"),
    currentProjectPath: () => "/project",
    saveCurrentSession: vi.fn(),
    resolveSession: vi.fn(() => ({
      id: targetSessionId,
      projectPath: "/project",
    })),
    loadSession: loadSessionFile,
    publish: (event: any) => events.emit(event),
    sessions: { currentId: () => "INVOKING-SESSION" },
  } as any;
  const ui = {
    addInfo: vi.fn(),
    addError: vi.fn(),
  } as any;
  return { events, states, harness, ui };
}

beforeEach(() => {
  vi.clearAllMocks();
  const context = runContext();
  mocks.loadTrajectory.mockResolvedValue(trajectory());
  mocks.createRun.mockResolvedValue(context);
  mocks.updateRunStage.mockImplementation(async (_run, stage, update) => {
    context.manifest.currentStage = stage;
    return { ...context.manifest, stages: { [stage]: update } };
  });
  mocks.finishRun.mockImplementation(async (run, status) => {
    run.manifest.status = status;
    return run.manifest;
  });
  mocks.runPipeline.mockImplementation(async (options) => {
    options.onProgress?.({
      runId,
      targetSessionId,
      stage: "prepare",
      application: "coordinator",
      workerAgentId: "agent-abcdef123",
      index: 1,
      total: 7,
      status: "done",
      durationMs: 1,
      message: "Trajectory frozen",
    });
    return {
      stats: { toolCalls: 0, errorRate: 0 },
      rules: [],
    };
  });
  mocks.generateArtifacts.mockReturnValue(reportHtml);
  mocks.loadRuleStore.mockReturnValue({ rules: [] });
  mocks.semanticMerge.mockResolvedValue({ rules: [] });
});

describe("Eval Dashboard lifecycle", () => {
  it("emits starting synchronously before the first Session read settles", async () => {
    let resolveLoad!: (value: null) => void;
    const pendingLoad = new Promise<null>((resolve) => {
      resolveLoad = resolve;
    });
    const { states, harness, ui } = setup(vi.fn(() => pendingLoad));

    const run = runEval("TARGET", { harness, ui });

    expect(states).toEqual([{
      status: "starting",
      requestedSessionId: "TARGET",
      startedAt: expect.any(Number),
    }]);

    resolveLoad(null);
    await run;
    expect(states.at(-1)).toMatchObject({
      status: "failed",
      requestedSessionId: "TARGET",
      targetSessionId,
      error: `Failed to load session: ${targetSessionId}`,
    });
  });

  it("preserves historical target identity and publishes the persisted HTML", async () => {
    const { states, harness, ui } = setup();

    await runEval("TARGET", { harness, ui });

    expect(states.map((state) => state.status)).toEqual([
      "starting",
      "running",
      "running",
      "running",
      "completed",
    ]);
    expect(states.filter((state) => state.status === "running")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          targetSessionId,
          runId,
          actorCount: 1,
          stepCount: 1,
        }),
      ]),
    );
    expect(states.at(-1)).toMatchObject({
      status: "completed",
      targetSessionId,
      runId,
      html: reportHtml,
      outputPath: expect.stringMatching(/TARGET-S\.html$/),
    });
    expect(mocks.generateArtifacts).toHaveBeenCalledOnce();
    expect(mocks.generateArtifacts.mock.calls[0][1]).toHaveLength(2);
    expect(mocks.openDashboard).not.toHaveBeenCalled();
    expect(ui.addInfo).toHaveBeenCalledWith(
      expect.stringContaining("[1/7] coordinator (abcdef) OK"),
    );
    expect(ui.addInfo).not.toHaveBeenCalledWith(
      expect.stringContaining("(agent-)"),
    );
  });

  it("publishes failed without generating or presenting partial HTML", async () => {
    mocks.runPipeline.mockRejectedValueOnce(new Error("attribution invalid"));
    const { states, harness, ui } = setup();

    await runEval("TARGET", { harness, ui });

    expect(mocks.generateArtifacts).not.toHaveBeenCalled();
    expect(states.some((state) => state.status === "completed")).toBe(false);
    expect(states.at(-1)).toMatchObject({
      status: "failed",
      targetSessionId,
      runId,
      error: "attribution invalid",
    });
  });

  it("opens only a completed trusted path in the TUI subscriber", () => {
    const { events, harness } = setup();
    new TuiBackend(harness);

    events.emit({
      type: "eval:dashboard",
      state: {
        status: "completed",
        targetSessionId,
        runId,
        html: reportHtml,
        outputPath: "/trusted/eval.html",
        generatedAt: 10,
      },
    });
    events.emit({
      type: "eval:dashboard",
      state: {
        status: "failed",
        targetSessionId,
        runId: "failed-run",
        error: "failed",
      },
    });

    expect(mocks.openDashboard).toHaveBeenCalledOnce();
    expect(mocks.openDashboard).toHaveBeenCalledWith("/trusted/eval.html");
  });
});
