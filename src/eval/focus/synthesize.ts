// ── Pass 3: Synthesize ──
// Cross-zone root cause attribution. Merges zone sub-graphs into
// a unified CausalGraphSnapshot and determines single root cause.

import type { HarnessAPI } from "../../core/harness-api.js";
import { resolveModel } from "../../models/index.js";
import { completeSimple } from "@mariozechner/pi-ai";
import { safeJsonParse, type ValidationResult, type CausalGraphSnapshot, type SubtaskSummary, type EdgeSummary, type AgentSummary, type DataFlowSummary } from "../schemas.js";
import { extractJSON } from "../prompts.js";
import type { ScanResult, ZoneAnalysis, FocusAttribution, CascadeEdge, AlternateRootCause, SessionSkeleton, CascadeMechanism } from "./types.js";
import { SYNTH_SYSTEM_PROMPT, buildSynthesizePrompt } from "./prompts.js";

// ── Validation ──

const VALID_MECHANISMS: CascadeMechanism[] = [
  "data_contamination",
  "irreversible_lock_in",
  "perception_blind_spot",
  "repair_cascade",
  "taste_drift_propagation",
];

function validateFocusAttribution(obj: unknown): ValidationResult<FocusAttribution> {
  if (typeof obj !== "object" || obj === null) return { ok: false, errors: ["Expected object"] };
  const o = obj as Record<string, unknown>;

  const cascadeRaw = Array.isArray(o["cascadePath"]) ? o["cascadePath"] : [];
  const cascadePath: CascadeEdge[] = cascadeRaw.map((e: unknown) => {
    const ce = (e ?? {}) as Record<string, unknown>;
    const mechanism = String(ce["mechanism"] ?? "data_contamination");
    return {
      fromZoneId: String(ce["fromZoneId"] ?? ""),
      fromStepId: Number(ce["fromStepId"] ?? 0),
      toZoneId: String(ce["toZoneId"] ?? ""),
      toStepId: Number(ce["toStepId"] ?? 0),
      dataItem: String(ce["dataItem"] ?? ""),
      mechanism: VALID_MECHANISMS.includes(mechanism as CascadeMechanism)
        ? (mechanism as CascadeMechanism)
        : "data_contamination",
    };
  });

  const altRaw = Array.isArray(o["alternateRootCauses"]) ? o["alternateRootCauses"] : [];
  const alternateRootCauses: AlternateRootCause[] = altRaw.map((a: unknown) => {
    const ac = (a ?? {}) as Record<string, unknown>;
    return {
      stepId: Number(ac["stepId"] ?? 0),
      agent: String(ac["agent"] ?? ""),
      reason: String(ac["reason"] ?? ""),
      confidence: Number(ac["confidence"] ?? 0.5),
    };
  });

  return {
    ok: true,
    value: {
      mistakeAgent: String(o["mistakeAgent"] ?? ""),
      mistakeStep: Number(o["mistakeStep"] ?? 0),
      zoneId: String(o["zoneId"] ?? ""),
      reason: String(o["reason"] ?? ""),
      rulesApplied: Array.isArray(o["rulesApplied"]) ? o["rulesApplied"].map(String) : [],
      cascadePath,
      alternateRootCauses,
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

// ── Zone Sub-Graph Merging ──

function buildMergedGraphSnapshot(
  zoneAnalyses: ZoneAnalysis[],
  skeleton: SessionSkeleton,
): CausalGraphSnapshot {
  const subtasks: SubtaskSummary[] = [];
  const subtaskEdges: EdgeSummary[] = [];
  const agentSummaries: AgentSummary[] = [];
  const agentEdges: EdgeSummary[] = [];
  const dataFlows: DataFlowSummary[] = [];

  for (const za of zoneAnalyses) {
    // Map zone subtasks to graph subtask summaries
    for (const zs of za.subtasks) {
      subtasks.push({
        id: `${za.zoneId}_${zs.id}`,
        name: zs.name,
        stepRange: `${zs.stepStart}-${zs.stepEnd}`,
        oracleGoal: zs.oracle.goal,
        loopSummary: zs.loopInfo.isLoopRelated ? `Loop risk: ${zs.loopInfo.loopRiskScore.toFixed(2)}` : "No loop",
        agentCount: za.agentNodes.filter((n) => n.subtaskId === zs.id).length,
        keyActions: za.agentNodes
          .filter((n) => n.subtaskId === zs.id)
          .slice(0, 5)
          .map((n) => n.otar.action.slice(0, 80)),
        hasErrors: za.candidates.some((c) => c.stepId >= zs.stepStart && c.stepId <= zs.stepEnd),
        status: za.candidates.some((c) => c.stepId >= zs.stepStart && c.stepId <= zs.stepEnd && c.irrecoverable) ? "danger"
          : za.candidates.some((c) => c.stepId >= zs.stepStart && c.stepId <= zs.stepEnd) ? "warn"
          : "ok",
      });
    }

    // Map subtask edges
    for (const se of za.subtaskEdges) {
      subtaskEdges.push({
        src: `${za.zoneId}_${se.src}`,
        dst: `${za.zoneId}_${se.dst}`,
        type: se.type,
        strength: se.strength,
        keyDataTransfers: se.dataTransfer.map((d) => d.dataItem),
        failureModeSummary: se.failureModes.map((f) => f.description).join("; "),
      });
    }

    // Map agent summaries
    for (const an of za.agentNodes) {
      agentSummaries.push({
        subtaskId: `${za.zoneId}_${an.subtaskId}`,
        agent: an.agent,
        keyAction: an.otar.action.slice(0, 100),
        stepIds: an.stepIds,
      });
    }

    // Map agent edges
    for (const ae of za.agentEdges) {
      agentEdges.push({
        src: ae.srcAgent,
        dst: ae.dstAgent,
        type: ae.depType,
        strength: ae.strength,
        keyDataTransfers: [],
        failureModeSummary: ae.failureModes.map((f) => f.description).join("; "),
      });
    }

    // Map data flows
    for (const df of za.stepDataFlows) {
      dataFlows.push({
        dataItem: df.dataItem,
        path: `step${df.fromStep}(${df.sourceAgent}) → step${df.toStep}(${df.targetAgent})`,
        correctness: df.correctness,
      });
    }
  }

  return {
    subtasks,
    subtaskEdges,
    agentSummaries,
    agentEdges,
    dataFlows,
    totalSteps: skeleton.meta.totalSteps,
  };
}

// ── Main ──

export async function synthesize(
  scanResult: ScanResult,
  zoneAnalyses: ZoneAnalysis[],
  skeleton: SessionSkeleton,
  harness: HarnessAPI,
): Promise<{ attribution: FocusAttribution; mergedGraph: CausalGraphSnapshot }> {
  const prompt = buildSynthesizePrompt(scanResult, zoneAnalyses, skeleton);

  const raw = await callLLM(SYNTH_SYSTEM_PROMPT, prompt, harness, 6144);
  const json = extractJSON(raw);

  const attribution: FocusAttribution = json
    ? (safeJsonParse(json, "Synthesize", validateFocusAttribution) ?? {
        mistakeAgent: "unknown",
        mistakeStep: 0,
        zoneId: "",
        reason: "Synthesize parse/validation failed",
        rulesApplied: [],
        cascadePath: [],
        alternateRootCauses: [],
      })
    : {
        mistakeAgent: "unknown",
        mistakeStep: 0,
        zoneId: "",
        reason: "Synthesize produced no JSON",
        rulesApplied: [],
        cascadePath: [],
        alternateRootCauses: [],
      };

  const mergedGraph = buildMergedGraphSnapshot(zoneAnalyses, skeleton);

  return { attribution, mergedGraph };
}
