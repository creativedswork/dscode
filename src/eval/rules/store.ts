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
import type { Logger } from "../../utils/logger.js";
import { runStructuredAgent } from "../chief/runner.js";
import {
  validateMergeDecisions,
  type MergeDecision,
  type ValidationResult,
} from "../schemas.js";

// ── Path ──

function evalDir(): string {
  return join(homedir(), ".dscode", "eval");
}

function ruleStorePath(): string {
  return join(evalDir(), "rules.json");
}

// ── I/O ──

export function normalizeRuleRecords(
  rules: Record<string, Record<string, unknown>>,
): Record<string, HarnessRule> {
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

export function loadRuleStore(projectPath: string, logger?: Logger): RuleStore {
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
    const rules = normalizeRuleRecords(parsed.rules as Record<string, Record<string, unknown>>);

    return {
      version: 1,
      projectPath: parsed.projectPath ?? projectPath,
      rules,
      updatedAt: parsed.updatedAt ?? Date.now(),
    };
  } catch (err) {
    if (logger) logger.warn("RuleStore", `Failed to load rules.json, starting fresh: ${(err as Error).message}`);
    return createEmptyStore(projectPath);
  }
}

export function saveRuleStore(store: RuleStore, logger?: Logger): void {
  const path = ruleStorePath();
  try {
    mkdirSync(dirname(path), { recursive: true });
    store.updatedAt = Date.now();
    writeFileSync(path, JSON.stringify(store, null, 2), "utf8");
  } catch (err) {
    if (logger) logger.error("RuleStore", `Failed to save rules.json: ${(err as Error).message}`);
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

// ── Semantic Merge (Step 8) ──

export async function semanticMerge(
  newRules: HarnessRule[],
  existingStore: RuleStore,
  harness: HarnessAPI,
  logger?: Logger,
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

  const prompt = `Semantically match each new eval rule to the existing rule store.

New rules:
${JSON.stringify(newSummaries, null, 2)}

Existing rules:
${JSON.stringify(existingSummaries, null, 2)}

Return a JSON array with exactly one decision for every new rule:
[{
  "newRuleId": "exact new rule ID",
  "decision": "merge|new",
  "targetRuleId": "exact existing rule ID when decision is merge",
  "reasoning": "semantic comparison"
}]

Do not reference IDs outside these two supplied lists.`;

  let decisions: MergeDecision[] = [];

  try {
    const newIds = new Set(newSummaries.map((rule) => rule.id));
    const existingIdSet = new Set(existingSummaries.map((rule) => rule.id));
    const validate = (value: unknown): ValidationResult<MergeDecision[]> => {
      const parsed = validateMergeDecisions(value);
      if (!parsed.ok) return parsed;
      const errors: string[] = [];
      const seen = new Set<string>();
      for (const decision of parsed.value) {
        if (!newIds.has(decision.newRuleId)) {
          errors.push(`Unknown newRuleId: ${decision.newRuleId}`);
        }
        if (seen.has(decision.newRuleId)) {
          errors.push(`Duplicate decision: ${decision.newRuleId}`);
        }
        if (decision.decision === "merge"
          && (!decision.targetRuleId || !existingIdSet.has(decision.targetRuleId))) {
          errors.push(`Unknown targetRuleId: ${decision.targetRuleId ?? ""}`);
        }
        seen.add(decision.newRuleId);
      }
      for (const id of newIds) {
        if (!seen.has(id)) errors.push(`Missing decision for ${id}`);
      }
      return errors.length > 0 ? { ok: false, errors } : parsed;
    };
    const result = await runStructuredAgent({
      host: harness,
      application: "eval-rule-merge",
      prompt,
      workspace: existingStore.projectPath || harness.config.projectPath,
      stage: "rules",
      validate,
      logger,
    });
    decisions = result.value;
  } catch (err) {
    if (logger) logger.warn("RuleStore", `Semantic merge Agent failed, adding all as new: ${(err as Error).message}`);
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
