import type { EvalApplicationPort } from "../../application/harness-api.js";
import type { Logger } from "../../utils/logger.js";
import { runStructuredAgent } from "../chief/runner.js";
import type { ChiefAttribution } from "../chief/types.js";
import type { ChiefBacktrack, ChiefGraph, ChiefOracle } from "../chief/types.js";
import type { EvalRunContext } from "../chief/workspace.js";
import {
  validateHarnessRuleOutputs,
  type HarnessRuleOutput,
  type ValidationResult,
} from "../schemas.js";
import type { MultiAgentTrajectory, TrajectoryActor } from "../trajectory.js";
import type { HarnessRule } from "./types.js";

function promptForRules(context: unknown): string {
  return `Derive actionable dscode harness rules from this validated CHIEF result.

Context:
${JSON.stringify(context, null, 2)}

Return a JSON array. An empty array is valid. Every rule must have:
{
  "id": "stable-kebab-id",
  "category": "identity|tool_use|tool_registry|agents_md|skill|other",
  "targetLayer": "specific configuration layer",
  "targetScope": "application|shared",
  "targetApplication": "required exact Application name for application scope",
  "abstract": "short reusable statement",
  "rawDescription": "evidence-linked explanation",
  "severity": 0.0,
  "suggestion": {
    "layer": "specific layer",
    "action": "modify|add|remove|reorder",
    "current": "optional current behavior",
    "proposed": "concrete proposed behavior",
    "rationale": "why this addresses the causal failure"
  }
}

Do not create a rule for a one-off task mistake unless it reveals a reusable
harness configuration defect. Do not put Session IDs or concrete Step numbers
in abstract or suggestion text. Never invent an Application source path.`;
}

function toHarnessRules(
  outputs: HarnessRuleOutput[],
  sessionId: string,
  timestamp: number,
  mistakeStep: number | null,
  actors: readonly TrajectoryActor[] = [],
  attribution?: ChiefAttribution,
): HarnessRule[] {
  return outputs.map((rule) => {
    const actor = rule.targetScope === "application"
      ? actors.find((candidate) =>
        candidate.agentId === attribution?.mistakeAgentId
        && candidate.application === rule.targetApplication
      ) ?? actors.find((candidate) => candidate.application === rule.targetApplication)
      : undefined;
    const evidenceAgentIds = attribution
      ? [...new Set([
        attribution.mistakeAgentId,
        ...attribution.recoveryArcs.flatMap((arc) => [
          arc.errorAgentId,
          arc.detectionAgentId,
          arc.correctionAgentId,
        ]),
      ])]
      : [];
    const evidenceApplications = attribution
      ? [...new Set([
        attribution.mistakeApplication,
        ...attribution.recoveryArcs.flatMap((arc) => [
          arc.errorApplication,
          arc.detectionApplication,
          arc.correctionApplication,
        ]),
      ])]
      : [];
    return {
      id: rule.id,
      category: rule.category as HarnessRule["category"],
      targetLayer: rule.targetLayer,
      targetScope: rule.targetScope,
      targetApplication: rule.targetApplication,
      targetApplicationSource: actor?.applicationSource,
      targetApplicationDigest: actor?.applicationDigest,
      abstract: rule.abstract,
      rawDescription: rule.rawDescription,
      severity: rule.severity,
      evidence: [{
        sessionId,
        timestamp,
        occurrences: 1,
        sampleSteps: mistakeStep === null ? [] : [mistakeStep],
        agentIds: evidenceAgentIds.length > 0 ? evidenceAgentIds : undefined,
        applications: evidenceApplications.length > 0 ? evidenceApplications : undefined,
        evidenceQuality: actor?.evidenceQuality ?? attribution?.evidenceQuality,
      }],
      suggestion: rule.suggestion,
    };
  });
}

export function validateApplicationRuleOutputs(
  value: unknown,
  trajectory: MultiAgentTrajectory,
): ValidationResult<HarnessRuleOutput[]> {
  const parsed = validateHarnessRuleOutputs(value);
  if (!parsed.ok) return parsed;
  const errors: string[] = [];
  const applications = new Set(trajectory.actors.map((actor) => actor.application));
  for (const rule of parsed.value) {
    if (rule.targetScope === "application"
      && (!rule.targetApplication || !applications.has(rule.targetApplication))) {
      errors.push(`Unknown target Application: ${rule.targetApplication ?? ""}`);
    }
    if (rule.targetScope === "shared" && rule.targetApplication) {
      errors.push(`Shared rule ${rule.id} must not set targetApplication`);
    }
    const reusableText = `${rule.abstract}\n${rule.suggestion.proposed}`;
    if (reusableText.includes(trajectory.session.metadata.id)
      || /\bstep\s*#?\d+\b/i.test(reusableText)) {
      errors.push(`Rule ${rule.id} contains Session-specific evidence in reusable text`);
    }
  }
  return errors.length > 0 ? { ok: false, errors } : parsed;
}

export async function attributeRulesWithAgent(options: {
  trajectory: MultiAgentTrajectory;
  attribution: ChiefAttribution;
  graph: ChiefGraph;
  oracles: ChiefOracle[];
  backtrack: ChiefBacktrack;
  harness: EvalApplicationPort;
  run: EvalRunContext;
  signal?: AbortSignal;
  logger?: Logger;
  onWorker?: (agentId: string, attempt: number) => void;
}): Promise<HarnessRule[]> {
  const result = await runStructuredAgent({
    host: options.harness,
    application: "eval-rule-attribution",
    prompt: promptForRules({
      targetSessionId: options.trajectory.session.metadata.id,
      attribution: options.attribution,
      graph: options.graph,
      oracles: options.oracles,
      backtrack: options.backtrack,
      evidence: options.trajectory.evidence,
      actorInventory: options.trajectory.actors,
    }),
    workspace: options.run.runRoot,
    stage: "rules",
    validate: (value) => validateApplicationRuleOutputs(value, options.trajectory),
    signal: options.signal,
    logger: options.logger,
    onWorker: options.onWorker,
  });
  return toHarnessRules(
    result.value,
    options.trajectory.session.metadata.id,
    Date.now(),
    options.attribution.mistakeStep,
    options.trajectory.actors,
    options.attribution,
  );
}
