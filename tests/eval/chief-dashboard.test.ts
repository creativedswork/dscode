import { describe, expect, it } from "vitest";

import { generateDashboardHTML } from "../../src/eval/dashboard.js";
import type { EvalResult } from "../../src/eval/types.js";

function result(): EvalResult {
  return {
    metadata: {
      sessionId: "session-dashboard",
      title: "Multi-Agent <script>alert(1)</script>",
      model: "test/model",
      totalMessages: 4,
      duration: "1m",
      projectPath: "/project",
      startedAt: "start",
      endedAt: "end",
    },
    stats: {
      toolCalls: 2,
      toolErrors: 0,
      errorRate: "0.0%",
      screenshotsTaken: 0,
      userComplaints: 0,
    },
    agentStats: {
      totalActors: 4,
      subagents: 3,
      applications: 3,
      completed: 2,
      failed: 0,
      terminated: 0,
      killed: 0,
      processSuccessRate: "100.0%",
      fullTranscripts: 2,
      summaryTranscripts: 1,
      missingTranscripts: 1,
    },
    phases: [{
      label: "Implement",
      startIdx: 0,
      endIdx: 3,
      status: "danger",
      summary: "Bad data propagated",
      toolCalls: { total: 2, errors: 0 },
    }],
    deviations: [{
      messageIdx: 1,
      screenshotKeyword: "",
      targetKeyword: "",
      severity: "high",
      description: "Bad executor data",
    }],
    rootCauses: [{
      title: "Bad explorer output",
      description: "Explorer output contaminated Main",
      evidenceIndices: [1],
      severity: "primary",
    }],
    rules: [],
    timeline: [],
    causalGraph: {
      subtasks: [{
        id: "implement",
        name: "Implement",
        stepRange: "0-3",
        oracleGoal: "Correct result",
        loopSummary: "CHIEF hierarchical subtask",
        agentCount: 3,
        keyActions: ["write"],
        hasErrors: true,
        status: "danger",
      }],
      subtaskEdges: [],
      agentSummaries: [
        {
          subtaskId: "implement",
          agent: "<Explorer> (111111)",
          keyAction: "write_file",
          stepIds: [1],
        },
        {
          subtaskId: "implement",
          agent: "<Explorer> (222222)",
          keyAction: "read_file",
          stepIds: [2],
        },
      ],
      agentEdges: [{
        src: "<Explorer> (111111)",
        dst: "main (main00)",
        type: "data",
        strength: 1,
        keyDataTransfers: [],
        failureModeSummary: "contamination",
      }],
      dataFlows: [{
        dataItem: "<unsafe-data>",
        path: "step1(<Explorer>) -> step3(main)",
        correctness: "misused",
      }],
      totalSteps: 4,
    },
    attribution: {
      mistakeAgent: "<Explorer> (111111)",
      mistakeAgentId: "agent-111111-full",
      mistakeApplication: "<Explorer>",
      mistakeSubtaskId: "implement",
      mistakeStep: 1,
      granularity: "step",
      confidence: 0.88,
      evidenceQuality: "full",
      reason: "Introduced <unsafe-data>",
      rootCauseTitle: "Bad explorer output",
      rootCauseSeverity: "primary",
      rulesApplied: ["local", "data_flow"],
      recoveryArcs: [],
      screeningStages: {
        subtaskCandidates: [{ id: "implement", score: 1, reason: "failed" }],
        agentCandidates: [{
          id: "agent-111111-full",
          score: 0.9,
          reason: "introduced data",
        }],
        stepCandidates: [{ id: "1", score: 0.9, reason: "bad write" }],
        screenedSubtasks: ["implement", "review"],
        screenedAgentIds: [
          "main-000000-full",
          "agent-111111-full",
          "agent-222222-full",
        ],
        screenedStepIds: [0, 1, 2, 3],
      },
    },
    rulesApplied: ["local", "data_flow"],
    recoveryArcs: [],
    actors: [
      {
        agentId: "main-000000-full",
        application: "main",
        role: "main",
        evidenceQuality: "full",
        startedAt: 0,
        endedAt: 40,
      },
      {
        agentId: "agent-111111-full",
        parentAgentId: "main-000000-full",
        application: "<Explorer>",
        role: "subagent",
        evidenceQuality: "full",
        state: "completed",
        startedAt: 10,
        endedAt: 30,
      },
      {
        agentId: "agent-222222-full",
        parentAgentId: "main-000000-full",
        application: "<Explorer>",
        role: "subagent",
        evidenceQuality: "summary",
        state: "completed",
      },
      {
        agentId: "agent-333333-full",
        parentAgentId: "main-000000-full",
        application: "Reviewer",
        role: "subagent",
        evidenceQuality: "missing",
      },
    ],
    trajectoryEvidence: {
      totalActors: 4,
      subagentCount: 3,
      fullTranscripts: 2,
      summaryTranscripts: 1,
      missingTranscripts: 1,
      completeness: "partial",
      affectedAgentIds: ["agent-222222-full", "agent-333333-full"],
    },
    trajectory: {
      steps: [
        {
          stepId: 0,
          agentId: "main-000000-full",
          application: "main",
          role: "main",
          kind: "spawn",
          toolName: "spawn_agent",
          observation: "",
          thought: "",
          action: "spawn",
          result: "",
          timestamp: 0,
          localOrder: 0,
          isError: false,
          evidenceQuality: "full",
        },
        {
          stepId: 1,
          agentId: "agent-111111-full",
          application: "<Explorer>",
          role: "subagent",
          kind: "tool_call",
          toolName: "write_file",
          observation: "",
          thought: "",
          action: "write_file",
          result: "bad data",
          timestamp: 1,
          localOrder: 0,
          isError: false,
          evidenceQuality: "full",
        },
        {
          stepId: 2,
          agentId: "agent-222222-full",
          application: "<Explorer>",
          role: "subagent",
          kind: "summary",
          observation: "",
          thought: "",
          action: "summary",
          result: "summary",
          timestamp: 2,
          localOrder: 0,
          isError: false,
          evidenceQuality: "summary",
        },
        {
          stepId: 3,
          agentId: "main-000000-full",
          application: "main",
          role: "main",
          kind: "response",
          observation: "bad data",
          thought: "",
          action: "respond",
          result: "bad answer",
          timestamp: 3,
          localOrder: 1,
          isError: false,
          evidenceQuality: "full",
        },
      ],
      controlEdges: [{
        id: "spawn",
        type: "control",
        fromStep: 0,
        toStep: 1,
        fromAgentId: "main-000000-full",
        toAgentId: "agent-111111-full",
        label: "spawn",
        evidenceQuality: "full",
      }],
      dataEdges: [{
        id: "result",
        type: "result",
        fromStep: 1,
        toStep: 3,
        fromAgentId: "agent-111111-full",
        toAgentId: "main-000000-full",
        label: "<unsafe-data>",
        evidenceQuality: "full",
      }],
    },
  };
}

describe("CHIEF dashboard", () => {
  it("emits the shared light and dark theme contract", () => {
    const html = generateDashboardHTML(result());

    expect(html).toContain('data-dscode-theme-contract="1"');
    expect(html).toContain("@media (prefers-color-scheme: dark)");
    expect(html).toContain("--bg: #f8f7f5");
    expect(html).toContain("--bg: #1e1c19");
    expect(html).toContain("background: var(--bg)");
    expect(html).toContain("color: var(--text)");
    expect(html).toContain("background:var(--success)");
  });

  it("renders process lanes, short IDs, dependencies, evidence, and backtracking", () => {
    const html = generateDashboardHTML(result());

    expect(html).toContain("Agent Process Lanes");
    expect(html).toContain('data-agent-id="agent-111111-full"');
    expect(html).toContain('data-agent-id="agent-222222-full"');
    expect(html).toContain("(111111)");
    expect(html).toContain("(222222)");
    expect(html).toContain("Agent Nodes");
    expect(html).toContain("Cross-Agent Dependencies");
    expect(html).toContain('data-edge-type="control"');
    expect(html).toContain('data-edge-type="result"');
    expect(html).toContain("Transcript Evidence: partial");
    expect(html).toContain("2 full / 1 summary / 1 missing");
    expect(html).toContain("Hierarchical Backtracking");
    expect(html).toContain("1/2");
    expect(html).toContain("1/3");
    expect(html).toContain("Confidence 88%");
    expect(html).toContain("step granularity");
  });

  it("escapes Session, Application, data-flow, and attribution text", () => {
    const html = generateDashboardHTML(result());

    expect(html).toContain("&lt;Explorer&gt;");
    expect(html).toContain("&lt;unsafe-data&gt;");
    expect(html).toContain("Multi-Agent &lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).not.toContain("<Explorer>");
    expect(html).not.toContain("<unsafe-data>");
    expect(html).not.toContain("<script>alert(1)</script>");
  });

  it("renders a clear Main-only state", () => {
    const input = result();
    input.actors = [input.actors![0]];
    input.trajectory!.steps = input.trajectory!.steps.filter((step) => step.role === "main");
    input.trajectoryEvidence = {
      totalActors: 1,
      subagentCount: 0,
      fullTranscripts: 0,
      summaryTranscripts: 0,
      missingTranscripts: 0,
      completeness: "complete",
      affectedAgentIds: [],
    };

    const html = generateDashboardHTML(input);

    expect(html).toContain("Main-only trajectory: no task SubAgents were recorded.");
    expect(html).toContain("All indexed SubAgent transcripts are available.");
  });
});
