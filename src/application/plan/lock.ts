import { randomUUID } from "node:crypto";
import { link, open, readFile, rename, stat, unlink } from "node:fs/promises";
import { join } from "node:path";

import {
  defaultIsProcessAlive,
  defaultProcessStartIdentity,
  isOwnedLockRecoverable,
  isProcessStartIdentity,
  isStaleFile,
} from "./lock-owner.js";
import type {
  LockOwner,
  ProcessAliveCheck,
  ProcessStartIdentity,
  ProcessStartIdentityReader,
} from "./lock-owner.js";

type LockState =
  | { kind: "missing" }
  | { kind: "malformed"; modifiedAt: number }
  | { kind: "owned"; owner: LockOwner; modifiedAt: number };

export interface PlanLockOptions {
  staleAfterMs?: number;
  waitTimeoutMs?: number;
  retryDelayMs?: number;
  now?: () => number;
  isProcessAlive?: (pid: number) => boolean;
  getProcessStartIdentity?: ProcessStartIdentityReader;
  beforeOwnerPublish?: (temporaryPath: string, lockPath: string) => Promise<void>;
  afterOwnerPublish?: (lockPath: string) => Promise<void>;
}

export class PlanLockTimeoutError extends Error {
  constructor(planId: string) {
    super(`Timed out waiting for Plan lock: ${planId}`);
    this.name = "PlanLockTimeoutError";
  }
}

function isErrno(error: unknown, code: string): boolean {
  return error instanceof Error
    && "code" in error
    && (error as NodeJS.ErrnoException).code === code;
}

const RUNTIME_PROCESS_START_IDENTITY: ProcessStartIdentity = {
  reliability: "fallback",
  scheme: "runtime",
  value: randomUUID(),
};
const PROCESS_START_IDENTITY =
  defaultProcessStartIdentity(process.pid) ?? RUNTIME_PROCESS_START_IDENTITY;

async function readLockState(path: string): Promise<LockState> {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (error) {
    if (isErrno(error, "ENOENT")) return { kind: "missing" };
    throw error;
  }
  let owner: LockOwner | undefined;
  try {
    const value = JSON.parse(text) as Partial<LockOwner>;
    const processStartIdentity = isProcessStartIdentity(value.processStartIdentity)
      ? value.processStartIdentity
      : undefined;
    if (
      Number.isInteger(value.ownerPid)
      && Number(value.ownerPid) > 0
      && processStartIdentity !== undefined
      && typeof value.createdAt === "number"
      && typeof value.token === "string"
    ) {
      owner = {
        ownerPid: Number(value.ownerPid),
        processStartIdentity,
        createdAt: value.createdAt,
        token: value.token,
      };
    }
  } catch {
    // A malformed lock is recoverable only after its file age exceeds the stale threshold.
  }
  try {
    const modifiedAt = (await stat(path)).mtimeMs;
    return owner
      ? { kind: "owned", owner, modifiedAt }
      : { kind: "malformed", modifiedAt };
  } catch (error) {
    if (isErrno(error, "ENOENT")) return { kind: "missing" };
    throw error;
  }
}

function ownerTemporaryPath(path: string, owner: LockOwner): string {
  return `${path}.${owner.ownerPid}.${owner.token}.tmp`;
}

async function unlinkIfExists(path: string): Promise<void> {
  try {
    await unlink(path);
  } catch (error) {
    if (!isErrno(error, "ENOENT")) throw error;
  }
}

async function removeIfOwned(path: string, token: string): Promise<void> {
  const state = await readLockState(path);
  if (state.kind !== "owned" || state.owner.token !== token) return;
  await unlinkIfExists(path);
  await unlinkIfExists(ownerTemporaryPath(path, state.owner));
}

async function removeMalformed(path: string): Promise<boolean> {
  const quarantinePath = `${path}.stale.${randomUUID()}`;
  try {
    await rename(path, quarantinePath);
  } catch (error) {
    if (isErrno(error, "ENOENT")) return true;
    throw error;
  }
  await unlinkIfExists(quarantinePath);
  return true;
}

async function writeOwner(
  path: string,
  owner: LockOwner,
  options: Pick<PlanLockOptions, "beforeOwnerPublish" | "afterOwnerPublish"> = {},
): Promise<void> {
  const temporaryPath = ownerTemporaryPath(path, owner);
  let published = false;
  let failure: unknown;
  try {
    const handle = await open(temporaryPath, "wx", 0o600);
    try {
      await handle.writeFile(`${JSON.stringify(owner)}\n`, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    await options.beforeOwnerPublish?.(temporaryPath, path);
    await link(temporaryPath, path);
    published = true;
    await options.afterOwnerPublish?.(path);
  } catch (error) {
    failure = error;
  }
  try {
    await unlinkIfExists(temporaryPath);
  } catch (error) {
    failure ??= error;
  }
  if (failure !== undefined) {
    if (published) await removeIfOwned(path, owner.token);
    throw failure;
  }
}

async function recoverStaleMarker(
  path: string,
  staleAfterMs: number,
  now: () => number,
  isProcessAlive: ProcessAliveCheck,
  getProcessStartIdentity: ProcessStartIdentityReader,
): Promise<boolean> {
  const state = await readLockState(path);
  if (state.kind === "missing") return true;
  if (state.kind === "malformed") {
    return isStaleFile(state.modifiedAt, now(), staleAfterMs)
      ? removeMalformed(path)
      : false;
  }
  if (!isOwnedLockRecoverable(
    state.owner,
    state.modifiedAt,
    now(),
    staleAfterMs,
    isProcessAlive,
    getProcessStartIdentity,
  )) return false;
  await removeIfOwned(path, state.owner.token);
  return true;
}

async function recoverStaleLock(
  lockPath: string,
  owner: LockOwner,
  staleAfterMs: number,
  now: () => number,
  isProcessAlive: ProcessAliveCheck,
  getProcessStartIdentity: ProcessStartIdentityReader,
): Promise<boolean> {
  const recoveryPath = `${lockPath}.recovery`;
  try {
    await writeOwner(recoveryPath, owner);
  } catch (error) {
    if (!isErrno(error, "EEXIST")) throw error;
    await recoverStaleMarker(
      recoveryPath,
      staleAfterMs,
      now,
      isProcessAlive,
      getProcessStartIdentity,
    );
    return false;
  }
  try {
    const state = await readLockState(lockPath);
    if (state.kind === "missing") return true;
    if (state.kind === "malformed") {
      return isStaleFile(state.modifiedAt, now(), staleAfterMs)
        ? removeMalformed(lockPath)
        : false;
    }
    if (!isOwnedLockRecoverable(
      state.owner,
      state.modifiedAt,
      now(),
      staleAfterMs,
      isProcessAlive,
      getProcessStartIdentity,
    )) return false;
    await removeIfOwned(lockPath, state.owner.token);
    return true;
  } finally {
    await removeIfOwned(recoveryPath, owner.token);
  }
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export function planLockPath(directory: string, planId: string): string {
  return join(directory, `.${planId}.lock`);
}

export async function acquirePlanLock(
  directory: string,
  planId: string,
  options: PlanLockOptions = {},
): Promise<() => Promise<void>> {
  const staleAfterMs = options.staleAfterMs ?? 30_000;
  const waitTimeoutMs = options.waitTimeoutMs ?? 10_000;
  const retryDelayMs = options.retryDelayMs ?? 10;
  const now = options.now ?? Date.now;
  const isProcessAlive = options.isProcessAlive ?? defaultIsProcessAlive;
  const getProcessStartIdentity = options.getProcessStartIdentity
    ?? defaultProcessStartIdentity;
  const lockPath = planLockPath(directory, planId);
  const deadline = now() + waitTimeoutMs;
  const processStartIdentity = options.getProcessStartIdentity
    ? options.getProcessStartIdentity(process.pid) ?? RUNTIME_PROCESS_START_IDENTITY
    : PROCESS_START_IDENTITY;

  while (true) {
    const owner: LockOwner = {
      ownerPid: process.pid,
      processStartIdentity,
      createdAt: now(),
      token: randomUUID(),
    };
    try {
      await writeOwner(lockPath, owner, options);
      return () => removeIfOwned(lockPath, owner.token);
    } catch (error) {
      if (!isErrno(error, "EEXIST")) throw error;
    }
    const recovered = await recoverStaleLock(
      lockPath,
      owner,
      staleAfterMs,
      now,
      isProcessAlive,
      getProcessStartIdentity,
    );
    if (recovered) continue;
    if (now() >= deadline) throw new PlanLockTimeoutError(planId);
    await delay(retryDelayMs);
  }
}
