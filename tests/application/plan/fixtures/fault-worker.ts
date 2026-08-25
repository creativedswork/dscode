import {
  access,
  writeFile,
} from "node:fs/promises";

import {
  acquirePlanLock,
  PlanLockTimeoutError,
} from "../../../../src/application/plan/lock.js";
import {
  defaultIsProcessAlive,
  defaultProcessStartIdentity,
} from "../../../../src/application/plan/lock-owner.js";
import { resolvePlanProjectLocation } from "../../../../src/application/plan/path.js";
import { writeJsonAtomically } from "../../../../src/application/plan/storage-io.js";

async function waitForFile(path: string): Promise<void> {
  while (true) {
    try {
      await access(path);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
  }
}

async function crashAt(markerPath: string): Promise<never> {
  await writeFile(markerPath, "reached\n", "utf8");
  process.kill(process.pid, "SIGKILL");
  return new Promise<never>(() => {});
}

const [mode, first, second, third, fourth, fifth] = process.argv.slice(2);

if (mode === "before-owner-publish" || mode === "after-owner-publish") {
  if (!first || !second || !third || !fourth) throw new Error("Missing lock crash argument");
  const directory = resolvePlanProjectLocation(first, second).directory;
  await acquirePlanLock(directory, third, {
    beforeOwnerPublish: mode === "before-owner-publish"
      ? () => crashAt(fourth)
      : undefined,
    afterOwnerPublish: mode === "after-owner-publish"
      ? () => crashAt(fourth)
      : undefined,
  });
  throw new Error("Expected lock publisher to terminate");
}

if (mode === "hold-lock") {
  if (!first || !second || !third || !fourth) throw new Error("Missing live lock argument");
  if (!fifth) throw new Error("Missing live lock release path");
  const directory = resolvePlanProjectLocation(first, second).directory;
  const release = await acquirePlanLock(directory, third);
  await writeFile(fourth, "acquired\n", "utf8");
  await waitForFile(fifth);
  await release();
  process.exit(0);
}

if (mode === "contend-lock") {
  if (!first || !second || !third || !fourth) throw new Error("Missing contender argument");
  if (!fifth) throw new Error("Missing owner PID");
  const directory = resolvePlanProjectLocation(first, second).directory;
  const ownerPid = Number(fifth);
  const ownerAlive = defaultIsProcessAlive(ownerPid);
  const observedIdentity = defaultProcessStartIdentity(ownerPid) ?? null;
  try {
    const release = await acquirePlanLock(directory, third, {
      staleAfterMs: 5,
      waitTimeoutMs: 50,
      retryDelayMs: 1,
    });
    await release();
    await writeFile(
      fourth,
      `${JSON.stringify({ outcome: "acquired", ownerAlive, observedIdentity })}\n`,
      "utf8",
    );
  } catch (error) {
    if (!(error instanceof PlanLockTimeoutError)) throw error;
    await writeFile(
      fourth,
      `${JSON.stringify({ outcome: "timeout", ownerAlive, observedIdentity })}\n`,
      "utf8",
    );
  }
  process.exit(0);
}

if (mode === "after-temp-fsync") {
  if (!first || !second) throw new Error("Missing atomic write crash argument");
  await writeJsonAtomically(first, { incomplete: true }, () => crashAt(second));
  throw new Error("Expected atomic writer to terminate");
}

throw new Error(`Unsupported fault worker mode: ${mode}`);
