// ── CHIFF Iterative Focusing Tests ──
// Unit tests for the focus pipeline: skeleton, budget guard, safeJsonParse,
// mergeSubAnalyses, EvalResult conversion, and signal anchor details.

import { describe, it, expect } from "vitest";
import { buildSkeleton } from "../../src/eval/focus/skeleton.js";
import { PromptBudgetGuard, budgetGuard } from "../../src/eval/focus/budget-guard.js";
import { mergeSubAnalyses } from "../../src/eval/focus/zoom.js";
import { safeJsonParse, type ValidationResult } from "../../src/eval/schemas.js";
import type {
  EvalResult,
  SessionMeta,
  ToolStats,
  PhaseInfo,
  DeviationPoint,
  RootCause,
  TimelineEvent,
} from "../../src/eval/types.js";
import type { HistoryStep } from "../../src/eval/schemas.js";
import type {
  SessionSkeleton,
  ZoneCandidate,
  ZoneAnalysis,
  ScanResult,
  FocusAttribution,
  FocusReport,
  SignalAnchor,
} from "../../src/eval/focus/types.js";

// ── Helpers ──

function makeHistoryStep(overrides: Partial<HistoryStep> = {}): HistoryStep {
  return {
    stepId: 0,
    agent: "read_file",
    observation: "",
    thought: "",
    action: "read_file(path='test.txt')",
    result: "file contents",
    messageIdx: 0,
    isError: false,
    timestamp: Date.now(),
    ...overrides,
  };
}

function makeRuleResult(overrides: Partial<EvalResult> = {}): EvalResult {
  const metadata: SessionMeta = {
    sessionId: "test-session-1",
    title: "Test task",
    model: "test/model",
    totalMessages: 100,
    duration: "5m",
    projectPath: "/test",
    startedAt: "2025-01-01 00:00:00",
    endedAt: "2025-01-01 00:05:00",
  };

  const stats: ToolStats = {
    toolCalls: 50,
    toolErrors: 5,
    errorRate: "10.0%",
    screenshotsTaken: 3,
    userComplaints: 2,
  };

  const phases: PhaseInfo[] = [
    {
      label: "Initial setup",
      startIdx: 0,
      endIdx: 49,
      status: "ok",
      summary: "Setting up project",
      toolCalls: { total: 10, errors: 0 },
    },
    {
      label: "Core changes",
      startIdx: 50,
      endIdx: 79,
      status: "warn",
      summary: "Making core changes",
      toolCalls: { total: 15, errors: 2 },
    },
    {
      label: "Fix attempts",
      startIdx: 80,
      endIdx: 99,
      status: "danger",
      summary: "Repairing issues",
      toolCalls: { total: 25, errors: 3 },
    },
  ];

  const timeline: TimelineEvent[] = [
    { messageIdx: 0, type: "phase_start", label: "Initial setup", severity: "ok" },
    { messageIdx: 50, type: "phase_start", label: "Core changes", severity: "warn" },
    { messageIdx: 55, type: "complaint", label: "不对", severity: "danger" },
    { messageIdx: 58, type: "error", label: "edit: hash a1b2c3 matched wrong closing brace", severity: "warn" },
    { messageIdx: 80, type: "phase_start", label: "Fix attempts", severity: "danger" },
  ];

  const deviations: DeviationPoint[] = [
    {
      messageIdx: 70,
      screenshotKeyword: "颜色, 模糊",
      targetKeyword: "锐利, 高光",
      severity: "high",
      description: "Screenshot shows blurry output when sharp was expected",
    },
  ];

  const rootCauses: RootCause[] = [
    {
      title: "修复连锁反应",
      description: "Multiple phases with errors",
      evidenceIndices: [55, 58],
      severity: "primary",
    },
  ];

  return {
    metadata,
    stats,
    phases,
    deviations,
    rootCauses,
    rules: [],
    analysisMode: "rule",
    timeline,
    causalGraph: null,
    attribution: null,
    rulesApplied: [],
    ...overrides,
  };
}

function makeZoneCandidate(stepId: number, overrides: Partial<ZoneCandidate> = {}): ZoneCandidate {
  return {
    stepId,
    agentsInStep: ["edit"],
    dataIssue: false,
    dataItem: "src/test.ts",
    sourceStep: null,
    irrecoverable: false,
    irrecoverableReason: "",
    affectedSteps: [],
    impactScore: 0.5,
    confidence: 0.5,
    errorType: "hash_ambiguity",
    errorLayer: "tool_error",
    ...overrides,
  };
}

function makeZoneAnalysis(
  zoneId: string,
  stepStart: number,
  stepEnd: number,
  overrides: Partial<ZoneAnalysis> = {},
): ZoneAnalysis {
  return {
    zoneId,
    subtasks: [
      {
        id: `${zoneId}_S1`,
        name: "Subtask 1",
        stepStart,
        stepEnd: stepStart + Math.floor((stepEnd - stepStart) / 2),
        oracle: { goal: "Do something", preconditions: [], keyEvidence: [], acceptanceCriteria: [] },
        loopInfo: { isLoopRelated: false, loopRole: "none", loopGroupId: null, reversibility: "reversible", loopRiskScore: 0 },
      },
      {
        id: `${zoneId}_S2`,
        name: "Subtask 2",
        stepStart: stepStart + Math.floor((stepEnd - stepStart) / 2) + 1,
        stepEnd,
        oracle: { goal: "Do something else", preconditions: [], keyEvidence: [], acceptanceCriteria: [] },
        loopInfo: { isLoopRelated: false, loopRole: "none", loopGroupId: null, reversibility: "reversible", loopRiskScore: 0 },
      },
    ],
    subtaskEdges: [],
    agentNodes: [],
    agentEdges: [],
    stepDataFlows: [],
    candidates: [makeZoneCandidate(stepStart + 5)],
    topCandidate: makeZoneCandidate(stepStart + 5),
    zoneGraphComplete: true,
    ...overrides,
  };
}

// ══════════════════════════════════════════════════════════════════
// 7.1 Unit test: buildSkeleton()
// ══════════════════════════════════════════════════════════════════

describe("buildSkeleton", () => {
  it("includes complete metadata and statistics", () => {
    const steps = Array.from({ length: 100 }, (_, i) =>
      makeHistoryStep({ stepId: i, messageIdx: i, agent: i % 3 === 0 ? "read_file" : i % 3 === 1 ? "write_file" : "edit" }),
    );
    const ruleResult = makeRuleResult();

    const skeleton = buildSkeleton(steps, ruleResult);

    expect(skeleton.meta.question).toBe("Test task");
    expect(skeleton.meta.totalSteps).toBe(100);
    expect(skeleton.meta.totalMessages).toBe(100);
    expect(skeleton.meta.errorRate).toBe("10.0%");
    expect(skeleton.meta.duration).toBe("5m");
    expect(skeleton.meta.model).toBe("test/model");

    expect(skeleton.stats.toolCalls).toBe(50);
    expect(skeleton.stats.toolErrors).toBe(5);
    expect(skeleton.stats.userComplaints).toBe(2);
    expect(skeleton.stats.screenshotsTaken).toBe(3);
  });

  it("maps rule engine phases into phase map", () => {
    const steps = Array.from({ length: 100 }, (_, i) =>
      makeHistoryStep({ stepId: i, messageIdx: i }),
    );
    const ruleResult = makeRuleResult();

    const skeleton = buildSkeleton(steps, ruleResult);

    expect(skeleton.phases).toHaveLength(3);
    expect(skeleton.phases[0]).toMatchObject({
      id: "P1",
      label: "Initial setup",
      status: "ok",
    });
    expect(skeleton.phases[2]).toMatchObject({
      id: "P3",
      label: "Fix attempts",
      status: "danger",
    });
  });

  it("extracts signal anchors — user complaints from timeline", () => {
    const steps = Array.from({ length: 100 }, (_, i) =>
      makeHistoryStep({ stepId: i, messageIdx: i }),
    );
    const ruleResult = makeRuleResult();

    const skeleton = buildSkeleton(steps, ruleResult);
    const complaintAnchors = skeleton.signalAnchors.filter((a) => a.type === "user_complaint");

    expect(complaintAnchors.length).toBeGreaterThan(0);
    const complaint = complaintAnchors[0];
    expect(complaint.priority).toBe("high");
  });

  it("hot/cold zone partitioning — overlapping signals merge", () => {
    // Create steps with error signals at adjacent steps
    const steps: HistoryStep[] = [];
    for (let i = 0; i < 50; i++) {
      const isError = i >= 8 && i <= 12; // steps 8-12 have errors
      steps.push(makeHistoryStep({
        stepId: i,
        messageIdx: i,
        agent: "edit",
        isError,
        result: isError ? "hash abc matched wrong brace" : "success",
      }));
    }
    const ruleResult = makeRuleResult({
      phases: [{
        label: "Full Session", startIdx: 0, endIdx: 49, status: "ok",
        summary: "Full", toolCalls: { total: 20, errors: 5 },
      }],
      deviations: [],
      timeline: [],
    });

    const skeleton = buildSkeleton(steps, ruleResult);

    // 5 error steps at 8-12, expand ±5 → 3-17 → one merged hot zone
    expect(skeleton.hotZones.length).toBeGreaterThan(0);
    // All error signals should be inside the same merged hot zone
    const hotSteps = skeleton.hotZones.flatMap((z) => z.steps.map((s) => s.stepId));
    for (let i = 8; i <= 12; i++) {
      expect(hotSteps).toContain(i);
    }
  });

  it("sparsely signaled region becomes cold zone", () => {
    const steps: HistoryStep[] = [];
    for (let i = 0; i < 100; i++) {
      // Only one error at step 20, rest clean
      steps.push(makeHistoryStep({
        stepId: i, messageIdx: i, agent: "read_file",
        isError: i === 20, result: i === 20 ? "hash error" : "ok",
      }));
    }
    const ruleResult = makeRuleResult({
      phases: [{
        label: "Full", startIdx: 0, endIdx: 99, status: "ok",
        summary: "Full", toolCalls: { total: 100, errors: 1 },
      }],
      deviations: [],
      timeline: [],
    });

    const skeleton = buildSkeleton(steps, ruleResult);
    // There should be cold zones (regions without signals)
    expect(skeleton.coldZones.length).toBeGreaterThan(0);
  });

  it("data item tracker — frequently modified file is tracked as hot", () => {
    const steps: HistoryStep[] = [];
    // Simulate 12 operations on src/shaders/water.frag
    for (let i = 0; i < 15; i++) {
      steps.push(makeHistoryStep({
        stepId: i,
        messageIdx: i,
        agent: i % 2 === 0 ? "write_file" : "edit",
        action: `edit(path='src/shaders/water.frag', content='...')`,
      }));
    }

    const ruleResult = makeRuleResult({
      phases: [{
        label: "Full", startIdx: 0, endIdx: 14, status: "ok",
        summary: "Full", toolCalls: { total: 15, errors: 0 },
      }],
      deviations: [],
      timeline: [],
    });

    const skeleton = buildSkeleton(steps, ruleResult);
    const waterFrag = skeleton.dataItems.find((d) => d.dataItem === "src/shaders/water.frag");
    expect(waterFrag).toBeDefined();
    expect(waterFrag!.operationCount).toBe(15);
    expect(waterFrag!.isHot).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════
// 7.2 Unit test: PromptBudgetGuard — four-tier trimming
// ══════════════════════════════════════════════════════════════════

describe("PromptBudgetGuard", () => {
  it("returns skeleton unchanged when under budget", () => {
    const guard = new PromptBudgetGuard();
    const skeleton: SessionSkeleton = {
      meta: { question: "test", totalSteps: 10, totalMessages: 10, errorRate: "0%", duration: "1m", model: "test" },
      stats: { toolCalls: 10, toolErrors: 0, userComplaints: 0, screenshotsTaken: 0 },
      phases: [],
      signalAnchors: [],
      hotZones: [],
      coldZones: [],
      dataItems: [],
    };

    const { skeleton: result, trimmed } = guard.enforce(skeleton);
    expect(trimmed).toBe(false);
    expect(result).toBe(skeleton);
  });

  it("trims string to maxChars with truncation marker", () => {
    const longString = "x".repeat(70000);
    const result = budgetGuard.trimString(longString, 60000);
    expect(result.length).toBeLessThanOrEqual(60100); // allow for marker overhead
    expect(result).toContain("Budget Guard");
  });

  it("applies Tier 1 (cold zone compression) when over budget", () => {
    // Create a skeleton with large hot zones that would overflow
    const guard = new PromptBudgetGuard();
    const skeleton: SessionSkeleton = {
      meta: { question: "test", totalSteps: 500, totalMessages: 500, errorRate: "10%", duration: "10m", model: "test" },
      stats: { toolCalls: 400, toolErrors: 50, userComplaints: 5, screenshotsTaken: 10 },
      phases: [],
      signalAnchors: [],
      hotZones: [
        {
          stepStart: 0, stepEnd: 499, suspicionScore: 0.9, primarySignal: "tool_error",
          signals: [],
          steps: Array.from({ length: 500 }, (_, i) => ({
            stepId: i, agent: "edit", action: "a".repeat(300),
            thought: "t".repeat(200), result: "r".repeat(200), isError: i % 10 === 0,
          })),
        },
      ],
      coldZones: [],
      dataItems: [],
    };

    const { skeleton: result, trimmed } = guard.enforce(skeleton);
    // Either passes or gets trimmed — should not throw
    expect(trimmed).toBe(true);
    expect(result).toBeDefined();
  });
});

// ══════════════════════════════════════════════════════════════════
// 7.3 Unit test: safeJsonParse()
// ══════════════════════════════════════════════════════════════════

describe("safeJsonParse", () => {
  it("returns parsed object for valid JSON", () => {
    const result = safeJsonParse('{"valid": true, "data": [1,2,3]}', "test", (o) => ({ ok: true, value: o as Record<string, unknown> }));
    expect(result).not.toBeNull();
    expect(result).toMatchObject({ valid: true, data: [1, 2, 3] });
  });

  it("returns null for unterminated string", () => {
    const result = safeJsonParse('{"text": "unterminated', "Step3", () => ({ ok: true, value: null }));
    expect(result).toBeNull();
  });

  it("returns null for valid JSON failing validation", () => {
    const result = safeJsonParse('{"wrongField": 1}', "Step1", () => ({ ok: false, errors: ["Missing required field"] }));
    expect(result).toBeNull();
  });

  it("returns null for empty input", () => {
    const result = safeJsonParse("", "test", () => ({ ok: true, value: null }));
    expect(result).toBeNull();
  });

  it("returns null for non-JSON input", () => {
    const result = safeJsonParse("not json at all", "test", () => ({ ok: true, value: null }));
    expect(result).toBeNull();
  });

  it("passes through validation for correct input", () => {
    const result = safeJsonParse(
      '{"name": "test", "count": 42}',
      "Step1",
      (parsed) => {
        const o = parsed as Record<string, unknown>;
        if (typeof o["name"] === "string" && typeof o["count"] === "number") {
          return { ok: true, value: { name: o["name"], count: o["count"] } };
        }
        return { ok: false, errors: ["Type mismatch"] };
      },
    );
    expect(result).toEqual({ name: "test", count: 42 });
  });
});

// ══════════════════════════════════════════════════════════════════
// 7.4 Unit test: mergeSubAnalyses()
// ══════════════════════════════════════════════════════════════════

describe("mergeSubAnalyses", () => {
  it("returns empty analysis for empty input", () => {
    const result = mergeSubAnalyses([]);
    expect(result.zoneId).toBe("merged");
    expect(result.candidates).toHaveLength(0);
    expect(result.zoneGraphComplete).toBe(false);
  });

  it("returns single analysis unchanged", () => {
    const za = makeZoneAnalysis("Z1", 0, 50);
    const result = mergeSubAnalyses([za]);
    expect(result).toBe(za);
  });

  it("merges two ZoneAnalyses with non-overlapping step ranges", () => {
    const za1 = makeZoneAnalysis("Z1", 0, 99, {
      candidates: [makeZoneCandidate(20, { impactScore: 0.8 }), makeZoneCandidate(50, { impactScore: 0.5 })],
    });
    const za2 = makeZoneAnalysis("Z1", 100, 199, {
      candidates: [makeZoneCandidate(120, { impactScore: 0.9 }), makeZoneCandidate(150, { impactScore: 0.3 })],
    });

    const merged = mergeSubAnalyses([za1, za2]);

    expect(merged.zoneId).toBe("Z1");
    expect(merged.subtasks).toHaveLength(4); // 2 from each
    expect(merged.candidates).toHaveLength(4);
    // Candidates should be sorted by impactScore descending
    expect(merged.candidates[0].impactScore).toBe(0.9);
    expect(merged.candidates[3].impactScore).toBe(0.3);
    expect(merged.topCandidate).toBe(merged.candidates[0]);
    expect(merged.zoneGraphComplete).toBe(true);
  });

  it("marks zoneGraphComplete as false if any sub-analysis is incomplete", () => {
    const za1 = makeZoneAnalysis("Z1", 0, 50, { zoneGraphComplete: true });
    const za2 = makeZoneAnalysis("Z1", 51, 100, { zoneGraphComplete: false });

    const merged = mergeSubAnalyses([za1, za2]);
    expect(merged.zoneGraphComplete).toBe(false);
  });

  it("handles three sub-analyses merge correctly", () => {
    const zones = [
      makeZoneAnalysis("Z1", 0, 50, { candidates: [makeZoneCandidate(10, { impactScore: 0.3 })] }),
      makeZoneAnalysis("Z1", 51, 100, { candidates: [makeZoneCandidate(60, { impactScore: 0.7 })] }),
      makeZoneAnalysis("Z1", 101, 150, { candidates: [makeZoneCandidate(110, { impactScore: 0.5 })] }),
    ];

    const merged = mergeSubAnalyses(zones);
    expect(merged.candidates).toHaveLength(3);
    expect(merged.candidates[0].stepId).toBe(60); // highest impact
  });
});

// ══════════════════════════════════════════════════════════════════
// 7.5 Unit test: FocusReport → EvalResult conversion
// ══════════════════════════════════════════════════════════════════
// Note: composeEvalResult is internal to focus/index.ts but we
// test the imported module indirectly through types and interface checks.

describe("FocusReport → EvalResult mapping (type-level)", () => {
  it("FocusAttribution maps to existing Attribution type fields", () => {
    const attr: FocusAttribution = {
      mistakeAgent: "write_file",
      mistakeStep: 314,
      zoneId: "Z1",
      reason: "write_file overwrote the correct shader based on misdiagnosis",
      rulesApplied: ["Rule2", "Rule3"],
      cascadePath: [
        {
          fromZoneId: "Z1", fromStepId: 314,
          toZoneId: "Z2", toStepId: 480,
          dataItem: "src/shaders/water.frag",
          mechanism: "data_contamination",
        },
      ],
      alternateRootCauses: [],
    };

    // Verify all required EvalResult attribution fields are present
    expect(attr.mistakeAgent).toBeTruthy();
    expect(typeof attr.mistakeStep).toBe("number");
    expect(attr.reason).toBeTruthy();
    expect(Array.isArray(attr.rulesApplied)).toBe(true);
  });

  it("ZoneAnalysis candidates include errorType and errorLayer fields", () => {
    const candidate = makeZoneCandidate(100, {
      errorType: "hash_ambiguity",
      errorLayer: "tool_error",
    });

    expect(candidate.errorType).toBe("hash_ambiguity");
    expect(candidate.errorLayer).toBe("tool_error");
  });
});

// ══════════════════════════════════════════════════════════════════
// 7.7 Regression test: runCausalGraphPipeline importable
// ══════════════════════════════════════════════════════════════════

describe("runCausalGraphPipeline (fast path)", () => {
  it("is exported and importable from eval/llm", async () => {
    const { runCausalGraphPipeline } = await import("../../src/eval/llm.js");
    expect(typeof runCausalGraphPipeline).toBe("function");
  });

  it("FOCUS_PATH_THRESHOLD is 500", async () => {
    const { FOCUS_PATH_THRESHOLD } = await import("../../src/eval/focus/index.js");
    expect(FOCUS_PATH_THRESHOLD).toBe(500);
  });

  it("runFocusPipeline is exported from eval/llm", async () => {
    const { runFocusPipeline } = await import("../../src/eval/llm.js");
    expect(typeof runFocusPipeline).toBe("function");
  });
});

// ══════════════════════════════════════════════════════════════════
// 8.8 Unit test: signal anchor label format for tool errors
// ══════════════════════════════════════════════════════════════════

describe("Signal anchor tool error labels", () => {
  it("tool error anchor includes agent name and result summary, NOT just 'agent error'", () => {
    const steps: HistoryStep[] = [
      makeHistoryStep({
        stepId: 10, messageIdx: 10, agent: "edit",
        isError: true,
        result: "hash a1b2c3 matched the wrong closing brace in range_replace (24 chars)",
      }),
    ];

    const ruleResult = makeRuleResult({
      phases: [{
        label: "Full", startIdx: 0, endIdx: 10, status: "ok",
        summary: "Full", toolCalls: { total: 1, errors: 1 },
      }],
      deviations: [],
      timeline: [],
    });

    const skeleton = buildSkeleton(steps, ruleResult);
    const errorAnchors = skeleton.signalAnchors.filter((a) => a.type === "tool_error");

    expect(errorAnchors).toHaveLength(1);
    const anchor = errorAnchors[0];
    // Must contain the agent name
    expect(anchor.label).toContain("edit");
    // Must contain result summary, not just "error"
    expect(anchor.label).toContain("hash");
    // Must NOT be just "edit error"
    expect(anchor.label).not.toBe("edit error");
    // Priority must be "high"
    expect(anchor.priority).toBe("high");
  });
});

// ══════════════════════════════════════════════════════════════════
// 8.9 Integration test note
// ══════════════════════════════════════════════════════════════════

describe("8.9 Integration test: Zoom prompt and Synthesize reason", () => {
  it("Zoom system prompt includes errorType classification instruction", async () => {
    const { ZOOM_SYSTEM_PROMPT } = await import("../../src/eval/focus/prompts.js");
    expect(ZOOM_SYSTEM_PROMPT).toContain("errorLayer");
    expect(ZOOM_SYSTEM_PROMPT).toContain("errorType");
    expect(ZOOM_SYSTEM_PROMPT).toContain("tool_error");
    expect(ZOOM_SYSTEM_PROMPT).toContain("agent_error");
    expect(ZOOM_SYSTEM_PROMPT).toContain("process_error");
  });

  it("Synthesize system prompt includes three-layer classification instruction", async () => {
    const { SYNTH_SYSTEM_PROMPT } = await import("../../src/eval/focus/prompts.js");
    expect(SYNTH_SYSTEM_PROMPT).toContain("errorLayer");
    expect(SYNTH_SYSTEM_PROMPT).toContain("errorType");
    expect(SYNTH_SYSTEM_PROMPT).toContain("tool name");
    expect(SYNTH_SYSTEM_PROMPT).toContain("cascade logic");
  });

  it("buildZoomPrompt includes errorType mention in instructions", async () => {
    const { buildZoomPrompt } = await import("../../src/eval/focus/prompts.js");
    const prompt = buildZoomPrompt(
      {
        id: "Z1",
        stepStart: 10,
        stepEnd: 30,
        suspicionScore: 0.8,
        primarySignal: "error_burst",
        summary: "Test zone",
        keyAgents: ["edit"],
        keyDataItems: ["test.ts"],
      },
      [],
    );
    expect(prompt).toContain("errorLayer");
    expect(prompt).toContain("errorType");
  });
});
