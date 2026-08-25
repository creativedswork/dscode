import {
  access,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  digestCanonicalPayload,
  PlanRecordSchema,
  PlanStore,
  validatePlanRecord,
} from "../../../src/application/plan/index.js";
import type { PlanRecord } from "../../../src/application/plan/index.js";
import { expectCreated, makePlanInput } from "./helpers.js";

const temporaryDirectories: string[] = [];

async function makeStore(): Promise<PlanStore> {
  const dataDir = await mkdtemp(join(tmpdir(), "dscode-plan-validation-"));
  temporaryDirectories.push(dataDir);
  return new PlanStore({ dataDir, projectPath: "/workspace/project" });
}

function countStrictObjects(value: unknown): number {
  if (Array.isArray(value)) {
    return value.reduce((count, item) => count + countStrictObjects(item), 0);
  }
  if (typeof value !== "object" || value === null) return 0;
  const object = value as Record<string, unknown>;
  const isTypeObject = object.type === "object" && object.properties !== undefined;
  if (isTypeObject) expect(object.additionalProperties).toBe(false);
  let count = Number(isTypeObject);
  for (const item of Object.values(object)) count += countStrictObjects(item);
  return count;
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) =>
    rm(path, { recursive: true, force: true }),
  ));
});

describe("PlanRecord persistence validation", () => {
  it("closes every persisted Type.Object recursively", () => {
    expect(countStrictObjects(PlanRecordSchema)).toBeGreaterThan(20);
  });

  it.each([
    ["top-level", (raw: Record<string, unknown>) => {
      raw.unrecognized = true;
    }],
    ["nested", (raw: Record<string, unknown>) => {
      const request = raw.request as Record<string, unknown>;
      request.unrecognized = true;
    }],
  ])("quarantines %s unknown fields", async (_label, mutate) => {
    const store = await makeStore();
    const planId = `plan-${_label}`;
    await store.create(makePlanInput(planId));
    const path = store.planPath(planId);
    const raw = JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
    mutate(raw);
    await writeFile(path, `${JSON.stringify(raw)}\n`, "utf8");

    const loaded = await store.load(planId);

    expect(loaded).toMatchObject({ ok: false, reason: "corrupt" });
    await expect(access(path)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("validates pending payload digests", async () => {
    const store = await makeStore();
    const record = structuredClone(expectCreated(
      await store.create(makePlanInput()),
    )) as PlanRecord;
    const payload = {
      decisionNodeId: "decision-1",
      candidateIds: ["json"],
      prompt: "Choose",
    };
    record.pendingInteraction = {
      interactionId: "interaction-1",
      kind: "decision",
      revision: record.revision,
      planDigest: record.digest,
      payloadDigest: digestCanonicalPayload({ ...payload, prompt: "Other" }),
      createdAt: 30,
      state: "pending",
      payload,
    };

    expect(() => validatePlanRecord(record)).toThrow(
      "Pending interaction payload digest does not match",
    );
  });

  it("requires receipt and result interaction IDs to agree and be unique", async () => {
    const store = await makeStore();
    const record = structuredClone(expectCreated(
      await store.create(makePlanInput()),
    )) as PlanRecord;
    record.version = 3;
    record.commandReceipts = [{
      commandId: "command-1",
      interactionId: "interaction-1",
      payloadDigest: "0".repeat(64),
      result: {
        kind: "interaction_consumed",
        interactionId: "interaction-other",
      },
      resultingVersion: 2,
      completedAt: 30,
    }];
    expect(() => validatePlanRecord(record)).toThrow("inconsistent interaction IDs");

    record.commandReceipts = [
      {
        ...record.commandReceipts[0],
        result: { kind: "interaction_consumed", interactionId: "interaction-1" },
      },
      {
        ...record.commandReceipts[0],
        commandId: "command-2",
        result: { kind: "interaction_consumed", interactionId: "interaction-1" },
        resultingVersion: 3,
      },
    ];
    expect(() => validatePlanRecord(record)).toThrow(
      "duplicate consumed interaction IDs",
    );
  });
});
