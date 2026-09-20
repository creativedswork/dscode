import { canonicalStringify } from "./digest.js";
import {
  canonicalizeResourceScope,
  resourceScopeCovers,
} from "./resource-scope.js";
import { parseSimpleShellCommand } from "./shell-command.js";
import type {
  PlanEffectGrant,
  PlanExecutionStep,
  PlanRecord,
  PlanResourceScope,
  PlanVerification,
} from "./types.js";

export interface PlanExecutionStepDraft {
  stepId: string;
  title: string;
  description: string;
  dependsOn: string[];
  verifications: PlanVerification[];
  effectGrants: PlanEffectGrant[];
}

export interface PlanCompilation {
  executionSteps: PlanExecutionStepDraft[];
  sideEffectSummary: string;
}

export const NO_SIDE_EFFECTS_SUMMARY = "No side effects.";

function requireText(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} must not be empty`);
  return normalized;
}

function canonicalizeGrant(
  grant: PlanEffectGrant,
  cwd: string,
): PlanEffectGrant {
  const resourceScopes = grant.resourceScopes
    .map((scope) => canonicalizeResourceScope(scope, cwd))
    .sort((left, right) =>
      canonicalStringify(left).localeCompare(canonicalStringify(right))
    );
  if (grant.effect !== "read" && resourceScopes.length === 0) {
    throw new Error(`Effect ${grant.effect} requires at least one resource scope`);
  }
  return { effect: grant.effect, resourceScopes };
}

function requiredCommandScopes(
  stepId: string,
  verifications: readonly PlanVerification[],
): PlanResourceScope[] {
  const commandClasses = verifications.flatMap((verification) => {
    if (verification.kind !== "command") return [];
    const parsed = parseSimpleShellCommand(verification.command);
    if (!parsed) {
      throw new Error(
        `Plan execution step ${stepId} command verification `
        + `${verification.verificationId} `
        + "must be one simple shell command",
      );
    }
    if (
      parsed.commandClass === "grep"
      && !parsed.args.some((argument) =>
        argument === "--"
        || argument === "-e"
        || argument === "--regexp"
        || argument.startsWith("--regexp=")
      )
    ) {
      throw new Error(
        `Plan execution step ${stepId} command verification `
        + `${verification.verificationId} `
        + "must pass grep patterns with -- or -e/--regexp",
      );
    }
    return [parsed.commandClass];
  });
  return [...new Set(commandClasses)].sort().map((commandClass) => ({
    kind: "process_command" as const,
    commandClass,
  }));
}

function assertExecutableAcceptance(
  steps: readonly PlanExecutionStepDraft[],
  availableToolNames: ReadonlySet<string>,
): void {
  for (const step of steps) {
    for (const verification of step.verifications) {
      if (verification.kind !== "command" && verification.kind !== "observable") {
        const invalid = verification as { kind: string; verificationId?: string };
        throw new Error(
          `Plan execution step ${step.stepId} ${invalid.kind} verification `
          + `${invalid.verificationId ?? ""} is not executable`,
        );
      }
      if (verification.kind !== "observable") continue;
      const toolName = verification.toolName.trim();
      if (!toolName || !availableToolNames.has(toolName)) {
        throw new Error(
          `Plan execution step ${step.stepId} observable verification `
          + `${verification.verificationId} requires an available execution tool; `
          + "use Agent-run command or Tool acceptance and report any "
          + "remaining manual evidence gap outside the TODO",
        );
      }
    }
  }
}

function canonicalizeGrants(
  step: PlanExecutionStepDraft,
  cwd: string,
): PlanEffectGrant[] {
  const grants = step.effectGrants.map((grant) =>
    canonicalizeGrant(grant, cwd)
  );
  const requiredScopes = requiredCommandScopes(
    step.stepId,
    step.verifications,
  );
  if (requiredScopes.length > 0) {
    const processGrant = grants.find((grant) => grant.effect === "process");
    if (processGrant) {
      processGrant.resourceScopes = [
        ...processGrant.resourceScopes,
        ...requiredScopes.filter((required) =>
          !processGrant.resourceScopes.some((scope) =>
            resourceScopeCovers(scope, required)
          )
        ),
      ].sort((left, right) =>
        canonicalStringify(left).localeCompare(canonicalStringify(right))
      );
    } else {
      grants.push({ effect: "process", resourceScopes: requiredScopes });
    }
  }
  return grants.sort((left, right) => left.effect.localeCompare(right.effect));
}

export function assertCompiledPlan(
  plan: Pick<
    Extract<PlanRecord, { schemaVersion: 2 }>,
    "alignmentRequirements" | "executionSteps" | "sideEffectSummary"
  >,
  cwd: string,
): void {
  const pendingRequirement = plan.alignmentRequirements?.find((requirement) =>
    requirement.status === "pending"
  );
  if (pendingRequirement) {
    throw new Error(
      `Alignment requirement ${pendingRequirement.requirementId} is still pending`,
    );
  }
  if (plan.executionSteps.length === 0) {
    throw new Error("Execution Plan requires at least one step");
  }
  const summary = requireText(plan.sideEffectSummary, "Side-effect summary");
  const effects = new Set<string>();
  for (const step of plan.executionSteps) {
    if (step.verifications.length === 0) {
      throw new Error(`Plan execution step ${step.stepId} requires verification`);
    }
    const requiredScopes = requiredCommandScopes(
      step.stepId,
      step.verifications,
    );
    for (const grant of step.effectGrants) {
      if (effects.has(`${step.stepId}:${grant.effect}`)) {
        throw new Error(
          `Plan execution step ${step.stepId} has duplicate ${grant.effect} grants`,
        );
      }
      effects.add(`${step.stepId}:${grant.effect}`);
      const canonical = canonicalizeGrant(grant, cwd);
      if (canonicalStringify(canonical) !== canonicalStringify(grant)) {
        throw new Error(
          `Plan execution step ${step.stepId} has non-canonical effect scopes`,
        );
      }
      const scopes = grant.resourceScopes.map(canonicalStringify);
      if (new Set(scopes).size !== scopes.length) {
        throw new Error(
          `Plan execution step ${step.stepId} has duplicate effect scopes`,
        );
      }
    }
    const processScopes = step.effectGrants
      .filter((grant) => grant.effect === "process")
      .flatMap((grant) => grant.resourceScopes);
    if (requiredScopes.some((required) =>
      !processScopes.some((scope) => resourceScopeCovers(scope, required))
    )) {
      throw new Error(
        `Plan execution step ${step.stepId} command verifications require `
        + "matching process grants",
      );
    }
  }
  const hasSideEffects = plan.executionSteps.some((step) =>
    step.effectGrants.some((grant) => grant.effect !== "read")
  );
  if (!hasSideEffects && summary !== NO_SIDE_EFFECTS_SUMMARY) {
    throw new Error(`Side-effect-free Plans must use "${NO_SIDE_EFFECTS_SUMMARY}"`);
  }
  if (hasSideEffects && summary === NO_SIDE_EFFECTS_SUMMARY) {
    throw new Error("Side-effect summary contradicts compiled effect grants");
  }
}

export function compileSelectedTrajectory(
  plan: Readonly<PlanRecord>,
  compilation: PlanCompilation,
  cwd: string,
  availableToolNames?: ReadonlySet<string>,
): PlanExecutionStep[] {
  const pendingRequirement = plan.alignmentRequirements?.find((requirement) =>
    requirement.status === "pending"
  );
  if (pendingRequirement) {
    throw new Error(
      `Alignment requirement ${pendingRequirement.requirementId} is still pending`,
    );
  }
  const openDecision = plan.decisions.find((decision) =>
    decision.status !== "selected"
  );
  if (openDecision) {
    throw new Error(`Decision ${openDecision.decisionNodeId} is not selected`);
  }
  if (compilation.executionSteps.length === 0) {
    throw new Error("Execution Plan requires at least one step");
  }
  if (availableToolNames) {
    assertExecutableAcceptance(compilation.executionSteps, availableToolNames);
  }
  requireText(compilation.sideEffectSummary, "Side-effect summary");
  const ids = compilation.executionSteps.map((step) => step.stepId);
  if (new Set(ids).size !== ids.length) {
    throw new Error("Plan execution step IDs must be unique");
  }
  const prior = new Set<string>();
  const executionSteps: PlanExecutionStep[] = compilation.executionSteps.map(
    (step, order) => {
    const stepId = requireText(step.stepId, "Plan execution step ID");
    for (const dependency of step.dependsOn) {
      if (!prior.has(dependency)) {
        throw new Error(
          `Plan execution step ${stepId} depends on non-prior step ${dependency}`,
        );
      }
    }
    if (step.verifications.length === 0) {
      throw new Error(`Plan execution step ${stepId} requires verification`);
    }
    const verificationIds = step.verifications.map((verification) =>
      verification.verificationId
    );
    if (new Set(verificationIds).size !== verificationIds.length) {
      throw new Error(
        `Plan execution step ${stepId} has duplicate verifications`,
      );
    }
    const effectGrants = canonicalizeGrants(step, cwd);
    prior.add(stepId);
    return {
      stepId,
      order,
      title: requireText(step.title, `Plan execution step ${stepId} title`),
      description: requireText(
        step.description,
        `Plan execution step ${stepId} description`,
      ),
      dependsOn: [...step.dependsOn],
      verifications: structuredClone(step.verifications),
      effectGrants,
    };
  });
  assertCompiledPlan({
    alignmentRequirements: plan.alignmentRequirements,
    executionSteps,
    sideEffectSummary: compilation.sideEffectSummary.trim(),
  }, cwd);
  return executionSteps;
}
