import {
  access,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  PlanStore,
  planLockPath,
  resolvePlanProjectLocation,
} from "../../../src/application/plan/index.js";
import { writeJsonAtomically } from "../../../src/application/plan/storage-io.js";
import { expectCreated, makePlanInput } from "./helpers.js";

const temporaryDirectories: string[] = [];

async function makeStore(
  projectPath = "/workspace/project-a",
  overrides: Partial<ConstructorParameters<typeof PlanStore>[0]> = {},
): Promise<PlanStore> {
  const dataDir = await mkdtemp(join(tmpdir(), "dscode-plan-store-"));
  temporaryDirectories.push(dataDir);
  return new PlanStore({ dataDir, projectPath, ...overrides });
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) =>
    rm(path, { recursive: true, force: true }),
  ));
});

describe("PlanStore", () => {
  it("uses a deterministic project-scoped path and rejects unsafe Plan IDs", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "dscode-plan-path-"));
    temporaryDirectories.push(dataDir);
    const first = resolvePlanProjectLocation(dataDir, "/workspace/project");
    const same = resolvePlanProjectLocation(dataDir, "/workspace/./project");
    const other = resolvePlanProjectLocation(dataDir, "/workspace/other");

    expect(first).toEqual(same);
    expect(first.projectKey).not.toBe(other.projectKey);
    expect(first.directory).toContain(join("plans", "by-project", first.projectKey));

    const store = new PlanStore({ dataDir, projectPath: "/workspace/project" });
    expect(() => store.planPath("../escape")).toThrow("Invalid Plan ID");
  });

  it("creates, validates, and loads a Plan snapshot", async () => {
    const store = await makeStore();
    const created = expectCreated(await store.create(makePlanInput()));

    expect(created).toMatchObject({
      schemaVersion: 2,
      planId: "plan-1",
      projectKey: store.projectKey,
      version: 1,
      revision: 1,
    });
    expect(created.digest).toMatch(/^[a-f0-9]{64}$/);
    await expect(store.load("plan-1")).resolves.toEqual({
      ok: true,
      plan: created,
    });
  });

  it("finds the latest persisted Plan for a Session", async () => {
    let now = 10;
    const store = await makeStore("/workspace/project", {
      now: () => now,
    });
    await store.create(makePlanInput("plan-1"));
    now = 20;
    await store.create(makePlanInput("plan-2"));
    now = 30;
    const other = makePlanInput("plan-3");
    other.sessionId = "session-2";
    await store.create(other);

    await expect(store.findLatestForSession("session-1")).resolves
      .toMatchObject({ planId: "plan-2", updatedAt: 20 });
    await expect(store.findLatestForSession("missing")).resolves.toBeUndefined();
  });

  it("separates persistence version from semantic revision", async () => {
    const store = await makeStore();
    const created = expectCreated(await store.create(makePlanInput()));
    const runtime = await store.update("plan-1", created.version, (draft) => {
      draft.status = "awaiting_approval";
      draft.approval = {
        revision: draft.revision,
        digest: draft.digest,
        approvedEffects: ["workspace_write"],
        acknowledgedSideEffects: ["Writes a Plan snapshot"],
        interactionId: "approval-1",
        approvedAt: 30,
      };
      draft.telemetry = { lastProgressAt: 31, counters: { tokens: 50 } };
    });
    expect(runtime.ok).toBe(true);
    if (!runtime.ok) return;
    expect(runtime.plan).toMatchObject({
      version: 2,
      revision: 1,
      digest: created.digest,
    });

    const semantic = await store.update("plan-1", runtime.plan.version, (draft) => {
      draft.goal = "Persist and recover a durable Plan";
    });
    expect(semantic.ok).toBe(true);
    if (!semantic.ok) return;
    expect(semantic.plan.version).toBe(3);
    expect(semantic.plan.revision).toBe(2);
    expect(semantic.plan.digest).not.toBe(created.digest);
    expect(semantic.plan.approval).toBeUndefined();
  });

  it("serializes in-process updates and returns a typed CAS conflict", async () => {
    const store = await makeStore();
    await store.create(makePlanInput());

    const results = await Promise.all([
      store.update("plan-1", 1, (draft) => { draft.status = "awaiting_decision"; }),
      store.update("plan-1", 1, (draft) => { draft.status = "awaiting_approval"; }),
    ]);

    expect(results.filter((result) => result.ok)).toHaveLength(1);
    const conflict = results.find((result) => !result.ok);
    expect(conflict).toMatchObject({
      ok: false,
      reason: "conflict",
      conflict: {
        kind: "version",
        expectedVersion: 1,
        currentVersion: 2,
      },
    });
  });

  it("recovers a stale lock only after confirming its owner is dead", async () => {
    const now = 50_000;
    const store = await makeStore("/workspace/project", {
      now: () => now,
      staleAfterMs: 100,
      retryDelayMs: 1,
      isProcessAlive: () => false,
    });
    await store.create(makePlanInput());
    const lockPath = planLockPath(store.directoryPath, "plan-1");
    await writeFile(lockPath, JSON.stringify({
      ownerPid: 999_999,
      processStartIdentity: {
        reliability: "reliable",
        scheme: "test-os-start",
        value: "dead-process-start",
      },
      createdAt: 1,
      token: "stale-owner",
    }));

    const result = await store.update("plan-1", 1, (draft) => {
      draft.status = "awaiting_decision";
    });

    expect(result.ok).toBe(true);
    await expect(access(lockPath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("preserves the committed record when writing stops before rename", async () => {
    const store = await makeStore();
    const created = expectCreated(await store.create(makePlanInput()));
    const path = store.planPath("plan-1");

    await expect(writeJsonAtomically(path, { incomplete: true }, async () => {
      throw new Error("simulated interruption");
    })).rejects.toThrow("simulated interruption");

    const loaded = await store.load("plan-1");
    expect(loaded).toEqual({ ok: true, plan: created });
    const names = await readdir(store.directoryPath);
    expect(names.some((name) => name.endsWith(".tmp"))).toBe(false);
  });

  it("quarantines malformed or digest-invalid authoritative records", async () => {
    const store = await makeStore();
    await store.create(makePlanInput());
    await writeFile(store.planPath("plan-1"), "{\"schemaVersion\":1}\n");

    const result = await store.load("plan-1");

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("corrupt");
    expect(result.quarantinePath).toContain(join(store.directoryPath, "corrupt"));
    await expect(access(store.planPath("plan-1"))).rejects.toMatchObject({ code: "ENOENT" });
    expect(await readdir(join(store.directoryPath, "corrupt"))).toHaveLength(1);

    await store.create(makePlanInput("plan-2"));
    const secondPath = store.planPath("plan-2");
    const tampered = JSON.parse(await readFile(secondPath, "utf8")) as Record<string, unknown>;
    tampered.goal = "Tampered without updating the digest";
    await writeFile(secondPath, `${JSON.stringify(tampered)}\n`);

    const digestInvalid = await store.load("plan-2");
    expect(digestInvalid).toMatchObject({ ok: false, reason: "corrupt" });
    expect(await readdir(join(store.directoryPath, "corrupt"))).toHaveLength(2);
  });

  it("persists and consumes an interaction exactly once with durable receipts", async () => {
    const store = await makeStore();
    await store.create(makePlanInput());
    const pending = await store.persistInteraction("plan-1", 1, {
      interactionId: "interaction-1",
      kind: "decision",
      createdAt: 40,
      payload: {
        decisionNodeId: "decision-1",
        candidateIds: ["json"],
        prompt: "Choose a persistence format",
      },
    });
    expect(pending.ok).toBe(true);
    if (!pending.ok || !pending.plan.pendingInteraction) return;
    const reloaded = await store.load("plan-1");
    expect(reloaded).toMatchObject({
      ok: true,
      plan: { pendingInteraction: { interactionId: "interaction-1" } },
    });
    if (!reloaded.ok || !reloaded.plan?.pendingInteraction) return;
    const interactionDigest = reloaded.plan.pendingInteraction.payloadDigest;
    const command = {
      planId: "plan-1",
      expectedVersion: 2,
      commandId: "command-1",
      interactionId: "interaction-1",
      interactionPayloadDigest: interactionDigest,
      operation: "select",
      payload: { optionId: "json" },
    };

    const mismatched = await store.applyCommand({
      ...command,
      commandId: "command-wrong-digest",
      interactionPayloadDigest: "0".repeat(64),
    }, () => {});
    expect(mismatched).toMatchObject({
      ok: false,
      reason: "interaction_digest_mismatch",
    });

    const applied = await store.applyCommand(command, (draft) => {
      draft.status = "awaiting_approval";
    });
    expect(applied).toMatchObject({ ok: true, duplicate: false });
    if (!applied.ok) return;
    expect(applied.plan.pendingInteraction).toBeUndefined();
    expect(applied.plan.commandReceipts).toHaveLength(1);

    const duplicate = await store.applyCommand(command, () => {
      throw new Error("duplicate command must not run its updater");
    });
    expect(duplicate).toMatchObject({
      ok: true,
      duplicate: true,
      receipt: { commandId: "command-1", resultingVersion: 3 },
    });

    const operationReused = await store.applyCommand(
      { ...command, operation: "investigate" },
      () => {},
    );
    expect(operationReused).toMatchObject({ ok: false, reason: "command_id_reused" });

    const reused = await store.applyCommand(
      { ...command, payload: { optionId: "other" } },
      () => {},
    );
    expect(reused).toMatchObject({ ok: false, reason: "command_id_reused" });

    const consumedAgain = await store.applyCommand(
      { ...command, expectedVersion: 3, commandId: "command-2" },
      () => {},
    );
    expect(consumedAgain).toMatchObject({
      ok: false,
      reason: "interaction_not_pending",
      receipt: { commandId: "command-1" },
    });

    const later = await store.applyCommand({
      planId: "plan-1",
      expectedVersion: 3,
      commandId: "command-3",
      operation: "record_progress",
      payload: { phase: "running" },
    }, (draft) => {
      draft.telemetry = { counters: { updates: 1 } };
    });
    expect(later.ok).toBe(true);
    if (later.ok) expect(later.plan.commandReceipts).toHaveLength(2);
  });
});
