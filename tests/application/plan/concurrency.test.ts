import { spawn } from "node:child_process";
import {
  access,
  mkdtemp,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

import {
  PlanStore,
  planLockPath,
} from "../../../src/application/plan/index.js";
import { makePlanInput } from "./helpers.js";

const temporaryDirectories: string[] = [];
const workerPath = fileURLToPath(new URL("./fixtures/update-worker.ts", import.meta.url));

interface Worker {
  done: Promise<unknown>;
}

function startWorker(args: string[]): Worker {
  const child = spawn(process.execPath, ["--import", "tsx", workerPath, ...args], {
    cwd: process.cwd(),
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => { stdout += chunk; });
  child.stderr.on("data", (chunk: string) => { stderr += chunk; });
  return {
    done: new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("exit", (code) => {
        if (code !== 0) {
          reject(new Error(`PlanStore worker exited ${code}: ${stderr}`));
          return;
        }
        resolve(JSON.parse(stdout));
      });
    }),
  };
}

async function waitForFiles(paths: string[]): Promise<void> {
  const deadline = Date.now() + 10_000;
  for (const path of paths) {
    while (true) {
      try {
        await access(path);
        break;
      } catch {
        if (Date.now() >= deadline) throw new Error(`Timed out waiting for ${path}`);
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    }
  }
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) =>
    rm(path, { recursive: true, force: true }),
  ));
});

describe("PlanStore cross-process locking", () => {
  it("allows only one process to commit a shared expectedVersion", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "dscode-plan-process-"));
    temporaryDirectories.push(dataDir);
    const projectPath = "/workspace/shared-project";
    const store = new PlanStore({ dataDir, projectPath });
    await store.create(makePlanInput());
    const startPath = join(dataDir, "start");
    const readyPaths = [join(dataDir, "ready-1"), join(dataDir, "ready-2")];
    const lockAcquiredPath = join(dataDir, "lock-acquired");
    const lockReleasePath = join(dataDir, "lock-release");
    const first = startWorker([
      dataDir,
      projectPath,
      "plan-1",
      readyPaths[0],
      startPath,
      "awaiting_decision",
      lockAcquiredPath,
      lockReleasePath,
    ]);

    await waitForFiles([readyPaths[0]]);
    await writeFile(startPath, "go\n", "utf8");
    await waitForFiles([lockAcquiredPath]);
    const second = startWorker([
      dataDir,
      projectPath,
      "plan-1",
      readyPaths[1],
      startPath,
      "awaiting_approval",
    ]);
    await waitForFiles([readyPaths[1]]);
    await writeFile(lockReleasePath, "release\n", "utf8");
    const [firstResult, secondResult] = await Promise.all([first.done, second.done]);

    expect(firstResult).toMatchObject({ ok: true, plan: { version: 2 } });
    expect(secondResult).toMatchObject({
      ok: false,
      reason: "conflict",
      conflict: { expectedVersion: 1, currentVersion: 2 },
    });
    const loaded = await store.load("plan-1");
    expect(loaded.ok && loaded.plan?.version).toBe(2);
    await expect(access(planLockPath(store.directoryPath, "plan-1")))
      .rejects.toMatchObject({ code: "ENOENT" });
  }, 20_000);
});
