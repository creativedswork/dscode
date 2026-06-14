// ── Pass 1: Scan ──
// Calls LLM to identify 3-5 attention zones from a SessionSkeleton.

import type { HarnessAPI } from "../../core/harness-api.js";
import { resolveModel } from "../../models/index.js";
import { completeSimple } from "@mariozechner/pi-ai";
import { safeJsonParse, type ValidationResult } from "../schemas.js";
import { extractJSON } from "../prompts.js";
import type { ScanResult, AttentionZone, SessionSkeleton } from "./types.js";
import { SCAN_SYSTEM_PROMPT, buildScanPrompt } from "./prompts.js";

// ── Validation ──

function validateScanResult(obj: unknown): ValidationResult<ScanResult> {
  if (typeof obj !== "object" || obj === null) return { ok: false, errors: ["Expected object"] };
  const o = obj as Record<string, unknown>;

  const noIssues = o["noIssuesDetected"] === true;
  const zonesRaw = Array.isArray(o["zones"]) ? o["zones"] : [];
  const zones: AttentionZone[] = [];

  for (let i = 0; i < zonesRaw.length; i++) {
    const z = zonesRaw[i] as Record<string, unknown>;
    if (!z || typeof z !== "object") continue;
    zones.push({
      id: String(z["id"] ?? `Z${i + 1}`),
      stepStart: Number(z["stepStart"] ?? 0),
      stepEnd: Number(z["stepEnd"] ?? 0),
      suspicionScore: Math.min(1, Math.max(0, Number(z["suspicionScore"] ?? 0.5))),
      primarySignal: String(z["primarySignal"] ?? "error_burst") as AttentionZone["primarySignal"],
      summary: String(z["summary"] ?? "").slice(0, 200),
      keyAgents: Array.isArray(z["keyAgents"]) ? z["keyAgents"].map(String) : [],
      keyDataItems: Array.isArray(z["keyDataItems"]) ? z["keyDataItems"].map(String) : [],
    });
  }

  return {
    ok: true,
    value: {
      zones,
      globalAssessment: String(o["globalAssessment"] ?? ""),
      noIssuesDetected: noIssues,
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

// ── Main ──

export async function scanSession(
  skeleton: SessionSkeleton,
  harness: HarnessAPI,
): Promise<ScanResult> {
  const prompt = buildScanPrompt(skeleton);
  const raw = await callLLM(SCAN_SYSTEM_PROMPT, prompt, harness, 4096);
  const json = extractJSON(raw);

  if (!json) {
    // LLM produced no JSON — assume no issues detected
    return { zones: [], globalAssessment: "LLM produced no parseable output", noIssuesDetected: true };
  }

  const result = safeJsonParse(json, "Scan", validateScanResult);
  if (!result) {
    return { zones: [], globalAssessment: "Scan parse/validation failed", noIssuesDetected: true };
  }

  // Enforce 3-5 zones, sorted by suspicionScore
  result.zones = result.zones
    .sort((a, b) => b.suspicionScore - a.suspicionScore)
    .slice(0, 5);

  if (result.zones.length === 0) {
    result.noIssuesDetected = true;
  }

  return result;
}
