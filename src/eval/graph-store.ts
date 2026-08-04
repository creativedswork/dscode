// ── Causal Graph Store ──
// Deterministic graph storage and query — all operations are pure TypeScript, no LLM.
// Used by the CHIEF analysis pipeline: Step 1-4 populate, Step 5-6 query.

import type {
  Subtask,
  SubtaskEdge,
  AgentNode,
  AgentEdge,
  StepDataFlow,
  CausalGraphSnapshot,
  SubtaskSummary,
  EdgeSummary,
  AgentSummary,
  DataFlowSummary,
} from "./schemas.js";

export class CausalGraphStore {
  private subtasks = new Map<string, Subtask>();
  private agentNodes: AgentNode[] = [];
  private subtaskEdges: SubtaskEdge[] = [];
  private agentEdges: AgentEdge[] = [];
  private stepFlows: StepDataFlow[] = [];
  private totalSteps = 0;

  // ── Write Methods ──

  setTotalSteps(n: number): void {
    this.totalSteps = n;
  }

  addSubtasks(subtasks: Subtask[]): void {
    for (const s of subtasks) {
      if (!s.id) continue;
      this.subtasks.set(s.id, s);
    }
  }

  addSubtaskEdges(edges: SubtaskEdge[]): void {
    for (const e of edges) {
      if (!e.src || !e.dst) continue;
      // Deduplicate by src-dst pair
      const exists = this.subtaskEdges.some((ex) => ex.src === e.src && ex.dst === e.dst);
      if (!exists) {
        this.subtaskEdges.push(e);
      }
    }
  }

  addAgentNodes(nodes: AgentNode[]): void {
    for (const n of nodes) {
      if (!n.subtaskId || !n.agent) continue;
      this.agentNodes.push(n);
    }
  }

  addAgentEdges(edges: AgentEdge[]): void {
    for (const e of edges) {
      if (!e.subtaskId || !e.srcAgent || !e.dstAgent) continue;
      const exists = this.agentEdges.some(
        (ex) => ex.subtaskId === e.subtaskId && ex.srcAgent === e.srcAgent && ex.dstAgent === e.dstAgent,
      );
      if (!exists) {
        this.agentEdges.push(e);
      }
    }
  }

  addStepDataFlows(flows: StepDataFlow[]): void {
    for (const f of flows) {
      if (!f.subtaskId || f.fromStep == null || f.toStep == null) continue;
      this.stepFlows.push(f);
    }
  }

  // ── Validation ──

  validateCoverage(): string[] {
    const errors: string[] = [];
    if (this.totalSteps === 0) {
      errors.push("totalSteps not set — call setTotalSteps() before validating");
      return errors;
    }

    const subtaskList = this.getSubtasksSorted();
    if (subtaskList.length === 0) {
      errors.push("No subtasks defined");
      return errors;
    }

    // Check each step from 0 to totalSteps-1 is covered exactly once
    const covered = new Set<number>();
    for (const s of subtaskList) {
      for (let i = s.stepStart; i <= s.stepEnd; i++) {
        if (covered.has(i)) {
          errors.push(`Step ${i} is covered by multiple subtasks (overlap at "${s.id}" range ${s.stepStart}-${s.stepEnd})`);
        }
        covered.add(i);
      }
    }

    // Check for gaps
    for (let i = 0; i < this.totalSteps; i++) {
      if (!covered.has(i)) {
        errors.push(`Step ${i} is not covered by any subtask`);
      }
    }

    // Check step ranges are contiguous and end >= start
    for (const s of subtaskList) {
      if (s.stepStart > s.stepEnd) {
        errors.push(`Subtask ${s.id}: stepStart (${s.stepStart}) > stepEnd (${s.stepEnd})`);
      }
    }

    return errors;
  }

  isGraphComplete(): boolean {
    // Coverage validation must pass
    if (this.validateCoverage().length > 0) return false;

    const subtaskList = this.getSubtasksSorted();

    // Every subtask must have at least one agent node
    for (const s of subtaskList) {
      const hasAgent = this.agentNodes.some((n) => n.subtaskId === s.id);
      if (!hasAgent) return false;
    }

    // Every adjacent subtask pair must have an edge
    for (let i = 0; i < subtaskList.length - 1; i++) {
      const src = subtaskList[i].id;
      const dst = subtaskList[i + 1].id;
      const hasEdge = this.subtaskEdges.some((e) => e.src === src && e.dst === dst);
      if (!hasEdge) return false;
    }

    return true;
  }

  // ── Query Methods ──

  getSubtasksSorted(): Subtask[] {
    // Sort by stepStart
    return [...this.subtasks.values()].sort((a, b) => a.stepStart - b.stepStart);
  }

  getTopoOrder(): string[] {
    const sorted = this.getSubtasksSorted();
    return sorted.map((s) => s.id);
  }

  getPredecessors(stepId: number): number[] {
    const preds = new Set<number>();
    // Find step flows where this step is the consumer
    for (const flow of this.stepFlows) {
      if (flow.toStep === stepId) {
        preds.add(flow.fromStep);
      }
    }
    // Also check subtask edges for inter-subtask data transfer
    const subtaskId = this.getSubtaskOfStep(stepId);
    if (subtaskId) {
      for (const edge of this.subtaskEdges) {
        if (edge.dst === subtaskId) {
          for (const dt of edge.dataTransfer) {
            for (const ps of dt.producerSteps) {
              preds.add(ps);
            }
          }
        }
      }
    }
    return [...preds].sort((a, b) => a - b);
  }

  getLoopGroups(): Map<string, number[]> {
    const groups = new Map<string, number[]>();
    for (const s of this.subtasks.values()) {
      if (s.loopInfo.isLoopRelated && s.loopInfo.loopGroupId) {
        const gid = s.loopInfo.loopGroupId;
        if (!groups.has(gid)) groups.set(gid, []);
        const steps: number[] = [];
        for (let i = s.stepStart; i <= s.stepEnd; i++) {
          steps.push(i);
        }
        groups.get(gid)!.push(...steps);
      }
    }
    // Sort each group
    for (const [gid, steps] of groups) {
      groups.set(gid, steps.sort((a, b) => a - b));
    }
    return groups;
  }

  getDataflowPath(dataItem: string): StepDataFlow[] {
    return this.stepFlows.filter((f) => f.dataItem === dataItem);
  }

  getSubtaskOfStep(stepId: number): string | null {
    for (const s of this.subtasks.values()) {
      if (stepId >= s.stepStart && stepId <= s.stepEnd) return s.id;
    }
    return null;
  }

  getSubtasks(): Subtask[] {
    return this.getSubtasksSorted();
  }

  getAgentNodes(): AgentNode[] {
    return [...this.agentNodes];
  }

  getSubtaskEdges(): SubtaskEdge[] {
    return [...this.subtaskEdges];
  }

  getAgentEdges(): AgentEdge[] {
    return [...this.agentEdges];
  }

  getStepDataFlows(): StepDataFlow[] {
    return [...this.stepFlows];
  }

  // ── Snapshot (for LLM prompt injection) ──

  snapshot(): CausalGraphSnapshot {
    const subtaskList = this.getSubtasksSorted();

    const subtaskSummaries: SubtaskSummary[] = subtaskList.map((s) => {
      const agents = this.agentNodes.filter((n) => n.subtaskId === s.id);
      const hasErrors = agents.some((a) => {
        const stepIds = a.stepIds;
        return this.stepFlows.some(
          (f) => stepIds.includes(f.fromStep) && f.correctness !== "correct",
        );
      });
      return {
        id: s.id,
        name: s.name,
        stepRange: `${s.stepStart}-${s.stepEnd}`,
        oracleGoal: s.oracle.goal,
        loopSummary: s.loopInfo.isLoopRelated
          ? `${s.loopInfo.loopRole} loop (${s.loopInfo.reversibility}, risk=${s.loopInfo.loopRiskScore})`
          : "no loop",
        agentCount: agents.length,
        keyActions: agents.map((a) => `${a.agent}: ${a.otar.action.slice(0, 80)}`),
        hasErrors,
        status: hasErrors ? "danger" : "ok",
      };
    });

    const subtaskEdgeSummaries: EdgeSummary[] = this.subtaskEdges.map((e) => ({
      src: e.src,
      dst: e.dst,
      type: e.type,
      strength: e.strength,
      keyDataTransfers: e.dataTransfer.map((dt) => `${dt.dataItem} (${dt.correctness})`),
      failureModeSummary: e.failureModes.map((fm) => fm.type).join(", "),
    }));

    const agentSummaries: AgentSummary[] = this.agentNodes.map((n) => ({
      subtaskId: n.subtaskId,
      agent: n.agent,
      keyAction: n.otar.action.slice(0, 120),
      stepIds: n.stepIds,
    }));

    const agentEdgeSummaries: EdgeSummary[] = this.agentEdges.map((e) => ({
      src: `${e.subtaskId}/${e.srcAgent}`,
      dst: `${e.subtaskId}/${e.dstAgent}`,
      type: e.depType,
      strength: e.strength,
      keyDataTransfers: [],
      failureModeSummary: e.failureModes.map((fm) => fm.type).join(", "),
    }));

    // Build data flow paths
    const dataFlowMap = new Map<string, StepDataFlow[]>();
    for (const f of this.stepFlows) {
      if (!dataFlowMap.has(f.dataItem)) dataFlowMap.set(f.dataItem, []);
      dataFlowMap.get(f.dataItem)!.push(f);
    }
    const dataFlows: DataFlowSummary[] = [...dataFlowMap.entries()].map(([item, flows]) => {
      const sorted = flows.sort((a, b) => a.fromStep - b.fromStep);
      const path = sorted
        .map((f) => `step${f.fromStep}(${f.sourceAgent}) → step${f.toStep}(${f.targetAgent})`)
        .join(" → ");
      const correctnesses = sorted.map((f) => f.correctness);
      const overallCorrectness = correctnesses.every((c) => c === "correct")
        ? "correct"
        : correctnesses.includes("fabricated")
          ? "fabricated"
          : correctnesses.includes("misused")
            ? "misused"
            : "misinterpreted";
      return { dataItem: item, path, correctness: overallCorrectness };
    });

    return {
      subtasks: subtaskSummaries,
      subtaskEdges: subtaskEdgeSummaries,
      agentSummaries,
      agentEdges: agentEdgeSummaries,
      dataFlows,
      totalSteps: this.totalSteps,
    };
  }

  clear(): void {
    this.subtasks.clear();
    this.agentNodes = [];
    this.subtaskEdges = [];
    this.agentEdges = [];
    this.stepFlows = [];
    this.totalSteps = 0;
  }
}
