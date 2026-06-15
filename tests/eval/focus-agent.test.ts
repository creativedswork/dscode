// ── CHIFF Agent Loop Tests ──
// Unit tests for agent-loop, tool sandbox, workspace, progress display, and system prompts.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { ValidationResult } from "../../src/eval/schemas.js";

// ── Test: Workspace ──

describe("workspace", () => {
  const tmpDir = process.env.TMPDIR ?? "/tmp";

  // We test the path resolution functions directly
  it("createWorkspace creates directory structure", async () => {
    const { createWorkspace, workspaceDir } = await import("../../src/eval/focus/workspace.js");
    const { existsSync, mkdirSync, rmSync } = await import("node:fs");
    const testId = `test-agent-${Date.now()}`;
    const ws = createWorkspace(testId);
    expect(existsSync(ws)).toBe(true);
    expect(existsSync(ws + "/library")).toBe(true);
    expect(existsSync(ws + "/notebook")).toBe(true);
    expect(existsSync(ws + "/output")).toBe(true);
    expect(existsSync(ws + "/library/steps")).toBe(true);
    // Cleanup
    rmSync(ws, { recursive: true, force: true });
  });

  it("writeLibrary writes all expected files", async () => {
    const { createWorkspace, writeLibrary, writeLibraryMetadata, writeLibrarySkeleton,
      writeLibrarySignals, writeLibraryDataItems, writeLibrarySteps, writeLibraryReadme } =
      await import("../../src/eval/focus/workspace.js");
    const { buildSkeleton } = await import("../../src/eval/focus/skeleton.js");
    const { existsSync, rmSync } = await import("node:fs");
    const { readFileSync } = await import("node:fs");

    // Build a minimal skeleton
    const steps = Array.from({ length: 100 }, (_, i) => ({
      stepId: i,
      agent: "read_file",
      observation: "",
      thought: "thinking",
      action: `read_file(path='test${i}.txt')`,
      result: "ok",
      messageIdx: i,
      isError: i % 20 === 0,
      timestamp: Date.now(),
    }));

    const ruleResult = {
      metadata: {
        sessionId: "test",
        title: "Test",
        model: "test/model",
        totalMessages: 100,
        duration: "1m",
        projectPath: "/test",
        startedAt: "",
        endedAt: "",
      },
      stats: {
        toolCalls: 100,
        toolErrors: 5,
        errorRate: "5.0%",
        screenshotsTaken: 0,
        userComplaints: 0,
      },
      phases: [
        { label: "Phase 1", startIdx: 0, endIdx: 49, status: "ok" as const, summary: "", toolCalls: { total: 50, errors: 2 } },
        { label: "Phase 2", startIdx: 50, endIdx: 99, status: "warn" as const, summary: "", toolCalls: { total: 50, errors: 3 } },
      ],
      deviations: [],
      timeline: [],
      rootCauses: [],
      rules: [],
      causalGraph: null,
      attribution: null,
      rulesApplied: [],
    } as any;

    const skeleton = buildSkeleton(steps, ruleResult);
    const testId = `test-wl-${Date.now()}`;
    const ws = createWorkspace(testId);

    const { fileCount } = writeLibrary(skeleton, steps, ruleResult, "SCAN", ws);
    expect(fileCount).toBeGreaterThanOrEqual(5);

    // Verify key files exist
    expect(existsSync(ws + "/library/meta.md")).toBe(true);
    expect(existsSync(ws + "/library/skeleton.md")).toBe(true);
    expect(existsSync(ws + "/library/signals.md")).toBe(true);
    expect(existsSync(ws + "/library/data-items.md")).toBe(true);
    expect(existsSync(ws + "/library/README.md")).toBe(true);

    // Verify meta content
    const metaContent = readFileSync(ws + "/library/meta.md", "utf-8");
    expect(metaContent).toContain("Test");
    expect(metaContent).toContain("100");

    // Cleanup
    rmSync(ws, { recursive: true, force: true });
  });

  it("cleanOldWorkspaces removes oldest directories", async () => {
    const { createWorkspace, cleanOldWorkspaces, evalBaseDir } =
      await import("../../src/eval/focus/workspace.js");
    const { existsSync, rmSync } = await import("node:fs");

    // Create 12 workspaces
    const ids: string[] = [];
    for (let i = 0; i < 12; i++) {
      const id = `test-clean-${Date.now()}-${i}`;
      ids.push(id);
      createWorkspace(id);
      // Small delay to ensure different mtimes
      await new Promise((r) => setTimeout(r, 50));
    }

    // Clean, retaining 10
    const removed = cleanOldWorkspaces(10);
    expect(removed).toBeGreaterThanOrEqual(2);

    // Cleanup all
    for (const id of ids) {
      const dir = evalBaseDir() + "/" + id;
      if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
    }
  }, 15000);
});

// ── Test: Progress Display ──

describe("ProgressDisplay", () => {
  it("tracks phase lifecycle correctly", async () => {
    const { ProgressDisplay } = await import("../../src/eval/focus/progress.js");

    const pd = new ProgressDisplay(true); // web mode to avoid terminal output
    pd.onPhaseStart(1);
    pd.onPhaseDone(1, "done", 1000);
    pd.dispose();
    // Should not throw
    expect(true).toBe(true);
  });

  it("handles sub-zone registration", async () => {
    const { ProgressDisplay } = await import("../../src/eval/focus/progress.js");

    const pd = new ProgressDisplay(true);
    pd.onPhaseStart(2);
    pd.setSubZones(2, [
      { id: "Z1", label: "Zone Z1" },
      { id: "Z2", label: "Zone Z2" },
    ]);
    pd.dispose();
    expect(true).toBe(true);
  });

  it("emits web events in web mode", async () => {
    const { ProgressDisplay } = await import("../../src/eval/focus/progress.js");

    const pd = new ProgressDisplay(true);
    pd.onPhaseStart(0);
    pd.onPhaseDone(0, "test", 100);

    const events = pd.getWebEvents();
    expect(events.length).toBeGreaterThan(0);
    expect(events[0].type).toBe("phaseStart");
    pd.dispose();
  });

  it("shows completion without errors", async () => {
    const { ProgressDisplay } = await import("../../src/eval/focus/progress.js");

    const pd = new ProgressDisplay(true);
    pd.showCompletion({
      totalDurationMs: 5000,
      totalLLMCalls: 15,
      keyFindings: "Root cause: edit@Step 42",
    });
    pd.dispose();
    expect(true).toBe(true);
  });
});

// ── Test: Agent System Prompts ──

describe("agent system prompts", () => {
  it("SCAN_AGENT_SYSTEM_PROMPT contains required sections", async () => {
    const { SCAN_AGENT_SYSTEM_PROMPT } = await import("../../src/eval/focus/prompts.js");
    expect(SCAN_AGENT_SYSTEM_PROMPT).toContain("SCANNER");
    expect(SCAN_AGENT_SYSTEM_PROMPT).toContain("Workspace Guide");
    expect(SCAN_AGENT_SYSTEM_PROMPT).toContain("Output Schema");
    expect(SCAN_AGENT_SYSTEM_PROMPT).toContain("noIssuesDetected");
  });

  it("ZOOM_AGENT_SYSTEM_PROMPT contains required sections", async () => {
    const { ZOOM_AGENT_SYSTEM_PROMPT } = await import("../../src/eval/focus/prompts.js");
    expect(ZOOM_AGENT_SYSTEM_PROMPT).toContain("DEEP-DIVE ANALYST");
    expect(ZOOM_AGENT_SYSTEM_PROMPT).toContain("Output Schema");
    expect(ZOOM_AGENT_SYSTEM_PROMPT).toContain("errorLayer");
  });

  it("SYNTH_AGENT_SYSTEM_PROMPT contains required sections", async () => {
    const { SYNTH_AGENT_SYSTEM_PROMPT } = await import("../../src/eval/focus/prompts.js");
    expect(SYNTH_AGENT_SYSTEM_PROMPT).toContain("SYNTHESIZER");
    expect(SYNTH_AGENT_SYSTEM_PROMPT).toContain("Output Schema");
    expect(SYNTH_AGENT_SYSTEM_PROMPT).toContain("Rule1");
  });

  it("buildScanTaskPrompt includes session info", async () => {
    const { buildScanTaskPrompt } = await import("../../src/eval/focus/prompts.js");
    const skeleton = {
      meta: { question: "Test task", totalSteps: 600, totalMessages: 120, errorRate: "12%", duration: "30m", model: "test/model" },
      stats: { toolCalls: 500, toolErrors: 50, userComplaints: 3, screenshotsTaken: 5 },
      phases: [],
      signalAnchors: [],
      hotZones: [],
      coldZones: [],
      dataItems: [],
    } as any;
    const prompt = buildScanTaskPrompt(skeleton);
    expect(prompt).toContain("Test task");
    expect(prompt).toContain("600");
    expect(prompt).toContain("output/scan-result.json");
  });
});

// ── Test: Synthesize Validation ──

describe("synthesize validation", () => {
  it("validateFocusAttribution accepts valid data", async () => {
    const { validateFocusAttribution } = await import("../../src/eval/focus/synthesize.js");
    const result = validateFocusAttribution({
      mistakeAgent: "edit",
      mistakeStep: 42,
      zoneId: "Z1",
      reason: "Wrong hash used in edit",
      rulesApplied: ["Rule1", "Rule2"],
      cascadePath: [],
      alternateRootCauses: [],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.mistakeAgent).toBe("edit");
      expect(result.value.mistakeStep).toBe(42);
    }
  });

  it("validateFocusAttribution handles recovery arcs", async () => {
    const { validateFocusAttribution } = await import("../../src/eval/focus/synthesize.js");
    const result = validateFocusAttribution({
      mistakeAgent: "write_file",
      mistakeStep: 100,
      zoneId: "Z1",
      reason: "Bad write",
      rulesApplied: [],
      cascadePath: [],
      alternateRootCauses: [],
      recoveryArcs: [
        {
          errorStep: 100,
          errorAgent: "write_file",
          errorSummary: "Wrote wrong content",
          detectionStep: 105,
          detectionType: "screenshot_divergence",
          correctionStep: 110,
          correctionAgent: "edit",
          correctionSummary: "Fixed content",
          effective: true,
          stepsToRecover: 10,
          misdiagnosisCount: 0,
          rootCauseHypothesis: "Agent used wrong hash",
        },
      ],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.recoveryArcs).toBeDefined();
      expect(result.value.recoveryArcs!.length).toBe(1);
    }
  });
});

// ── Test: Merge Sub Analyses ──

describe("mergeSubAnalyses", () => {
  it("merges multiple zone analyses", async () => {
    const { mergeSubAnalyses } = await import("../../src/eval/focus/zoom.js");
    const a1 = {
      zoneId: "Z1",
      subtasks: [{ id: "Z1_S1", name: "S1", stepStart: 0, stepEnd: 5, oracle: { goal: "", preconditions: [], keyEvidence: [], acceptanceCriteria: [] }, loopInfo: { isLoopRelated: false, loopRole: "none" as const, loopGroupId: null, reversibility: "reversible" as const, loopRiskScore: 0 } }],
      subtaskEdges: [],
      agentNodes: [],
      agentEdges: [],
      stepDataFlows: [],
      candidates: [{ stepId: 1, agentsInStep: ["a"], dataIssue: false, dataItem: "", sourceStep: null, irrecoverable: false, irrecoverableReason: "", affectedSteps: [], impactScore: 0.8, confidence: 0.9, errorType: "hash_ambiguity" as const, errorLayer: "tool_error" as const }],
      topCandidate: null,
      zoneGraphComplete: true,
    };
    const a2 = {
      zoneId: "Z1",
      subtasks: [{ id: "Z1_S2", name: "S2", stepStart: 6, stepEnd: 10, oracle: { goal: "", preconditions: [], keyEvidence: [], acceptanceCriteria: [] }, loopInfo: { isLoopRelated: false, loopRole: "none" as const, loopGroupId: null, reversibility: "reversible" as const, loopRiskScore: 0 } }],
      subtaskEdges: [],
      agentNodes: [],
      agentEdges: [],
      stepDataFlows: [],
      candidates: [{ stepId: 8, agentsInStep: ["b"], dataIssue: false, dataItem: "", sourceStep: null, irrecoverable: false, irrecoverableReason: "", affectedSteps: [], impactScore: 0.5, confidence: 0.5, errorType: "unknown" as const, errorLayer: "agent_error" as const }],
      topCandidate: null,
      zoneGraphComplete: false,
    };

    const merged = mergeSubAnalyses([a1, a2]);
    expect(merged.zoneId).toBe("Z1");
    expect(merged.subtasks.length).toBe(2);
    expect(merged.candidates.length).toBe(2);
    expect(merged.zoneGraphComplete).toBe(false);
  });
});
