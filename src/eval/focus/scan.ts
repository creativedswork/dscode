// ── Pass 1: SCAN Agent ──
// Spawns an Agent session that explores the workspace library/ directory
// to identify 3-5 attention zones. Output is written to output/scan-result.json.

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { EvalApplicationPort } from "../../application/harness-api.js";
import { safeJsonParse, type ValidationResult } from "../schemas.js";
import type { ScanResult, AttentionZone, SessionSkeleton } from "./types.js";
import type { ProgressDisplay } from "./progress.js";

// ── Validation ──

export function validateScanResult(obj: unknown): ValidationResult<ScanResult> {
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

// ── Read Agent Output ──

function readScanOutput(workspacePath: string): ScanResult | null {
  const outputPath = join(workspacePath, "output", "scan-result.json");
  if (!existsSync(outputPath)) return null;
  try {
    const raw = readFileSync(outputPath, "utf-8");
    return safeJsonParse(raw, "Scan", validateScanResult);
  } catch {
    return null;
  }
}

// ── Main ──

export async function scanSession(
  _skeleton: SessionSkeleton,
  _harness: EvalApplicationPort,
  workspacePath: string,
  _sessionId: string,
  _progress?: ProgressDisplay,
): Promise<ScanResult> {
  const result = readScanOutput(workspacePath);
  if (!result) {
    return {
      zones: [],
      globalAssessment: "Legacy Focus pipeline is disabled; use the CHIEF pipeline",
      noIssuesDetected: true,
    };
  }

  result.zones = result.zones
    .sort((a, b) => b.suspicionScore - a.suspicionScore)
    .slice(0, 5);

  if (result.zones.length === 0) {
    result.noIssuesDetected = true;
  }

  return result;
}
