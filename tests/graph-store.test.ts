// ── Causal Graph Store Unit Tests ──

import { describe, it, expect } from "vitest";
import { CausalGraphStore } from "../src/eval/graph-store.js";
import type { Subtask, SubtaskEdge, AgentNode, StepDataFlow } from "../src/eval/schemas.js";

function makeSubtask(id: string, stepStart: number, stepEnd: number, name = `Task ${id}`): Subtask {
  return {
    id, name, stepStart, stepEnd,
    oracle: { goal: "test goal", preconditions: [], keyEvidence: [], acceptanceCriteria: [] },
    loopInfo: { isLoopRelated: false, loopRole: "none", loopGroupId: null, reversibility: "reversible", loopRiskScore: 0 },
  };
}

function makeAgent(subtaskId: string, agent: string, stepId: number): AgentNode {
  return {
    subtaskId, agent,
    otar: { observation: "obs", thought: "think", action: `${agent}(...)`, result: "result" },
    stepIds: [stepId],
  };
}

function makeEdge(src: string, dst: string): SubtaskEdge {
  return { src, dst, type: "data_dependency", strength: 0.8, explanation: "", dataTransfer: [], failureModes: [] };
}

describe("CausalGraphStore", () => {
  describe("validateCoverage", () => {
    it("passes with complete non-overlapping coverage", () => {
      const store = new CausalGraphStore();
      store.setTotalSteps(10);
      store.addSubtasks([makeSubtask("S1", 0, 3), makeSubtask("S2", 4, 6), makeSubtask("S3", 7, 9)]);
      expect(store.validateCoverage()).toEqual([]);
    });

    it("detects gaps", () => {
      const store = new CausalGraphStore();
      store.setTotalSteps(10);
      store.addSubtasks([makeSubtask("S1", 0, 3), makeSubtask("S2", 6, 9)]);
      const errors = store.validateCoverage();
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.includes("4"))).toBe(true);
      expect(errors.some((e) => e.includes("5"))).toBe(true);
    });

    it("detects overlaps", () => {
      const store = new CausalGraphStore();
      store.setTotalSteps(10);
      store.addSubtasks([makeSubtask("S1", 0, 4), makeSubtask("S2", 3, 9)]);
      const errors = store.validateCoverage();
      expect(errors.some((e) => e.includes("overlap"))).toBe(true);
    });

    it("detects coverage not reaching end", () => {
      const store = new CausalGraphStore();
      store.setTotalSteps(10);
      store.addSubtasks([makeSubtask("S1", 0, 5)]);
      const errors = store.validateCoverage();
      expect(errors.some((e) => e.includes("6"))).toBe(true);
    });
  });

  describe("isGraphComplete", () => {
    it("returns true when all conditions met", () => {
      const store = new CausalGraphStore();
      store.setTotalSteps(5);
      store.addSubtasks([makeSubtask("S1", 0, 2), makeSubtask("S2", 3, 4)]);
      store.addAgentNodes([makeAgent("S1", "read_file", 1), makeAgent("S2", "write_file", 3)]);
      store.addSubtaskEdges([makeEdge("S1", "S2")]);
      expect(store.isGraphComplete()).toBe(true);
    });

    it("returns false when coverage fails", () => {
      const store = new CausalGraphStore();
      store.setTotalSteps(5);
      store.addSubtasks([makeSubtask("S1", 0, 1)]);
      store.addAgentNodes([makeAgent("S1", "read_file", 1)]);
      expect(store.isGraphComplete()).toBe(false);
    });

    it("returns false when subtask has no agent", () => {
      const store = new CausalGraphStore();
      store.setTotalSteps(3);
      store.addSubtasks([makeSubtask("S1", 0, 1), makeSubtask("S2", 2, 2)]);
      store.addAgentNodes([makeAgent("S1", "read_file", 1)]);
      // S2 has no agent
      expect(store.isGraphComplete()).toBe(false);
    });

    it("returns false when adjacent pair has no edge", () => {
      const store = new CausalGraphStore();
      store.setTotalSteps(5);
      store.addSubtasks([makeSubtask("S1", 0, 2), makeSubtask("S2", 3, 4)]);
      store.addAgentNodes([makeAgent("S1", "read_file", 1), makeAgent("S2", "write_file", 3)]);
      // Missing S1→S2 edge
      expect(store.isGraphComplete()).toBe(false);
    });
  });

  describe("query methods", () => {
    it("getPredecessors returns data flow predecessors", () => {
      const store = new CausalGraphStore();
      store.addStepDataFlows([
        { subtaskId: "S1", fromStep: 3, toStep: 7, sourceAgent: "read", targetAgent: "write", dataItem: "file.ts", dataType: "text", transformation: "none", correctness: "correct", confidence: 0.9 },
        { subtaskId: "S1", fromStep: 5, toStep: 7, sourceAgent: "grep", targetAgent: "write", dataItem: "config.json", dataType: "text", transformation: "none", correctness: "misinterpreted", confidence: 0.7 },
      ]);
      const preds = store.getPredecessors(7);
      expect(preds).toContain(3);
      expect(preds).toContain(5);
    });

    it("getLoopGroups returns grouped steps", () => {
      const store = new CausalGraphStore();
      store.addSubtasks([
        { ...makeSubtask("S1", 0, 2), loopInfo: { isLoopRelated: true, loopRole: "entry", loopGroupId: "L1", reversibility: "reversible" as const, loopRiskScore: 0.3 } },
        { ...makeSubtask("S2", 3, 5), loopInfo: { isLoopRelated: true, loopRole: "exit", loopGroupId: "L1", reversibility: "irreversible" as const, loopRiskScore: 0.8 } },
      ]);
      const groups = store.getLoopGroups();
      expect(groups.has("L1")).toBe(true);
      const steps = groups.get("L1")!;
      expect(steps).toContain(0);
      expect(steps).toContain(5);
    });

    it("getDataflowPath returns matching flows", () => {
      const store = new CausalGraphStore();
      store.addStepDataFlows([
        { subtaskId: "S1", fromStep: 1, toStep: 3, sourceAgent: "read", targetAgent: "edit", dataItem: "src/foo.ts", dataType: "text", transformation: "read", correctness: "correct", confidence: 1.0 },
        { subtaskId: "S2", fromStep: 5, toStep: 8, sourceAgent: "read", targetAgent: "write", dataItem: "src/bar.ts", dataType: "text", transformation: "write", correctness: "misused", confidence: 0.5 },
      ]);
      const path = store.getDataflowPath("src/foo.ts");
      expect(path).toHaveLength(1);
      expect(path[0].dataItem).toBe("src/foo.ts");
    });

    it("getSubtaskOfStep resolves correctly", () => {
      const store = new CausalGraphStore();
      store.addSubtasks([makeSubtask("S1", 0, 3), makeSubtask("S2", 4, 7)]);
      expect(store.getSubtaskOfStep(2)).toBe("S1");
      expect(store.getSubtaskOfStep(6)).toBe("S2");
      expect(store.getSubtaskOfStep(99)).toBeNull();
    });
  });

  describe("snapshot", () => {
    it("generates a valid snapshot", () => {
      const store = new CausalGraphStore();
      store.setTotalSteps(5);
      store.addSubtasks([makeSubtask("S1", 0, 2), makeSubtask("S2", 3, 4)]);
      store.addAgentNodes([makeAgent("S1", "read_file", 1), makeAgent("S2", "write_file", 3)]);
      store.addSubtaskEdges([makeEdge("S1", "S2")]);
      store.addStepDataFlows([
        { subtaskId: "S1", fromStep: 1, toStep: 3, sourceAgent: "read_file", targetAgent: "write_file", dataItem: "src/app.ts", dataType: "text", transformation: "modified", correctness: "misinterpreted", confidence: 0.6 },
      ]);

      const snap = store.snapshot();
      expect(snap.subtasks).toHaveLength(2);
      expect(snap.subtaskEdges).toHaveLength(1);
      expect(snap.agentSummaries).toHaveLength(2);
      expect(snap.dataFlows).toHaveLength(1);
      expect(snap.totalSteps).toBe(5);
      expect(snap.dataFlows[0].dataItem).toBe("src/app.ts");
    });
  });
});
