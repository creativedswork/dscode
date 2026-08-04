import { describe, expect, it } from "vitest";

import type { MultiAgentTrajectory } from "../../src/eval/trajectory.js";
import {
  validateChiefAttribution,
  validateChiefBacktrack,
  validateChiefGraph,
  validateChiefOracles,
} from "../../src/eval/chief/validation.js";
import type { ChiefGraph } from "../../src/eval/chief/types.js";
import { validateApplicationRuleOutputs } from "../../src/eval/rules/extraction.js";

function trajectory(): MultiAgentTrajectory {
  const actors: MultiAgentTrajectory["actors"] = [
    {
      agentId: "main-planner",
      application: "main",
      role: "main",
      evidenceQuality: "full",
    },
    {
      agentId: "executor-1",
      parentAgentId: "main-planner",
      application: "executor",
      role: "subagent",
      evidenceQuality: "full",
      state: "completed",
    },
    {
      agentId: "reviewer-summary",
      parentAgentId: "main-planner",
      application: "reviewer",
      role: "subagent",
      evidenceQuality: "summary",
      state: "completed",
    },
  ];
  return {
    session: {
      version: 3,
      metadata: {
        id: "session-1",
        title: "Validate",
        createdAt: 1,
        updatedAt: 10,
        modelProvider: "test",
        modelId: "model",
        messageCount: 4,
        projectPath: "/project",
        preview: "",
        hasImages: false,
        imageCount: 0,
        totalActiveMs: 0,
        contentHash: "hash",
      },
      messages: [],
      agentMessages: [],
    },
    actors,
    steps: [
      {
        stepId: 0,
        agentId: "main-planner",
        application: "main",
        role: "main",
        kind: "spawn",
        toolName: "spawn_agent",
        observation: "",
        thought: "delegate",
        action: "spawn executor",
        result: "executor-1",
        timestamp: 1,
        localOrder: 0,
        isError: false,
        evidenceQuality: "full",
      },
      {
        stepId: 1,
        agentId: "executor-1",
        application: "executor",
        role: "subagent",
        parentAgentId: "main-planner",
        kind: "tool_call",
        toolName: "write_file",
        observation: "bad plan",
        thought: "apply",
        action: "write_file",
        result: "contaminated output",
        timestamp: 2,
        localOrder: 0,
        isError: false,
        evidenceQuality: "full",
      },
      {
        stepId: 2,
        agentId: "main-planner",
        application: "main",
        role: "main",
        kind: "response",
        observation: "executor result",
        thought: "accept",
        action: "respond",
        result: "incorrect answer",
        timestamp: 3,
        localOrder: 1,
        isError: false,
        evidenceQuality: "full",
      },
      {
        stepId: 3,
        agentId: "reviewer-summary",
        application: "reviewer",
        role: "subagent",
        parentAgentId: "main-planner",
        kind: "summary",
        observation: "",
        thought: "",
        action: "review summary",
        result: "found issue",
        timestamp: 4,
        localOrder: 0,
        isError: false,
        evidenceQuality: "summary",
      },
    ],
    controlEdges: [],
    dataEdges: [],
    evidence: {
      totalActors: 3,
      subagentCount: 2,
      fullTranscripts: 1,
      summaryTranscripts: 1,
      missingTranscripts: 0,
      completeness: "partial",
      affectedAgentIds: ["reviewer-summary"],
    },
  };
}

function graph(): ChiefGraph {
  return {
    subtasks: [{
      id: "implementation",
      name: "Implement",
      stepIds: [0, 1, 2, 3],
      status: "danger",
      summary: "Executor polluted the final answer",
    }],
    agents: [
      {
        subtaskId: "implementation",
        agentId: "main-planner",
        application: "main",
        role: "main",
        stepIds: [0, 2],
        observation: "result",
        thought: "plan and accept",
        action: "spawn_agent and respond",
        result: "incorrect answer",
      },
      {
        subtaskId: "implementation",
        agentId: "executor-1",
        application: "executor",
        role: "subagent",
        stepIds: [1],
        observation: "bad plan",
        thought: "apply",
        action: "write_file",
        result: "contaminated output",
      },
      {
        subtaskId: "implementation",
        agentId: "reviewer-summary",
        application: "reviewer",
        role: "subagent",
        stepIds: [3],
        observation: "",
        thought: "",
        action: "review summary",
        result: "found issue",
      },
    ],
    edges: [
      {
        source: "main-planner",
        target: "executor-1",
        type: "planning",
        strength: 0.9,
        evidenceStepIds: [0, 1],
        summary: "planner delegates",
      },
      {
        source: "executor-1",
        target: "main-planner",
        type: "data",
        strength: 1,
        evidenceStepIds: [1, 2],
        summary: "bad output consumed",
      },
    ],
    dataFlows: [{
      sourceStepId: 1,
      targetStepId: 2,
      sourceAgentId: "executor-1",
      targetAgentId: "main-planner",
      dataItem: "contaminated output",
      correctness: "misused",
    }],
  };
}

describe("CHIEF stage validation", () => {
  it("accepts real planner/executor identities, tool actions, and cross-Agent data flow", () => {
    const result = validateChiefGraph(graph(), trajectory());

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.agents[1]).toMatchObject({
        agentId: "executor-1",
        application: "executor",
        action: "write_file",
      });
      expect(result.value.dataFlows[0]).toMatchObject({
        sourceAgentId: "executor-1",
        targetAgentId: "main-planner",
      });
    }
  });

  it("rejects an unknown Agent or a Step owned by another Agent", () => {
    const invalid = graph();
    invalid.agents[1] = {
      ...invalid.agents[1],
      agentId: "read_file",
      application: "read_file",
    };

    const result = validateChiefGraph(invalid, trajectory());

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(" ")).toContain("invalid identity");
  });

  it("requires exactly one Virtual Oracle per subtask", () => {
    expect(validateChiefOracles([], graph())).toMatchObject({
      ok: false,
      errors: ["Missing Oracle for subtask implementation"],
    });
    expect(validateChiefOracles([{
      subtaskId: "implementation",
      goal: "Produce a correct implementation",
      preconditions: ["Use validated input"],
      keyEvidence: ["Test output"],
      acceptanceCriteria: ["Tests pass"],
    }], graph()).ok).toBe(true);
  });

  it("rejects unknown hierarchical backtracking candidates", () => {
    const result = validateChiefBacktrack({
      subtaskCandidates: [{ id: "implementation", score: 1, reason: "failed" }],
      agentCandidates: [{ id: "unknown", score: 1, reason: "failed" }],
      stepCandidates: [],
      screenedSubtasks: ["implementation"],
      screenedAgentIds: ["unknown"],
      screenedStepIds: [],
    }, trajectory(), graph());

    expect(result.ok).toBe(false);
  });

  it("allows full transcript Step attribution and cross-Agent recovery", () => {
    const result = validateChiefAttribution({
      mistakeAgentId: "executor-1",
      mistakeApplication: "executor",
      mistakeSubtaskId: "implementation",
      mistakeStep: 1,
      granularity: "step",
      confidence: 0.9,
      evidenceQuality: "full",
      reason: "Executor introduced contaminated output",
      rootCauseTitle: "Contaminated executor output",
      rootCauseSeverity: "primary",
      rulesApplied: ["local", "data_flow", "deviation_irrecoverability"],
      recoveryArcs: [{
        errorAgentId: "executor-1",
        errorApplication: "executor",
        errorStepId: 1,
        detectionAgentId: "main-planner",
        detectionApplication: "main",
        detectionStepId: 2,
        correctionAgentId: "reviewer-summary",
        correctionApplication: "reviewer",
        correctionStepId: 3,
        detectionType: "agent_review",
        errorSummary: "Bad output",
        correctionSummary: "Reviewer identified it",
        effective: true,
        stepsToRecover: 99,
        misdiagnosisCount: 0,
        rootCauseHypothesis: "Unvalidated executor result",
      }],
    }, trajectory(), graph());

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toMatchObject({
        mistakeAgentId: "executor-1",
        mistakeApplication: "executor",
        mistakeStep: 1,
        granularity: "step",
      });
      expect(result.value.recoveryArcs[0]).toMatchObject({
        crossAgent: true,
        errorAgentId: "executor-1",
        correctionAgentId: "reviewer-summary",
        stepsToRecover: 2,
      });
      expect(result.value.recoveryDiagnostics?.[0]).toContain(
        "normalized stepsToRecover to 2",
      );
    }
  });

  it("forces summary-only attribution to Agent granularity with nullable Step", () => {
    const base = {
      mistakeAgentId: "reviewer-summary",
      mistakeApplication: "reviewer",
      mistakeSubtaskId: "implementation",
      granularity: "agent",
      confidence: 0.5,
      evidenceQuality: "summary",
      reason: "Only the terminal summary is available",
      rootCauseTitle: "Reviewer summary issue",
      rootCauseSeverity: "secondary",
      rulesApplied: ["local"],
      recoveryArcs: [],
    };

    expect(validateChiefAttribution({
      ...base,
      mistakeStep: 3,
      granularity: "step",
    }, trajectory(), graph()).ok).toBe(false);
    const result = validateChiefAttribution({
      ...base,
      mistakeStep: null,
    }, trajectory(), graph());
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.mistakeStep).toBeNull();
  });

  it("validates Application-specific Harness Rule targets", () => {
    const rule = {
      id: "executor-validation",
      category: "agents_md",
      targetLayer: "Agent Application",
      targetScope: "application",
      targetApplication: "executor",
      abstract: "Validate delegated output",
      rawDescription: "Executor output propagated without validation",
      severity: 0.8,
      suggestion: {
        layer: "executor Application",
        action: "modify",
        proposed: "Require output validation before returning",
        rationale: "Prevents invalid results from propagating",
      },
    };

    expect(validateApplicationRuleOutputs([rule], trajectory()).ok).toBe(true);
    const invalid = validateApplicationRuleOutputs([{
      ...rule,
      targetApplication: "invented-agent-config",
    }], trajectory());
    expect(invalid.ok).toBe(false);
    if (!invalid.ok) {
      expect(invalid.errors).toContain("Unknown target Application: invented-agent-config");
    }
  });
});
