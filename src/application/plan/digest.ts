import { createHash } from "node:crypto";

import type {
  AlignmentRequirement,
  PlanCandidate,
  PlanConstraint,
  PlanExecutionStep,
  PlanItem,
  PlanRecord,
} from "./types.js";

interface PlanSemanticPayloadBase {
  goal: string;
  constraints: PlanConstraint[];
  alignmentRequirements?: AlignmentRequirement[];
  selectedDecisions: Array<{
    decisionNodeId: string;
    question: string;
    selectedOptionId: string;
    candidate: PlanCandidate;
  }>;
  sideEffectSummary: string;
}

export interface PlanSemanticPayloadV1 extends PlanSemanticPayloadBase {
  items: Array<Pick<
    PlanItem,
    | "itemId"
    | "order"
    | "title"
    | "description"
    | "dependsOn"
    | "acceptanceCriteria"
    | "effectGrants"
    | "skipReason"
  >>;
}

export interface PlanSemanticPayloadV2 extends PlanSemanticPayloadBase {
  executionSteps: PlanExecutionStep[];
}

export type PlanSemanticPayload = PlanSemanticPayloadV1 | PlanSemanticPayloadV2;

export function canonicalStringify(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError("Canonical JSON cannot contain non-finite numbers");
    }
    return JSON.stringify(Object.is(value, -0) ? 0 : value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalStringify).join(",")}]`;
  }
  if (typeof value === "object") {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError("Canonical JSON only supports plain objects");
    }
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalStringify(item)}`);
    return `{${entries.join(",")}}`;
  }
  throw new TypeError(`Canonical JSON cannot contain ${typeof value}`);
}

export function digestCanonicalPayload(payload: unknown): string {
  return createHash("sha256").update(canonicalStringify(payload)).digest("hex");
}

export function planSemanticPayload(record: PlanRecord): PlanSemanticPayload {
  const selectedDecisions = record.decisions.flatMap((decision) => {
    if (decision.status !== "selected" || !decision.selectedOptionId) return [];
    const candidate = decision.candidates.find(
      (item) => item.optionId === decision.selectedOptionId,
    );
    if (!candidate) {
      throw new Error(
        `Selected option ${decision.selectedOptionId} is missing from ${decision.decisionNodeId}`,
      );
    }
    return [{
      decisionNodeId: decision.decisionNodeId,
      question: decision.question,
      selectedOptionId: decision.selectedOptionId,
      candidate,
    }];
  });
  const base = {
    goal: record.goal,
    constraints: record.constraints,
    ...("alignmentRequirements" in record
      ? { alignmentRequirements: record.alignmentRequirements }
      : {}),
    selectedDecisions,
    sideEffectSummary: record.sideEffectSummary,
  };
  if (record.schemaVersion === 2) {
    return {
      ...base,
      executionSteps: record.executionSteps,
    };
  }
  return {
    ...base,
    items: record.items.map((item) => ({
      itemId: item.itemId,
      order: item.order,
      title: item.title,
      description: item.description,
      dependsOn: item.dependsOn,
      acceptanceCriteria: item.acceptanceCriteria,
      effectGrants: item.effectGrants,
      ...(item.skipReason === undefined ? {} : { skipReason: item.skipReason }),
    })),
  };
}

export function computePlanDigest(record: PlanRecord): string {
  return digestCanonicalPayload(planSemanticPayload(record));
}
