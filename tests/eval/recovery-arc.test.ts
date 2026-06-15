// ── Recovery Arc Tests ──
// Covers: validateRecoveryArcs (both CHIFF and Focus paths),
// generateRecoveryTimelineHTML, buildStep7Prompt with recovery arcs.
// Equivalent to manual test tasks 7.3 and 7.4.

import { describe, it, expect } from "vitest";
import { generateDashboardHTML } from "../../src/eval/dashboard.js";
import { buildStep7Prompt } from "../../src/eval/prompts.js";
import type { EvalResult, SessionMeta, ToolStats, PhaseInfo, DeviationPoint, RootCause, TimelineEvent } from "../../src/eval/types.js";
import type { RecoveryArc } from "../../src/eval/schemas.js";

// ── Helpers ──

function makeRecoveryArc(overrides: Partial<RecoveryArc> = {}): RecoveryArc {
  return {
    errorStep: 5,
    errorAgent: "write_file",
    errorSummary: "Wrote incorrect CSS class name",
    detectionStep: 6,
    detectionType: "test_failure",
    correctionStep: 8,
    correctionAgent: "edit",
    correctionSummary: "Fixed CSS class to match design spec",
    effective: true,
    stepsToRecover: 3,
    misdiagnosisCount: 0,
    rootCauseHypothesis: "Agent wrote CSS before understanding the design system layout; correction required re-reading the existing stylesheet.",
    ...overrides,
  };
}

function makeSelfCorrectionArc(overrides: Partial<RecoveryArc> = {}): RecoveryArc {
  return {
    errorStep: 12,
    errorAgent: "edit",
    errorSummary: "Applied edit to wrong line via ambiguous hash",
    detectionStep: 13,
    detectionType: "self_correction",
    correctionStep: 13,
    correctionAgent: "edit",
    correctionSummary: "Re-applied edit with precise hash targeting",
    effective: true,
    stepsToRecover: 1,
    misdiagnosisCount: 0,
    rootCauseHypothesis: "Agent used a hash with low anchoring quality without verifying uniqueness; self-corrected by re-reading file first.",
    ...overrides,
  };
}

function makeMisdiagnosisArc(overrides: Partial<RecoveryArc> = {}): RecoveryArc {
  return {
    errorStep: 20,
    errorAgent: "bash",
    errorSummary: "Ran wrong test command with typo in flag",
    detectionStep: 21,
    detectionType: "tool_error",
    correctionStep: 25,
    correctionAgent: "bash",
    correctionSummary: "Ran corrected test command after 2 failed attempts",
    effective: true,
    stepsToRecover: 5,
    misdiagnosisCount: 2,
    rootCauseHypothesis: "Agent did not verify the command syntax before execution; misdiagnosed as environment issue twice before correcting the flag.",
    ...overrides,
  };
}

function makeIneffectiveArc(overrides: Partial<RecoveryArc> = {}): RecoveryArc {
  return {
    errorStep: 30,
    errorAgent: "write_file",
    errorSummary: "Generated code with imports from wrong module",
    detectionStep: 31,
    detectionType: "user_complaint",
    correctionStep: 33,
    correctionAgent: "edit",
    correctionSummary: "Changed import path but not the usage",
    effective: false,
    stepsToRecover: 3,
    misdiagnosisCount: 1,
    rootCauseHypothesis: "Agent assumed the import path was the only issue; failed to check downstream references to the module.",
    ...overrides,
  };
}

function makeEvalResult(overrides: Partial<EvalResult> = {}): EvalResult {
  const metadata: SessionMeta = {
    sessionId: "test-recovery-1",
    title: "Test Recovery Session",
    model: "test/model",
    totalMessages: 50,
    duration: "3m",
    projectPath: "/test",
    startedAt: "2025-06-01 10:00:00",
    endedAt: "2025-06-01 10:03:00",
  };

  const stats: ToolStats = {
    toolCalls: 30,
    toolErrors: 5,
    errorRate: "16.7%",
    screenshotsTaken: 2,
    userComplaints: 1,
  };

  const phases: PhaseInfo[] = [
    { label: "Setup", startIdx: 0, endIdx: 10, status: "ok", summary: "Initial setup", toolCalls: { total: 5, errors: 0 } },
    { label: "Core work", startIdx: 11, endIdx: 30, status: "warn", summary: "Core implementation", toolCalls: { total: 15, errors: 3 } },
    { label: "Fixes", startIdx: 31, endIdx: 49, status: "danger", summary: "Bug fix cycle", toolCalls: { total: 10, errors: 2 } },
  ];

  const timeline: TimelineEvent[] = [
    { messageIdx: 0, type: "phase_start", label: "Setup", severity: "ok" },
    { messageIdx: 6, type: "error", label: "test_failure", severity: "warn" },
    { messageIdx: 11, type: "phase_start", label: "Core work", severity: "warn" },
    { messageIdx: 21, type: "error", label: "tool_error", severity: "warn" },
    { messageIdx: 31, type: "phase_start", label: "Fixes", severity: "danger" },
    { messageIdx: 31, type: "complaint", label: "不对", severity: "danger" },
  ];

  const deviations: DeviationPoint[] = [];
  const rootCauses: RootCause[] = [
    {
      title: "Multiple error recovery cycles",
      description: "Agent made errors that required multi-step recovery",
      evidenceIndices: [6, 21, 31],
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
    analysisMode: "llm",
    timeline,
    causalGraph: null,
    attribution: null,
    rulesApplied: [],
    ...overrides,
  };
}

// ══════════════════════════════════════════════════════════════════
// 7.3: Recovery Timeline Dashboard Rendering
// ══════════════════════════════════════════════════════════════════

describe("Recovery Timeline — Dashboard Rendering (Task 7.3)", () => {
  it("renders recovery timeline with effective arc", () => {
    const arc = makeRecoveryArc();
    const result = makeEvalResult({ recoveryArcs: [arc] });
    const html = generateDashboardHTML(result);

    // Section header
    expect(html).toContain("Recovery Timeline");
    expect(html).toContain("恢复时间线");

    // Error → Detection → Correction step labels
    expect(html).toContain("Step 5");
    expect(html).toContain("Step 6");
    expect(html).toContain("Step 8");

    // detectionType label
    expect(html).toContain("测试失败");

    // Agent names
    expect(html).toContain("write_file");
    expect(html).toContain("edit");

    // rootCauseHypothesis
    expect(html).toContain("根因假说");
    expect(html).toContain("Agent wrote CSS before understanding the design system layout");

    // Effective icon
    expect(html).toContain("✅");

    // steps to recover
    expect(html).toContain("3 steps");
  });

  it("renders misdiagnosis count badge", () => {
    const arc = makeMisdiagnosisArc();
    const result = makeEvalResult({ recoveryArcs: [arc] });
    const html = generateDashboardHTML(result);

    expect(html).toContain("2 次误判");
    expect(html).toContain("5 steps");
  });

  it("renders ineffective arc with warning icon", () => {
    const arc = makeIneffectiveArc();
    const result = makeEvalResult({ recoveryArcs: [arc] });
    const html = generateDashboardHTML(result);

    expect(html).toContain("⚠️");
    expect(html).toContain("用户反馈");
    expect(html).toContain("1 次误判");
  });

  it("renders self_correction detection type label", () => {
    const arc = makeSelfCorrectionArc();
    const result = makeEvalResult({ recoveryArcs: [arc] });
    const html = generateDashboardHTML(result);

    expect(html).toContain("Agent 自纠");
    expect(html).toContain("1 steps");
  });

  it("renders multiple recovery arcs", () => {
    const arcs = [makeRecoveryArc(), makeSelfCorrectionArc(), makeMisdiagnosisArc()];
    const result = makeEvalResult({ recoveryArcs: arcs });
    const html = generateDashboardHTML(result);

    // All three rootCauseHypotheses present
    expect(html).toContain("Agent wrote CSS before understanding");
    expect(html).toContain("Agent used a hash with low anchoring quality");
    expect(html).toContain("Agent did not verify the command syntax");
  });

  it("does NOT render recovery section when recoveryArcs is undefined", () => {
    const result = makeEvalResult({ recoveryArcs: undefined });
    const html = generateDashboardHTML(result);

    expect(html).not.toContain("Recovery Timeline");
    expect(html).not.toContain("恢复时间线");
  });

  it("does NOT render recovery section when recoveryArcs is empty", () => {
    const result = makeEvalResult({ recoveryArcs: [] });
    const html = generateDashboardHTML(result);

    expect(html).not.toContain("Recovery Timeline");
    expect(html).not.toContain("恢复时间线");
  });

  it("uses correct color: effective=green #3fb950", () => {
    const arc = makeRecoveryArc({ effective: true });
    const result = makeEvalResult({ recoveryArcs: [arc] });
    const html = generateDashboardHTML(result);

    // The effective step background should use COLORS.ok = #3fb950
    // For effective=true, the correction step pill uses effectiveColor=COLORS.ok
    expect(html).toContain("#3fb950");
  });

  it("renders rootCauseHypothesis as a callout with 💡 icon", () => {
    const arc = makeRecoveryArc();
    const result = makeEvalResult({ recoveryArcs: [arc] });
    const html = generateDashboardHTML(result);

    expect(html).toContain("💡");
    expect(html).toContain("根因假说:");
  });

  it("escapes HTML in recovery arc fields", () => {
    const arc = makeRecoveryArc({
      errorSummary: "Used <div> instead of <section>",
      rootCauseHypothesis: "Agent didn't check <template> vs <component> structure",
    });
    const result = makeEvalResult({ recoveryArcs: [arc] });
    const html = generateDashboardHTML(result);

    // Should contain escaped versions
    expect(html).toContain("&lt;div&gt;");
    expect(html).toContain("&lt;template&gt;");
    // Should NOT contain raw HTML tags
    expect(html).not.toContain("Used <div> instead");
  });
});

// ══════════════════════════════════════════════════════════════════
// 7.4: Step 7 Receives Recovery Arcs
// ══════════════════════════════════════════════════════════════════

describe("Step 7 Prompt — Recovery Arc Integration (Task 7.4)", () => {
  it("includes RECOVERY ARCS section when recoveryArcs provided", () => {
    const arcs = [makeRecoveryArc(), makeMisdiagnosisArc()];
    const prompt = buildStep7Prompt(
      null, // graphSnapshot
      { mistakeAgent: "write_file", mistakeStep: 5, reason: "Wrote wrong CSS class", rulesApplied: ["R_CHECK_BEFORE_WRITE"] },
      "Candidate set summary here",
      "Session fragments here",
      "Config excerpts here",
      "Stats summary here",
      arcs,
    );

    expect(prompt).toContain("RECOVERY ARCS:");
    expect(prompt).toContain("error=write_file@Step5");
    expect(prompt).toContain("detected by test_failure@Step6");
    expect(prompt).toContain("corrected by edit@Step8");
    expect(prompt).toContain("effective=true");
    expect(prompt).toContain("misdiagnosis=0");
    expect(prompt).toContain("Root cause hypothesis:");

    // Second arc
    expect(prompt).toContain("error=bash@Step20");
    expect(prompt).toContain("misdiagnosis=2");

    // Includes guidance for LLM on how to use recovery arcs
    expect(prompt).toContain("misdiagnosisCount >= 2 with test_failure");
    expect(prompt).toContain("detectionType === \"user_complaint\"");
    expect(prompt).toContain("rootCauseHypothesis mentions \"didn't read\"");
  });

  it("omits RECOVERY ARCS when recoveryArcs is undefined", () => {
    const prompt = buildStep7Prompt(
      null,
      { mistakeAgent: "write_file", mistakeStep: 5, reason: "Wrote wrong CSS class", rulesApplied: [] },
      "Candidate set summary",
      "Session fragments",
      "Config excerpts",
      "Stats summary",
      undefined,
    );

    expect(prompt).not.toContain("RECOVERY ARCS:");
  });

  it("omits RECOVERY ARCS when recoveryArcs is empty array", () => {
    const prompt = buildStep7Prompt(
      null,
      { mistakeAgent: "write_file", mistakeStep: 5, reason: "Wrote wrong CSS class", rulesApplied: [] },
      "Candidate set summary",
      "Session fragments",
      "Config excerpts",
      "Stats summary",
      [],
    );

    expect(prompt).not.toContain("RECOVERY ARCS:");
  });

  it("includes recovery-informed rule suggestions in instructions", () => {
    const arcs = [makeMisdiagnosisArc()];
    const prompt = buildStep7Prompt(
      null,
      { mistakeAgent: "bash", mistakeStep: 20, reason: "Wrong test command", rulesApplied: [] },
      "Candidate set summary",
      "Session fragments",
      "Config excerpts",
      "Stats summary",
      arcs,
    );

    // The prompt should include the recovery-pattern-to-rule mapping
    expect(prompt).toContain("diagnostic workflow rule");
    expect(prompt).toContain("perception/taste self-check rule");
    expect(prompt).toContain("read-before-write rule");
  });
});
