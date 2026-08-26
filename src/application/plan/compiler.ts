import { canonicalStringify } from "./digest.js";
import { canonicalizeResourceScope } from "./resource-scope.js";
import type {
  PlanAcceptanceCriterion,
  PlanEffectGrant,
  PlanItem,
  PlanRecord,
} from "./types.js";

export interface PlanItemDraft {
  itemId: string;
  title: string;
  description: string;
  dependsOn: string[];
  acceptanceCriteria: PlanAcceptanceCriterion[];
  effectGrants: PlanEffectGrant[];
}

export interface PlanCompilation {
  items: PlanItemDraft[];
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

export function assertCompiledPlan(
  plan: Pick<PlanRecord, "items" | "sideEffectSummary">,
  cwd: string,
): void {
  if (plan.items.length === 0) throw new Error("Execution Plan requires at least one item");
  const summary = requireText(plan.sideEffectSummary, "Side-effect summary");
  const effects = new Set<string>();
  for (const item of plan.items) {
    if (item.acceptanceCriteria.length === 0) {
      throw new Error(`Plan item ${item.itemId} requires acceptance criteria`);
    }
    for (const grant of item.effectGrants) {
      if (effects.has(`${item.itemId}:${grant.effect}`)) {
        throw new Error(`Plan item ${item.itemId} has duplicate ${grant.effect} grants`);
      }
      effects.add(`${item.itemId}:${grant.effect}`);
      const canonical = canonicalizeGrant(grant, cwd);
      if (canonicalStringify(canonical) !== canonicalStringify(grant)) {
        throw new Error(`Plan item ${item.itemId} has non-canonical effect scopes`);
      }
      const scopes = grant.resourceScopes.map(canonicalStringify);
      if (new Set(scopes).size !== scopes.length) {
        throw new Error(`Plan item ${item.itemId} has duplicate effect scopes`);
      }
    }
  }
  const hasSideEffects = plan.items.some((item) =>
    item.effectGrants.some((grant) => grant.effect !== "read")
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
): PlanItem[] {
  const openDecision = plan.decisions.find((decision) =>
    decision.status !== "selected"
  );
  if (openDecision) {
    throw new Error(`Decision ${openDecision.decisionNodeId} is not selected`);
  }
  if (compilation.items.length === 0) {
    throw new Error("Execution Plan requires at least one item");
  }
  requireText(compilation.sideEffectSummary, "Side-effect summary");
  const ids = compilation.items.map((item) => item.itemId);
  if (new Set(ids).size !== ids.length) throw new Error("Plan item IDs must be unique");
  const prior = new Set<string>();
  const items: PlanItem[] = compilation.items.map((item, order) => {
    const itemId = requireText(item.itemId, "Plan item ID");
    for (const dependency of item.dependsOn) {
      if (!prior.has(dependency)) {
        throw new Error(`Plan item ${itemId} depends on non-prior item ${dependency}`);
      }
    }
    if (item.acceptanceCriteria.length === 0) {
      throw new Error(`Plan item ${itemId} requires acceptance criteria`);
    }
    const criterionIds = item.acceptanceCriteria.map((criterion) =>
      criterion.criterionId
    );
    if (new Set(criterionIds).size !== criterionIds.length) {
      throw new Error(`Plan item ${itemId} has duplicate acceptance criteria`);
    }
    const effectGrants = item.effectGrants
      .map((grant) => canonicalizeGrant(grant, cwd))
      .sort((left, right) => left.effect.localeCompare(right.effect));
    prior.add(itemId);
    return {
      itemId,
      order,
      title: requireText(item.title, `Plan item ${itemId} title`),
      description: requireText(item.description, `Plan item ${itemId} description`),
      dependsOn: [...item.dependsOn],
      status: "pending",
      acceptanceCriteria: structuredClone(item.acceptanceCriteria),
      effectGrants,
      evidence: [],
      executionBindings: [],
    };
  });
  assertCompiledPlan({ items, sideEffectSummary: compilation.sideEffectSummary.trim() }, cwd);
  return items;
}
