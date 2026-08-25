import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import {
  access,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

import { PlanStore, planLockPath } from "../../../src/application/plan/index.js";
import { acquirePlanLock } from "../../../src/application/plan/lock.js";
import { expectCreated, makePlanInput } from "./helpers.js";

const PROJECT_PATH = "/workspace/fault-project";
const temporaryDirectories: string[] = [];
const workers = new Set<ChildProcess>();
const workerPath = fileURLToPath(new URL("./fixtures/fault-worker.ts", import.meta.url));

interface FaultWorker {
  child: ChildProcess;
  exited: Promise<{ code: number | null; signal: NodeJS.Signals | null }>;
}

function startFaultWorker(
  args: string[],
  env: NodeJS.ProcessEnv = process.env,
): FaultWorker {
  const child = spawn(process.execPath, ["--import", "tsx", workerPath, ...args], {
    cwd: process.cwd(),
    env,
    stdio: ["ignore", "ignore", "pipe"],
  });
  workers.add(child);
  let stderr = "";
  child.stderr?.setEncoding("utf8");
  child.stderr?.on("data", (chunk: string) => { stderr += chunk; });
  const exited = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(
    (resolve, reject) => {
      child.once("error", reject);
      child.once("exit", (code, signal) => {
        workers.delete(child);
        if (code && signal === null) {
          reject(new Error(`Fault worker exited ${code}: ${stderr}`));
          return;
        }
        resolve({ code, signal });
      });
    },
  );
  return { child, exited };
}

async function waitForFile(path: string): Promise<void> {
  const deadline = Date.now() + 10_000;
  while (true) {
    try {
      await access(path);
      return;
    } catch {
      if (Date.now() >= deadline) throw new Error(`Timed out waiting for ${path}`);
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
}

async function makeStore(): Promise<{ dataDir: string; store: PlanStore }> {
  const dataDir = await mkdtemp(join(tmpdir(), "dscode-plan-fault-"));
  temporaryDirectories.push(dataDir);
  const store = new PlanStore({ dataDir, projectPath: PROJECT_PATH });
  await store.create(makePlanInput());
  return { dataDir, store };
}

interface LiveOwnerContentionOptions {
  ownerEnv?: NodeJS.ProcessEnv;
  contenderEnv?: NodeJS.ProcessEnv;
  ownerCannotRunPs?: boolean;
  contenderCannotRunPs?: boolean;
}

async function contendWithLiveOwner(
  options: LiveOwnerContentionOptions,
): Promise<{
  lockOwner: Record<string, unknown>;
  contenderResult: Record<string, unknown>;
}> {
  const { dataDir, store } = await makeStore();
  const readyPath = join(dataDir, "live-owner");
  const releasePath = join(dataDir, "release-owner");
  const resultPath = join(dataDir, "contender-result");
  const missingPath = join(dataDir, "missing-bin");
  const owner = startFaultWorker([
    "hold-lock",
    dataDir,
    PROJECT_PATH,
    "plan-1",
    readyPath,
    releasePath,
  ], {
    ...process.env,
    ...options.ownerEnv,
    ...(options.ownerCannotRunPs ? { PATH: missingPath } : {}),
  });

  await waitForFile(readyPath);
  const lockOwner = JSON.parse(
    await readFile(planLockPath(store.directoryPath, "plan-1"), "utf8"),
  ) as Record<string, unknown>;
  const ownerPid = owner.child.pid;
  if (ownerPid === undefined) throw new Error("Owner worker has no PID");
  await new Promise((resolve) => setTimeout(resolve, 20));
  const contender = startFaultWorker([
    "contend-lock",
    dataDir,
    PROJECT_PATH,
    "plan-1",
    resultPath,
    String(ownerPid),
  ], {
    ...process.env,
    ...options.contenderEnv,
    ...(options.contenderCannotRunPs ? { PATH: missingPath } : {}),
  });
  await expect(contender.exited).resolves.toEqual({ code: 0, signal: null });
  const contenderResult = JSON.parse(
    await readFile(resultPath, "utf8"),
  ) as Record<string, unknown>;
  expect(owner.child.exitCode).toBeNull();

  await writeFile(releasePath, "release\n", "utf8");
  await expect(owner.exited).resolves.toEqual({ code: 0, signal: null });
  await expect(store.update("plan-1", 1, (draft) => {
    draft.status = "awaiting_decision";
  })).resolves.toMatchObject({ ok: true, plan: { version: 2 } });
  return { lockOwner, contenderResult };
}

afterEach(async () => {
  for (const child of workers) child.kill("SIGKILL");
  workers.clear();
  await Promise.all(temporaryDirectories.splice(0).map((path) =>
    rm(path, { recursive: true, force: true }),
  ));
});

describe("PlanStore crash recovery", () => {
  it("does not publish a lock before the complete owner is fsynced", async () => {
    const { dataDir, store } = await makeStore();
    const readyPath = join(dataDir, "owner-synced");
    const worker = startFaultWorker([
      "before-owner-publish",
      dataDir,
      PROJECT_PATH,
      "plan-1",
      readyPath,
    ]);

    await waitForFile(readyPath);
    await expect(worker.exited).resolves.toMatchObject({ signal: "SIGKILL" });
    await expect(access(planLockPath(store.directoryPath, "plan-1")))
      .rejects.toMatchObject({ code: "ENOENT" });
    await expect(store.update("plan-1", 1, (draft) => {
      draft.status = "awaiting_decision";
    })).resolves.toMatchObject({ ok: true, plan: { version: 2 } });
  }, 20_000);

  it("recovers a complete lock whose publisher crashes after publication", async () => {
    const { dataDir, store } = await makeStore();
    const readyPath = join(dataDir, "owner-published");
    const lockPath = planLockPath(store.directoryPath, "plan-1");
    const worker = startFaultWorker([
      "after-owner-publish",
      dataDir,
      PROJECT_PATH,
      "plan-1",
      readyPath,
    ]);

    await waitForFile(readyPath);
    await expect(worker.exited).resolves.toMatchObject({ signal: "SIGKILL" });
    const owner = JSON.parse(await readFile(lockPath, "utf8")) as Record<string, unknown>;
    expect(owner).toMatchObject({ ownerPid: worker.child.pid });
    expect(owner.processStartIdentity).toMatchObject({ reliability: "reliable" });
    expect(owner.token).toEqual(expect.any(String));

    await new Promise((resolve) => setTimeout(resolve, 20));
    const recoveringStore = new PlanStore({
      dataDir,
      projectPath: PROJECT_PATH,
      staleAfterMs: 10,
      retryDelayMs: 1,
    });
    await expect(recoveringStore.update("plan-1", 1, (draft) => {
      draft.status = "awaiting_decision";
    })).resolves.toMatchObject({ ok: true, plan: { version: 2 } });

    const lockName = basename(lockPath);
    expect((await readdir(store.directoryPath)).filter((name) =>
      name === lockName || name.startsWith(`${lockName}.`)
    )).toEqual([]);
  }, 20_000);

  it("preserves the authoritative record when a process exits after temp fsync", async () => {
    const { dataDir, store } = await makeStore();
    const original = expectCreated(await store.create(makePlanInput("plan-2")));
    const path = store.planPath("plan-2");
    const readyPath = join(dataDir, "temp-synced");
    const worker = startFaultWorker(["after-temp-fsync", path, readyPath]);

    await waitForFile(readyPath);
    await expect(worker.exited).resolves.toMatchObject({ signal: "SIGKILL" });
    await expect(store.load("plan-2")).resolves.toEqual({ ok: true, plan: original });
    expect((await readdir(store.directoryPath)).some((name) =>
      name.startsWith("plan-2.json.") && name.endsWith(".tmp")
    )).toBe(true);
  }, 20_000);

  it("keeps a stale live owner across different locale and timezone environments", async () => {
    const { lockOwner, contenderResult } = await contendWithLiveOwner({
      ownerEnv: {
        LC_ALL: "C",
        LANG: "C",
        TZ: "Pacific/Honolulu",
      },
      contenderEnv: {
        LC_ALL: "en_US.UTF-8",
        LANG: "en_US.UTF-8",
        TZ: "Asia/Tokyo",
      },
    });
    expect(contenderResult).toEqual({
      outcome: "timeout",
      ownerAlive: true,
      observedIdentity: lockOwner.processStartIdentity,
    });
  }, 20_000);

  it.skipIf(process.platform === "linux" || process.platform === "win32")(
    "keeps a live owner whose ps identity falls back to runtime",
    async () => {
      const { lockOwner, contenderResult } = await contendWithLiveOwner({
        ownerCannotRunPs: true,
      });
      expect(lockOwner.processStartIdentity).toMatchObject({
        reliability: "fallback",
        scheme: "runtime",
      });
      expect(contenderResult).toMatchObject({
        outcome: "timeout",
        ownerAlive: true,
        observedIdentity: {
          reliability: "reliable",
          scheme: `${process.platform}-ps-lstart`,
        },
      });
    },
    20_000,
  );

  it.skipIf(process.platform === "linux" || process.platform === "win32")(
    "keeps a reliable live owner when the contender cannot run ps",
    async () => {
      const { lockOwner, contenderResult } = await contendWithLiveOwner({
        contenderCannotRunPs: true,
      });
      expect(lockOwner.processStartIdentity).toMatchObject({
        reliability: "reliable",
        scheme: `${process.platform}-ps-lstart`,
      });
      expect(contenderResult).toEqual({
        outcome: "timeout",
        ownerAlive: true,
        observedIdentity: null,
      });
    },
    20_000,
  );

  it("cleans temporary and published lock files after ordinary failure", async () => {
    const { store } = await makeStore();
    const lockPath = planLockPath(store.directoryPath, "ordinary-failure");

    await expect(acquirePlanLock(store.directoryPath, "ordinary-failure", {
      afterOwnerPublish: async () => {
        throw new Error("ordinary failure");
      },
    })).rejects.toThrow("ordinary failure");

    const lockName = basename(lockPath);
    expect((await readdir(store.directoryPath)).filter((name) =>
      name === lockName || name.startsWith(`${lockName}.`)
    )).toEqual([]);
  });
});
