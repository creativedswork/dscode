// ── Harness Rule Types ──
// LLM-autonomous rule attribution: the LLM generates rules freely from
// the full CHIEF context. No pre-defined catalog, no detector registry.
// Cross-session accumulation via LLM semantic merge.

// ── Rule Category ──

export type RuleCategory = "identity" | "tool_use" | "tool_registry" | "agents_md" | "skill" | "other";

// ── Rule Evidence ──

export interface RuleEvidence {
  sessionId: string;
  timestamp: number;
  occurrences: number;
  sampleSteps: number[];
  agentIds?: string[];
  applications?: string[];
  evidenceQuality?: "full" | "summary" | "missing";
}

// ── Rule Suggestion ──

export interface RuleSuggestion {
  layer: string;
  action: "modify" | "add" | "remove" | "reorder";
  current?: string;
  proposed: string;
  rationale: string;
}

// ── Harness Rule ──
// LLM generates: id, category, targetLayer, abstract, rawDescription, severity, suggestion.
// System manages: evidence (appended across sessions), mergedFrom (merge tracking).

export interface HarnessRule {
  id: string;
  category: RuleCategory;
  targetLayer: string;
  targetScope?: "application" | "shared";
  targetApplication?: string;
  targetApplicationSource?: string;
  targetApplicationDigest?: string;
  abstract: string;
  rawDescription: string;
  severity: number;
  evidence: RuleEvidence[];
  suggestion: RuleSuggestion;
  mergedFrom?: string[];
}

// ── Rule Store ──

export interface RuleStore {
  version: 1;
  projectPath: string;
  rules: Record<string, HarnessRule>;
  updatedAt: number;
}

// ── Severity thresholds ──

export const SEVERITY_THRESHOLDS: Record<number, number> = {
  0: 0,
  1: 0.2,
  2: 0.4,
  3: 0.6,
  4: 0.8,
};

export function computeSeverity(evidenceCount: number): number {
  if (evidenceCount <= 0) return 0;
  if (evidenceCount >= 5) return 1.0;
  return SEVERITY_THRESHOLDS[evidenceCount] ?? 1.0;
}

export function severityLabel(severity: number): "INFO" | "WARN" | "ERROR" {
  if (severity >= 1.0) return "ERROR";
  if (severity >= 0.6) return "WARN";
  return "INFO";
}

export const CATEGORY_LABELS: Record<string, string> = {
  identity:      "# Identity / Soul",
  tool_use:      "# Tool Use Rules",
  tool_registry: "Tool Registry",
  agents_md:     "# AGENTS.md",
  skill:         "# Skills",
  other:         "Other",
};
