import { describe, expect, it } from "vitest";

import {
  canonicalStringify,
  computePlanDigest,
  digestCanonicalPayload,
  validatePlanRecord,
} from "../../../src/application/plan/index.js";
import type { PlanRecord } from "../../../src/application/plan/index.js";
import { makePlanInput } from "./helpers.js";

function makeRecord(): PlanRecord {
  const input = makePlanInput();
  const record: PlanRecord = {
    ...input,
    schemaVersion: 2,
    projectKey: "project-123456789abc",
    version: 1,
    revision: 1,
    digest: "",
    commandReceipts: [],
    createdAt: 20,
    updatedAt: 20,
  };
  record.digest = computePlanDigest(record);
  return record;
}

describe("Plan semantic digest", () => {
  it("canonicalizes object keys before hashing", () => {
    expect(canonicalStringify({ z: 1, a: { y: 2, x: 3 } })).toBe(
      "{\"a\":{\"x\":3,\"y\":2},\"z\":1}",
    );
    expect(digestCanonicalPayload({ a: 1, b: 2 })).toBe(
      digestCanonicalPayload({ b: 2, a: 1 }),
    );
  });

  it("changes for every semantic execution-intent category", () => {
    const record = makeRecord();
    const original = record.digest;
    const mutations: Array<(draft: PlanRecord) => void> = [
      (draft) => { draft.goal = "A different goal"; },
      (draft) => { draft.constraints[0].description = "A different constraint"; },
      (draft) => { draft.decisions[0].candidates[0].summary = "A different path"; },
      (draft) => { draft.executionSteps[0].title = "A different step"; },
      (draft) => {
        draft.executionSteps[0].verifications[0] = {
          kind: "observable",
          verificationId: "criterion-1",
          description: "A different acceptance condition",
          toolName: "read_file",
        };
      },
      (draft) => {
        draft.executionSteps[0].effectGrants[0].resourceScopes[0] = {
          kind: "workspace_path",
          pattern: "src/**",
        };
      },
      (draft) => { draft.sideEffectSummary = "A different side effect"; },
    ];

    for (const mutate of mutations) {
      const draft = structuredClone(record);
      mutate(draft);
      expect(computePlanDigest(draft)).not.toBe(original);
    }
  });

  it("ignores runtime status, evidence, bindings, approval, telemetry, and timestamps", () => {
    const record = makeRecord();
    const changed = structuredClone(record);
    changed.status = "executing";
    changed.version = 12;
    changed.execution.steps[0].status = "in_progress";
    changed.execution.steps[0].evidence.push({
      kind: "agent_progress",
      evidenceId: "progress-1",
      agentId: "main-1",
      phase: "implementing",
      summary: "Half complete",
      recordedAt: 30,
    });
    changed.execution.steps[0].executionBinding = {
      agentId: "main-1",
      role: "main",
      planId: record.planId,
      revision: record.revision,
      digest: record.digest,
      itemId: "item-1",
      boundAt: 31,
    };
    changed.approval = {
      revision: record.revision,
      digest: record.digest,
      approvedEffects: ["workspace_write"],
      acknowledgedSideEffects: ["Writes source files"],
      interactionId: "interaction-approval",
      approvedAt: 32,
    };
    changed.telemetry = {
      lastProgressAt: 33,
      counters: { modelTokens: 100, toolCalls: 2 },
    };
    changed.request.submittedAt = 34;
    changed.createdAt = 35;
    changed.updatedAt = 36;

    expect(computePlanDigest(changed)).toBe(record.digest);
  });

  it("validates candidate summaries and general facts in the audit trajectory", () => {
    const record = makeRecord();
    record.trajectoryEvents = [
      {
        eventId: "event-candidate",
        revision: 1,
        recordedAt: 21,
        kind: "candidate_summarized",
        decisionNodeId: "decision-1",
        optionId: "json",
        summary: "Atomic JSON snapshots fit the existing storage model",
      },
      {
        eventId: "event-fact",
        revision: 1,
        recordedAt: 22,
        kind: "fact_recorded",
        summary: "The existing process store already uses project-scoped snapshots",
        references: [{
          kind: "file",
          referenceId: "fact-source-1",
          path: "src/agents/process/store.ts",
          description: "Existing persistence implementation",
        }],
      },
    ];

    expect(validatePlanRecord(record).trajectoryEvents.map((event) => event.kind))
      .toEqual(["candidate_summarized", "fact_recorded"]);
  });
});
