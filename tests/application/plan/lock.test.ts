import {
  access,
  mkdtemp,
  readFile,
  readdir,
  rm,
  utimes,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  acquirePlanLock,
  PlanLockTimeoutError,
  planLockPath,
} from "../../../src/application/plan/lock.js";
import type {
  ProcessStartIdentity,
} from "../../../src/application/plan/lock-owner.js";

const NOW = 50_000;
const temporaryDirectories: string[] = [];

async function makeLockPath(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "dscode-plan-lock-"));
  temporaryDirectories.push(directory);
  return planLockPath(directory, "plan-1");
}

function reliableIdentity(
  value: string,
  scheme = "test-os-start",
): ProcessStartIdentity {
  return { reliability: "reliable", scheme, value };
}

function owner(processStartIdentity: ProcessStartIdentity, createdAt = 1): string {
  return JSON.stringify({
    ownerPid: process.pid,
    processStartIdentity,
    createdAt,
    token: "existing-owner",
  });
}

const currentProcessIdentity = reliableIdentity("current-process-start");
const processOptions = {
  now: () => NOW,
  staleAfterMs: 100,
  waitTimeoutMs: 0,
  retryDelayMs: 0,
  isProcessAlive: () => true,
  getProcessStartIdentity: () => currentProcessIdentity,
};

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) =>
    rm(path, { recursive: true, force: true }),
  ));
});

describe("Plan lock recovery", () => {
  it("recovers a stale malformed lock while holding the recovery marker", async () => {
    const lockPath = await makeLockPath();
    await writeFile(lockPath, "{malformed", "utf8");
    await utimes(lockPath, new Date(0), new Date(0));

    const release = await acquirePlanLock(
      dirname(lockPath),
      "plan-1",
      processOptions,
    );

    await release();
    const lockName = basename(lockPath);
    expect((await readdir(dirname(lockPath))).filter((name) =>
      name === lockName || name.startsWith(`${lockName}.`)
    )).toEqual([]);
  });

  it("does not reclaim a fresh malformed lock", async () => {
    const lockPath = await makeLockPath();
    await writeFile(lockPath, "{malformed", "utf8");
    await utimes(lockPath, new Date(NOW), new Date(NOW));

    await expect(acquirePlanLock(dirname(lockPath), "plan-1", processOptions))
      .rejects.toBeInstanceOf(PlanLockTimeoutError);

    expect(await readFile(lockPath, "utf8")).toBe("{malformed");
  });

  it("recovers a stale lock when its PID belongs to a newer process instance", async () => {
    const lockPath = await makeLockPath();
    await writeFile(lockPath, owner(reliableIdentity("previous-process-start")), "utf8");

    const release = await acquirePlanLock(dirname(lockPath), "plan-1", processOptions);
    const current = JSON.parse(await readFile(lockPath, "utf8")) as Record<string, unknown>;

    expect(current.processStartIdentity).toEqual(currentProcessIdentity);
    await release();
    await expect(access(lockPath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("does not reclaim a stale-looking lock owned by the current process instance", async () => {
    const lockPath = await makeLockPath();
    await writeFile(lockPath, owner(currentProcessIdentity), "utf8");

    await expect(acquirePlanLock(dirname(lockPath), "plan-1", processOptions))
      .rejects.toBeInstanceOf(PlanLockTimeoutError);

    expect(JSON.parse(await readFile(lockPath, "utf8")))
      .toMatchObject({ token: "existing-owner" });
  });

  it("does not reclaim a live owner with a runtime fallback identity", async () => {
    const lockPath = await makeLockPath();
    await writeFile(lockPath, owner({
      reliability: "fallback",
      scheme: "runtime",
      value: "owner-runtime-id",
    }), "utf8");

    await expect(acquirePlanLock(dirname(lockPath), "plan-1", processOptions))
      .rejects.toBeInstanceOf(PlanLockTimeoutError);

    expect(JSON.parse(await readFile(lockPath, "utf8")))
      .toMatchObject({ token: "existing-owner" });
  });

  it("does not reclaim a live owner when the contender cannot read its identity", async () => {
    const lockPath = await makeLockPath();
    await writeFile(lockPath, owner(currentProcessIdentity), "utf8");

    await expect(acquirePlanLock(dirname(lockPath), "plan-1", {
      ...processOptions,
      getProcessStartIdentity: () => undefined,
    })).rejects.toBeInstanceOf(PlanLockTimeoutError);

    expect(JSON.parse(await readFile(lockPath, "utf8")))
      .toMatchObject({ token: "existing-owner" });
  });

  it("does not compare reliable identities from different schemes", async () => {
    const lockPath = await makeLockPath();
    await writeFile(lockPath, owner(
      reliableIdentity("previous-process-start", "other-os-start"),
    ), "utf8");

    await expect(acquirePlanLock(dirname(lockPath), "plan-1", processOptions))
      .rejects.toBeInstanceOf(PlanLockTimeoutError);

    expect(JSON.parse(await readFile(lockPath, "utf8")))
      .toMatchObject({ token: "existing-owner" });
  });

  it("recovers a future-dated lock with a stale file when its owner is dead", async () => {
    const lockPath = await makeLockPath();
    await writeFile(
      lockPath,
      owner(reliableIdentity("dead-process-start"), NOW + 1_000),
      "utf8",
    );
    await utimes(lockPath, new Date(0), new Date(0));

    const release = await acquirePlanLock(dirname(lockPath), "plan-1", {
      ...processOptions,
      isProcessAlive: () => false,
    });

    expect(JSON.parse(await readFile(lockPath, "utf8")))
      .toMatchObject({ processStartIdentity: currentProcessIdentity });
    await release();
  });

  it("does not reclaim a future-dated lock while its owner is alive", async () => {
    const lockPath = await makeLockPath();
    await writeFile(
      lockPath,
      owner(currentProcessIdentity, NOW + 1_000),
      "utf8",
    );
    await utimes(lockPath, new Date(0), new Date(0));

    await expect(acquirePlanLock(dirname(lockPath), "plan-1", processOptions))
      .rejects.toBeInstanceOf(PlanLockTimeoutError);

    expect(JSON.parse(await readFile(lockPath, "utf8")))
      .toMatchObject({ token: "existing-owner" });
  });

  it("waits for file staleness before recovering a future-dated dead owner", async () => {
    const lockPath = await makeLockPath();
    await writeFile(
      lockPath,
      owner(reliableIdentity("dead-process-start"), NOW + 1_000),
      "utf8",
    );
    await utimes(lockPath, new Date(NOW), new Date(NOW));

    await expect(acquirePlanLock(dirname(lockPath), "plan-1", {
      ...processOptions,
      isProcessAlive: () => false,
    })).rejects.toBeInstanceOf(PlanLockTimeoutError);

    expect(JSON.parse(await readFile(lockPath, "utf8")))
      .toMatchObject({ token: "existing-owner" });
  });
});
