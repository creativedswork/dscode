import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

export interface LockOwner {
  ownerPid: number;
  processStartIdentity: ProcessStartIdentity;
  createdAt: number;
  token: string;
}

export type ProcessAliveCheck = (pid: number) => boolean;
export interface ProcessStartIdentity {
  reliability: "reliable" | "fallback";
  scheme: string;
  value: string;
}
export type ProcessStartIdentityReader =
  (pid: number) => ProcessStartIdentity | undefined;

function isErrno(error: unknown, code: string): boolean {
  return error instanceof Error
    && "code" in error
    && (error as NodeJS.ErrnoException).code === code;
}

export function defaultIsProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return isErrno(error, "EPERM");
  }
}

const UNIX_PROCESS_IDENTITY_ENV = {
  LC_ALL: "C",
  LANG: "C",
  TZ: "UTC",
  PATH: process.env.PATH || "/usr/bin:/bin",
};

export function defaultProcessStartIdentity(pid: number): ProcessStartIdentity | undefined {
  try {
    if (process.platform === "linux") {
      const value = readFileSync(`/proc/${pid}/stat`, "utf8");
      const fields = value.slice(value.lastIndexOf(")") + 2).trim().split(/\s+/);
      return fields[19]
        ? {
            reliability: "reliable",
            scheme: "linux-proc-start-ticks",
            value: fields[19],
          }
        : undefined;
    }
    if (process.platform === "win32") {
      const value = execFileSync("powershell.exe", [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        `(Get-Process -Id ${pid} -ErrorAction Stop).StartTime.ToUniversalTime().Ticks`,
      ], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
      return value
        ? {
            reliability: "reliable",
            scheme: "win32-start-time-ticks",
            value,
          }
        : undefined;
    }
    const value = execFileSync("ps", ["-o", "lstart=", "-p", String(pid)], {
      encoding: "utf8",
      env: UNIX_PROCESS_IDENTITY_ENV,
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return value
      ? {
          reliability: "reliable",
          scheme: `${process.platform}-ps-lstart`,
          value,
        }
      : undefined;
  } catch {
    return undefined;
  }
}

export function isProcessStartIdentity(value: unknown): value is ProcessStartIdentity {
  if (typeof value !== "object" || value === null) return false;
  const identity = value as Partial<ProcessStartIdentity>;
  if (
    (identity.reliability !== "reliable" && identity.reliability !== "fallback")
    || typeof identity.scheme !== "string"
    || identity.scheme.length === 0
    || typeof identity.value !== "string"
    || identity.value.length === 0
  ) return false;
  return identity.reliability === "fallback"
    ? identity.scheme === "runtime"
    : identity.scheme !== "runtime";
}

function exceedsStaleThreshold(
  timestamp: number,
  observedAt: number,
  staleAfterMs: number,
): boolean {
  const age = observedAt - timestamp;
  return Number.isFinite(age) && age >= 0 && age > staleAfterMs;
}

function isOwnerTimestampStale(
  createdAt: number,
  observedAt: number,
  staleAfterMs: number,
): boolean | undefined {
  const ownerAge = observedAt - createdAt;
  return Number.isFinite(ownerAge) && ownerAge >= 0
    ? ownerAge > staleAfterMs
    : undefined;
}

function isOwnerAlive(
  owner: LockOwner,
  isProcessAlive: ProcessAliveCheck,
  getProcessStartIdentity: ProcessStartIdentityReader,
): boolean {
  if (!isProcessAlive(owner.ownerPid)) return false;
  const currentIdentity = getProcessStartIdentity(owner.ownerPid);
  if (
    currentIdentity === undefined
    || owner.processStartIdentity.reliability !== "reliable"
    || currentIdentity.reliability !== "reliable"
    || owner.processStartIdentity.scheme !== currentIdentity.scheme
  ) return true;
  return owner.processStartIdentity.value === currentIdentity.value;
}

export function isOwnedLockRecoverable(
  owner: LockOwner,
  modifiedAt: number,
  observedAt: number,
  staleAfterMs: number,
  isProcessAlive: ProcessAliveCheck,
  getProcessStartIdentity: ProcessStartIdentityReader,
): boolean {
  const ownerTimestampStale = isOwnerTimestampStale(
    owner.createdAt,
    observedAt,
    staleAfterMs,
  );
  if (ownerTimestampStale === false) return false;
  if (isOwnerAlive(owner, isProcessAlive, getProcessStartIdentity)) return false;
  return ownerTimestampStale === true
    || exceedsStaleThreshold(modifiedAt, observedAt, staleAfterMs);
}

export function isStaleFile(
  modifiedAt: number,
  observedAt: number,
  staleAfterMs: number,
): boolean {
  return exceedsStaleThreshold(modifiedAt, observedAt, staleAfterMs);
}
