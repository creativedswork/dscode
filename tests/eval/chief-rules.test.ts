import { describe, expect, it, vi } from "vitest";

import type { AgentSupervisor } from "../../src/agents/process/supervisor.js";
import type { SpawnAgentRequest } from "../../src/agents/process/types.js";
import type { HarnessAPI } from "../../src/core/harness-api.js";
import {
  normalizeRuleRecords,
  semanticMerge,
} from "../../src/eval/rules/store.js";
import type {
  HarnessRule,
  RuleStore,
} from "../../src/eval/rules/types.js";

function rule(id: string, sessionId: string): HarnessRule {
  return {
    id,
    category: "agents_md",
    targetLayer: "Agent Application",
    targetScope: "application",
    targetApplication: "executor",
    abstract: "Validate delegated output",
    rawDescription: "Delegated output propagated without validation",
    severity: 0.4,
    evidence: [{
      sessionId,
      timestamp: 1,
      occurrences: 1,
      sampleSteps: [1],
      agentIds: ["executor-1"],
      applications: ["executor"],
      evidenceQuality: "full",
    }],
    suggestion: {
      layer: "executor Application",
      action: "modify",
      proposed: "Validate output before returning",
      rationale: "Prevents invalid propagation",
    },
  };
}

function harness(outputs: string[]) {
  let index = 0;
  const spawn = vi.fn(async (request: SpawnAgentRequest) => {
    const agentId = `merge-worker-${index + 1}`;
    request.onSpawn?.(agentId);
    return {
      agentId,
      result: {
        agentId,
        state: "completed" as const,
        output: outputs[index++],
        startedAt: 1,
        endedAt: 2,
      },
    };
  });
  return {
    value: {
      config: { projectPath: "/project" },
      agentSupervisor: {
        list: () => [{ role: "main", agentId: "main-1" }],
        spawn,
      } as unknown as AgentSupervisor,
    } as unknown as HarnessAPI,
    spawn,
  };
}

function store(): RuleStore {
  return {
    version: 1,
    projectPath: "/project",
    rules: {
      existing: rule("existing", "old-session"),
    },
    updatedAt: 1,
  };
}

describe("Supervisor-backed Harness Rule merge", () => {
  it("merges semantic matches through eval-rule-merge", async () => {
    const fake = harness([JSON.stringify([{
      newRuleId: "new-rule",
      decision: "merge",
      targetRuleId: "existing",
      reasoning: "same validation gap",
    }])]);

    const merged = await semanticMerge(
      [rule("new-rule", "new-session")],
      store(),
      fake.value,
    );

    expect(fake.spawn).toHaveBeenCalledWith(expect.objectContaining({
      application: "eval-rule-merge",
      recording: "process-only",
      attachment: "foreground",
    }));
    expect(merged.rules["new-rule"]).toBeUndefined();
    expect(merged.rules.existing.evidence.map((item) => item.sessionId))
      .toEqual(["old-session", "new-session"]);
    expect(merged.rules.existing.mergedFrom).toContain("new-rule");
  });

  it("keeps new rules when both merge outputs reference unknown IDs", async () => {
    const invalid = JSON.stringify([{
      newRuleId: "new-rule",
      decision: "merge",
      targetRuleId: "invented",
      reasoning: "invalid target",
    }]);
    const fake = harness([invalid, invalid]);

    const merged = await semanticMerge(
      [rule("new-rule", "new-session")],
      store(),
      fake.value,
    );

    expect(fake.spawn).toHaveBeenCalledTimes(2);
    expect(merged.rules["new-rule"]).toBeDefined();
    expect(merged.rules.existing).toBeDefined();
  });

  it("normalizes old Rule Store records without losing evidence", () => {
    const old = rule("legacy", "legacy-session") as unknown as Record<string, unknown>;
    delete old.rawDescription;
    old.pattern = "removed field";
    old.needsLlm = true;

    const normalized = normalizeRuleRecords({ legacy: old });

    expect(normalized.legacy.rawDescription).toBe(normalized.legacy.abstract);
    expect(normalized.legacy.evidence[0].sessionId).toBe("legacy-session");
    expect(normalized.legacy).not.toHaveProperty("pattern");
    expect(normalized.legacy).not.toHaveProperty("needsLlm");
  });
});
