// ── Harness Rule Store ──
// Persistent storage for cross-session rule evidence accumulation.
// File: ~/.dscode/eval/rules.json (scoped per project)
// Step 8: LLM-based semantic merge (replaces deterministic ID match).

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import type { HarnessRule, RuleStore } from "./types.js";
import { computeSeverity } from "./types.js";
import type { HarnessAPI } from "../../core/harness-api.js";
import { resolveModel } from "../../models/index.js";
import { completeSimple } from "@mariozechner/pi-ai";
import { RULE_MERGE_SYSTEM, buildStep8Prompt, extractJSON } from "../prompts.js";
import { validateMergeDecisions, type MergeDecision } from "../schemas.js";

// ── Path ──

function evalDir(): string {
  return join(homedir(), ".dscode", "eval");
}

function ruleStorePath(): string {
  return join(evalDir(), "rules.json");
}

// ── I/O ──

function stripOldFormat(rules: Record<string, Record<string, unknown>>): Record<string, HarnessRule> {
  const result: Record<string, HarnessRule> = {};
  for (const [id, rule] of Object.entries(rules)) {
    const { pattern, needsLlm, ...rest } = rule;
    const r = rest as unknown as HarnessRule;
    // Fill missing fields for old-format rules
    if (!r.rawDescription) {
      (r as unknown as Record<string, unknown>)["rawDescription"] = r.abstract ?? "";
    }
    // Ensure mergedFrom exists if not present
    if (r.mergedFrom === undefined) {
      (r as unknown as Record<string, unknown>)["mergedFrom"] = undefined;
    }
    result[id] = r;
  }
  return result;
}

export function loadRuleStore(projectPath: string): RuleStore {
  const path = ruleStorePath();
  try {
    if (!existsSync(path)) {
      return createEmptyStore(projectPath);
    }
    const raw = readFileSync(path, "utf8");
    const parsed = JSON.parse(raw);

    // Basic validation
    if (!parsed || typeof parsed !== "object") {
      throw new Error("Invalid JSON structure");
    }
    if (typeof parsed.version !== "number" || parsed.version !== 1) {
      throw new Error(`Unsupported version: ${parsed.version}`);
    }
    if (!parsed.rules || typeof parsed.rules !== "object") {
      throw new Error("Missing rules map");
    }

    // Strip old-format fields (pattern, needsLlm) on load
    const rules = stripOldFormat(parsed.rules as Record<string, Record<string, unknown>>);

    return {
      version: 1,
      projectPath: parsed.projectPath ?? projectPath,
      rules,
      updatedAt: parsed.updatedAt ?? Date.now(),
    };
  } catch (err) {
    console.warn("[harness-rule-store] Failed to load rules.json, starting fresh:", (err as Error).message);
    return createEmptyStore(projectPath);
  }
}

export function saveRuleStore(store: RuleStore): void {
  const path = ruleStorePath();
  try {
    mkdirSync(dirname(path), { recursive: true });
    store.updatedAt = Date.now();
    writeFileSync(path, JSON.stringify(store, null, 2), "utf8");
  } catch (err) {
    console.error("[harness-rule-store] Failed to save rules.json:", (err as Error).message);
  }
}

function createEmptyStore(projectPath: string): RuleStore {
  return {
    version: 1,
    projectPath,
    rules: {},
    updatedAt: Date.now(),
  };
}

// ── LLM Helper ──

async function callMergeLLM(
  systemPrompt: string,
  userMessage: string,
  harness: HarnessAPI,
): Promise<string> {
  const model = resolveModel(harness.config.provider, harness.config.modelId);
  const response = await completeSimple(
    model,
    {
      systemPrompt,
      messages: [{ role: "user" as const, content: userMessage, timestamp: Date.now() }],
    },
    { apiKey: harness.config.apiKey },
  );
  const content = typeof response.content === "string"
    ? response.content
    : Array.isArray(response.content)
      ? ((response.content as unknown) as Record<string, unknown>[]).find((b) => b["type"] === "text")?.["text"] as string ?? ""
      : "";
  return content;
}

// ── Semantic Merge (Step 8) ──

export async function semanticMerge(
  newRules: HarnessRule[],
  existingStore: RuleStore,
  harness: HarnessAPI,
): Promise<RuleStore> {
  // Short-circuit: no new rules
  if (newRules.length === 0) return existingStore;

  // Short-circuit: empty store — just add all new rules
  const existingIds = Object.keys(existingStore.rules);
  if (existingIds.length === 0) {
    const merged: Record<string, HarnessRule> = {};
    for (const r of newRules) {
      const fresh = { ...r };
      fresh.severity = computeSeverity(fresh.evidence.length);
      merged[r.id] = fresh;
    }
    return { ...existingStore, rules: merged, updatedAt: Date.now() };
  }

  // Build summaries for LLM
  const newSummaries = newRules.map((r) => ({
    id: r.id,
    category: r.category,
    abstract: r.abstract,
  }));

  const existingSummaries = Object.values(existingStore.rules).map((r) => ({
    id: r.id,
    category: r.category,
    abstract: r.abstract,
    evidenceCount: r.evidence.length,
  }));

  const prompt = buildStep8Prompt(newSummaries, existingSummaries);

  let decisions: MergeDecision[] = [];

  try {
    let rawOutput = await callMergeLLM(RULE_MERGE_SYSTEM, prompt, harness);

    // Parse and validate with retry
    for (let attempt = 0; attempt < 2; attempt++) {
      const json = extractJSON(rawOutput);
      if (!json) {
        if (attempt === 0) {
          rawOutput = await callMergeLLM(RULE_MERGE_SYSTEM, prompt + "\n\n⚠ Output PURE JSON array only.", harness);
          continue;
        }
        console.warn("[harness-rule-store] No JSON in merge LLM response, adding all as new");
        break;
      }

      const parsed = validateMergeDecisions(JSON.parse(json));
      if (parsed.ok) {
        decisions = parsed.value;
        break;
      }

      if (attempt === 0) {
        rawOutput = await callMergeLLM(
          RULE_MERGE_SYSTEM,
          prompt + `\n\n⚠ Validation errors: ${parsed.errors.join("; ")}`,
          harness,
        );
        continue;
      }
      console.warn("[harness-rule-store] Merge validation failed:", parsed.errors.join("; "));
    }
  } catch (err) {
    console.warn("[harness-rule-store] Semantic merge LLM call failed, adding all as new:", (err as Error).message);
  }

  // Apply merge decisions
  const merged: Record<string, HarnessRule> = { ...existingStore.rules };
  const decisionMap = new Map(decisions.map((d) => [d.newRuleId, d]));

  for (const newRule of newRules) {
    const decision = decisionMap.get(newRule.id);

    if (decision?.decision === "merge" && decision.targetRuleId) {
      const target = merged[decision.targetRuleId];
      if (target) {
        // Append evidence
        for (const ev of newRule.evidence) {
          target.evidence.push(ev);
        }
        target.severity = computeSeverity(target.evidence.length);
        // Track merge source
        if (!target.mergedFrom) target.mergedFrom = [];
        if (!target.mergedFrom.includes(newRule.id)) {
          target.mergedFrom.push(newRule.id);
        }
        merged[decision.targetRuleId] = target;
        continue;
      }
    }

    // Fall through: add as new rule
    const fresh = { ...newRule };
    fresh.severity = computeSeverity(fresh.evidence.length);
    merged[newRule.id] = fresh;
  }

  return { ...existingStore, rules: merged, updatedAt: Date.now() };
}

// ── Query ──

export function getHighSeverityRules(store: RuleStore): HarnessRule[] {
  return Object.values(store.rules).filter((r) => r.severity >= 0.6);
}

export function getRuleCount(store: RuleStore): number {
  return Object.keys(store.rules).length;
}

export function getErrorCount(store: RuleStore): number {
  return Object.values(store.rules).filter((r) => r.severity >= 1.0).length;
}
