// ── Pass 2: ZOOM Agent ──
// Spawns Agent sessions for each attention zone to construct causal sub-graphs.
// Supports recursive splitting for zones >200 steps, with each sub-zone
// spawning its own Agent session.

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { EvalApplicationPort } from "../../application/harness-api.js";
import { safeJsonParse, type ValidationResult, type HistoryStep, type SubtaskEdge, type AgentNode, type AgentEdge, type StepDataFlow } from "../schemas.js";
import type { AttentionZone, ZoneAnalysis, ZoneSubtask, ZoneCandidate, SessionSkeleton } from "./types.js";
import type { ProgressDisplay } from "./progress.js";

// ── Constants ──

const MAX_ZONE_STEPS = 200;
const MAX_RECURSIVE_DEPTH = 3;

// ── Validation ──

export function validateZoneAnalysis(obj: unknown): ValidationResult<ZoneAnalysis> {
  if (typeof obj !== "object" || obj === null) return { ok: false, errors: ["Expected object"] };
  const o = obj as Record<string, unknown>;

  const zoneId = String(o["zoneId"] ?? "unknown");

  // Subtasks
  const subtasksRaw = Array.isArray(o["subtasks"]) ? o["subtasks"] : [];
  const subtasks: ZoneSubtask[] = subtasksRaw.map((s: unknown, i: number) => {
    const st = (s ?? {}) as Record<string, unknown>;
    return {
      id: String(st["id"] ?? `${zoneId}_S${i + 1}`),
      name: String(st["name"] ?? `Subtask ${i + 1}`),
      stepStart: Number(st["stepStart"] ?? 0),
      stepEnd: Number(st["stepEnd"] ?? 0),
      oracle: {
        goal: String((st["oracle"] as Record<string, unknown>)?.["goal"] ?? ""),
        preconditions: Array.isArray((st["oracle"] as Record<string, unknown>)?.["preconditions"]) ? ((st["oracle"] as Record<string, unknown>)["preconditions"] as string[]) : [],
        keyEvidence: Array.isArray((st["oracle"] as Record<string, unknown>)?.["keyEvidence"]) ? ((st["oracle"] as Record<string, unknown>)["keyEvidence"] as string[]) : [],
        acceptanceCriteria: Array.isArray((st["oracle"] as Record<string, unknown>)?.["acceptanceCriteria"]) ? ((st["oracle"] as Record<string, unknown>)["acceptanceCriteria"] as string[]) : [],
      },
      loopInfo: {
        isLoopRelated: Boolean((st["loopInfo"] as Record<string, unknown>)?.["isLoopRelated"]),
        loopRole: ((st["loopInfo"] as Record<string, unknown>)?.["loopRole"] as ZoneSubtask["loopInfo"]["loopRole"]) ?? "none",
        loopGroupId: String((st["loopInfo"] as Record<string, unknown>)?.["loopGroupId"] ?? "null") === "null" ? null : String((st["loopInfo"] as Record<string, unknown>)?.["loopGroupId"] ?? ""),
        reversibility: ((st["loopInfo"] as Record<string, unknown>)?.["reversibility"] as ZoneSubtask["loopInfo"]["reversibility"]) ?? "reversible",
        loopRiskScore: Number((st["loopInfo"] as Record<string, unknown>)?.["loopRiskScore"] ?? 0),
      },
    };
  });

  // Candidates
  const candidatesRaw = Array.isArray(o["candidates"]) ? o["candidates"] : [];
  const candidates: ZoneCandidate[] = candidatesRaw.map((c: unknown) => {
    const ct = (c ?? {}) as Record<string, unknown>;
    return {
      stepId: Number(ct["stepId"] ?? 0),
      agentsInStep: Array.isArray(ct["agentsInStep"]) ? ct["agentsInStep"].map(String) : [],
      dataIssue: Boolean(ct["dataIssue"]),
      dataItem: String(ct["dataItem"] ?? ""),
      sourceStep: ct["sourceStep"] != null ? Number(ct["sourceStep"]) : null,
      irrecoverable: Boolean(ct["irrecoverable"]),
      irrecoverableReason: String(ct["irrecoverableReason"] ?? ""),
      affectedSteps: Array.isArray(ct["affectedSteps"]) ? ct["affectedSteps"].map(Number) : [],
      impactScore: Number(ct["impactScore"] ?? 0.5),
      confidence: Number(ct["confidence"] ?? 0.5),
      errorType: String(ct["errorType"] ?? ct["error_type"] ?? "unknown") as ZoneCandidate["errorType"],
      errorLayer: String(ct["errorLayer"] ?? ct["error_layer"] ?? "") as ZoneCandidate["errorLayer"],
    };
  });

  const topCandidateRaw = o["topCandidate"];
  const topCandidate: ZoneCandidate | null = topCandidateRaw && typeof topCandidateRaw === "object"
    ? {
        stepId: Number((topCandidateRaw as Record<string, unknown>)["stepId"] ?? 0),
        agentsInStep: Array.isArray((topCandidateRaw as Record<string, unknown>)["agentsInStep"]) ? ((topCandidateRaw as Record<string, unknown>)["agentsInStep"] as string[]) : [],
        dataIssue: Boolean((topCandidateRaw as Record<string, unknown>)["dataIssue"]),
        dataItem: String((topCandidateRaw as Record<string, unknown>)["dataItem"] ?? ""),
        sourceStep: (topCandidateRaw as Record<string, unknown>)["sourceStep"] != null ? Number((topCandidateRaw as Record<string, unknown>)["sourceStep"]) : null,
        irrecoverable: Boolean((topCandidateRaw as Record<string, unknown>)["irrecoverable"]),
        irrecoverableReason: String((topCandidateRaw as Record<string, unknown>)["irrecoverableReason"] ?? ""),
        affectedSteps: Array.isArray((topCandidateRaw as Record<string, unknown>)["affectedSteps"]) ? ((topCandidateRaw as Record<string, unknown>)["affectedSteps"] as number[]) : [],
        impactScore: Number((topCandidateRaw as Record<string, unknown>)["impactScore"] ?? 0),
        confidence: Number((topCandidateRaw as Record<string, unknown>)["confidence"] ?? 0),
        errorType: String((topCandidateRaw as Record<string, unknown>)["errorType"] ?? (topCandidateRaw as Record<string, unknown>)["error_type"] ?? "unknown") as ZoneCandidate["errorType"],
        errorLayer: String((topCandidateRaw as Record<string, unknown>)["errorLayer"] ?? (topCandidateRaw as Record<string, unknown>)["error_layer"] ?? "") as ZoneCandidate["errorLayer"],
      }
    : null;

  return {
    ok: true,
    value: {
      zoneId,
      subtasks,
      subtaskEdges: (Array.isArray(o["subtaskEdges"]) ? o["subtaskEdges"] : []) as SubtaskEdge[],
      agentNodes: (Array.isArray(o["agentNodes"]) ? o["agentNodes"] : []) as AgentNode[],
      agentEdges: (Array.isArray(o["agentEdges"]) ? o["agentEdges"] : []) as AgentEdge[],
      stepDataFlows: (Array.isArray(o["stepDataFlows"]) ? o["stepDataFlows"] : []) as StepDataFlow[],
      candidates,
      topCandidate,
      zoneGraphComplete: Boolean(o["zoneGraphComplete"]),
    },
  };
}

// ── Read Agent Output ──

function readZoneOutput(workspacePath: string, zoneId: string): ZoneAnalysis | null {
  const outputPath = join(workspacePath, "output", `zone-${zoneId}-result.json`);
  if (!existsSync(outputPath)) return null;
  try {
    const raw = readFileSync(outputPath, "utf-8");
    return safeJsonParse(raw, "Zoom", validateZoneAnalysis);
  } catch {
    return null;
  }
}

// ── Merge Sub-Analyses ──

export function mergeSubAnalyses(subAnalyses: ZoneAnalysis[]): ZoneAnalysis {
  if (subAnalyses.length === 0) {
    return {
      zoneId: "merged",
      subtasks: [],
      subtaskEdges: [],
      agentNodes: [],
      agentEdges: [],
      stepDataFlows: [],
      candidates: [],
      topCandidate: null,
      zoneGraphComplete: false,
    };
  }

  if (subAnalyses.length === 1) return subAnalyses[0];

  const zoneId = subAnalyses[0].zoneId;
  const subtasks = subAnalyses.flatMap((a) => a.subtasks);
  const subtaskEdges = subAnalyses.flatMap((a) => a.subtaskEdges);
  const agentNodes = subAnalyses.flatMap((a) => a.agentNodes);
  const agentEdges = subAnalyses.flatMap((a) => a.agentEdges);
  const stepDataFlows = subAnalyses.flatMap((a) => a.stepDataFlows);
  const candidates = subAnalyses.flatMap((a) => a.candidates)
    .sort((a, b) => b.impactScore - a.impactScore);

  const topCandidate = candidates.length > 0 ? candidates[0] : null;
  const zoneGraphComplete = subAnalyses.every((a) => a.zoneGraphComplete);

  return {
    zoneId,
    subtasks,
    subtaskEdges,
    agentNodes,
    agentEdges,
    stepDataFlows,
    candidates,
    topCandidate,
    zoneGraphComplete,
  };
}

// ── Main ──

export async function zoomZone(
  zone: AttentionZone,
  allSteps: HistoryStep[],
  harness: EvalApplicationPort,
  workspacePath: string,
  sessionId: string,
  skeleton: SessionSkeleton,
  depth: number = 0,
  progress?: ProgressDisplay,
): Promise<ZoneAnalysis> {
  const zoneSize = zone.stepEnd - zone.stepStart + 1;

  // Base case: zone fits in one Agent session
  if (zoneSize <= MAX_ZONE_STEPS) {
    const result = readZoneOutput(workspacePath, zone.id);
    return result ?? {
      zoneId: zone.id,
      subtasks: [],
      subtaskEdges: [],
      agentNodes: [],
      agentEdges: [],
      stepDataFlows: [],
      candidates: [],
      topCandidate: null,
      zoneGraphComplete: false,
    };
  }

  // Recursive case: split zone for large zones
  if (depth >= MAX_RECURSIVE_DEPTH) {
    // Max depth reached, proceed with truncated zone
    const truncatedZone: AttentionZone = {
      ...zone,
      stepEnd: zone.stepStart + MAX_ZONE_STEPS - 1,
    };
    return zoomZone(truncatedZone, allSteps, harness, workspacePath, sessionId, skeleton, depth, progress);
  }

  // Split into two halves
  const mid = zone.stepStart + Math.floor(zoneSize / 2);
  const leftZone: AttentionZone = {
    ...zone,
    id: `${zone.id}_L`,
    stepEnd: mid - 1,
  };
  const rightZone: AttentionZone = {
    ...zone,
    id: `${zone.id}_R`,
    stepStart: mid,
  };

  const [leftAnalysis, rightAnalysis] = await Promise.all([
    zoomZone(leftZone, allSteps, harness, workspacePath, sessionId, skeleton, depth + 1, progress),
    zoomZone(rightZone, allSteps, harness, workspacePath, sessionId, skeleton, depth + 1, progress),
  ]);

  return mergeSubAnalyses([leftAnalysis, rightAnalysis]);
}
