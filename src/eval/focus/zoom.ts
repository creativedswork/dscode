// ── Pass 2: Zoom ──
// Per-zone deep-dive causal sub-graph construction.
// Supports recursive splitting for zones >200 steps.

import type { HarnessAPI } from "../../core/harness-api.js";
import { resolveModel } from "../../models/index.js";
import { completeSimple } from "@mariozechner/pi-ai";
import { safeJsonParse, type ValidationResult, type HistoryStep, type SubtaskEdge, type AgentNode, type AgentEdge, type StepDataFlow } from "../schemas.js";
import { extractJSON } from "../prompts.js";
import type { AttentionZone, ZoneAnalysis, ZoneSubtask, ZoneCandidate } from "./types.js";
import { ZOOM_SYSTEM_PROMPT, buildZoomPrompt } from "./prompts.js";
import { budgetGuard } from "./budget-guard.js";

// ── Constants ──

const MAX_ZONE_STEPS = 200;
const MAX_RECURSIVE_DEPTH = 3;

// ── Validation ──

function validateZoneAnalysis(obj: unknown): ValidationResult<ZoneAnalysis> {
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

// ── LLM Call ──

async function callLLM(
  systemPrompt: string,
  userMessage: string,
  harness: HarnessAPI,
  maxTokens?: number,
): Promise<string> {
  const model = resolveModel(harness.config.provider, harness.config.modelId);
  const response = await completeSimple(
    model,
    {
      systemPrompt,
      messages: [{ role: "user" as const, content: userMessage, timestamp: Date.now() }],
    },
    { apiKey: harness.config.apiKey, maxTokens },
  );
  const content = typeof response.content === "string"
    ? response.content
    : Array.isArray(response.content)
      ? ((response.content as unknown) as Record<string, unknown>[]).find((b) => b["type"] === "text")?.["text"] as string ?? ""
      : "";
  return content;
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
  harness: HarnessAPI,
  depth: number = 0,
): Promise<ZoneAnalysis> {
  const zoneSize = zone.stepEnd - zone.stepStart + 1;

  // Base case: zone fits in one Zoom call
  if (zoneSize <= MAX_ZONE_STEPS) {
    const prompt = buildZoomPrompt(zone, allSteps);
    const trimmed = budgetGuard.trimString(prompt);

    const raw = await callLLM(ZOOM_SYSTEM_PROMPT, trimmed, harness, 8192);
    const json = extractJSON(raw);

    if (!json) {
      return {
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

    const result = safeJsonParse(json, `Zoom-${zone.id}`, validateZoneAnalysis);
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

  // Recursive case: zone too large
  if (depth >= MAX_RECURSIVE_DEPTH) {
    console.warn(`[Zoom] Zone ${zone.id} recursive depth exceeded, truncating to first ${MAX_ZONE_STEPS} steps`);
    const truncatedZone: AttentionZone = {
      ...zone,
      stepEnd: zone.stepStart + MAX_ZONE_STEPS - 1,
    };
    return zoomZone(truncatedZone, allSteps, harness, depth);
  }

  // Split zone: divide into sub-zones, scan each, then zoom recursively
  const subZoneSize = Math.ceil(zoneSize / 2);
  const subZone1: AttentionZone = {
    ...zone,
    id: `${zone.id}_A`,
    stepEnd: zone.stepStart + subZoneSize - 1,
  };
  const subZone2: AttentionZone = {
    ...zone,
    id: `${zone.id}_B`,
    stepStart: zone.stepStart + subZoneSize,
  };

  const [analysis1, analysis2] = await Promise.all([
    zoomZone(subZone1, allSteps, harness, depth + 1),
    zoomZone(subZone2, allSteps, harness, depth + 1),
  ]);

  // Merge preserving parent zone ID
  const merged = mergeSubAnalyses([analysis1, analysis2]);
  merged.zoneId = zone.id;
  return merged;
}
