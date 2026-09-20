import {
  mkdtemp,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { PlanStore } from "../../../src/application/plan/index.js";
import type { NewPlanInteraction } from "../../../src/application/plan/index.js";
import { makePlanInput } from "./helpers.js";

const temporaryDirectories: string[] = [];

async function makeStore(): Promise<PlanStore> {
  const dataDir = await mkdtemp(join(tmpdir(), "dscode-plan-interaction-"));
  temporaryDirectories.push(dataDir);
  return new PlanStore({ dataDir, projectPath: "/workspace/project" });
}

function makeInteraction(interactionId: string): NewPlanInteraction {
  return {
    interactionId,
    kind: "decision",
    createdAt: 40,
    payload: {
      decisionNodeId: "decision-1",
      candidateIds: ["json"],
      prompt: "Choose a persistence format",
    },
  };
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) =>
    rm(path, { recursive: true, force: true }),
  ));
});

describe("PlanStore interactions", () => {
  it("rejects replacing an existing pending interaction", async () => {
    const store = await makeStore();
    await store.create(makePlanInput());
    await store.persistInteraction("plan-1", 1, makeInteraction("interaction-1"));

    await expect(
      store.persistInteraction("plan-1", 2, makeInteraction("interaction-2")),
    ).rejects.toThrow("Interaction interaction-1 is already pending");
    await expect(store.load("plan-1")).resolves.toMatchObject({
      ok: true,
      plan: {
        version: 2,
        pendingInteraction: { interactionId: "interaction-1" },
      },
    });
  });

  it("rejects reusing a consumed interaction ID", async () => {
    const store = await makeStore();
    await store.create(makePlanInput());
    const pending = await store.persistInteraction(
      "plan-1",
      1,
      makeInteraction("interaction-1"),
    );
    if (!pending.ok || !pending.plan.pendingInteraction) {
      throw new Error("Expected pending interaction");
    }
    const interactionPayloadDigest = pending.plan.pendingInteraction.payloadDigest;
    const applied = await store.applyCommand({
      planId: "plan-1",
      expectedVersion: 2,
      commandId: "command-1",
      operation: "select",
      interactionId: "interaction-1",
      interactionPayloadDigest,
      payload: { optionId: "json" },
    }, (draft) => {
      draft.status = "awaiting_approval";
    });
    expect(applied.ok).toBe(true);

    await expect(
      store.persistInteraction("plan-1", 3, makeInteraction("interaction-1")),
    ).rejects.toThrow("Interaction interaction-1 was already consumed");
    const loaded = await store.load("plan-1");
    expect(loaded).toMatchObject({ ok: true, plan: { version: 3 } });
    if (loaded.ok) expect(loaded.plan?.pendingInteraction).toBeUndefined();
  });
});
