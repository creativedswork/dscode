import { spawn, type ChildProcess, type SpawnOptions } from "node:child_process";
import { isDeepStrictEqual } from "node:util";

import type { Logger } from "../utils/logger.js";
import type {
  ManagedServiceController,
  ManagedServiceHandle,
  ManagedServiceHealthPolicy,
  ManagedServiceOwnership,
  ManagedServiceSnapshot,
  ManagedServiceSpec,
  ManagedServiceStatus,
} from "./types.js";

type ServiceLogger = Pick<Logger, "debug" | "info" | "warn" | "error">;
type SpawnProcess = (command: string, args: readonly string[], options: SpawnOptions) => ChildProcess;
type KillProcess = (child: ChildProcess, signal: NodeJS.Signals) => void;

export interface ServiceSupervisorOptions {
  readonly spawnProcess?: SpawnProcess;
  readonly killProcess?: KillProcess;
  readonly now?: () => number;
  readonly environment?: Readonly<Record<string, string | undefined>>;
}

interface ServiceRecord {
  readonly spec: ManagedServiceSpec;
  ownership: ManagedServiceOwnership;
  status: ManagedServiceStatus;
  healthy: boolean;
  child?: ChildProcess;
  healthAbort?: AbortController;
  restartTimes: number[];
  stopPromise?: Promise<void>;
  handle: ManagedServiceHandle;
}

function abortError(message = "Managed service operation aborted"): Error {
  const error = new Error(message);
  error.name = "AbortError";
  return error;
}

function isRunning(child: ChildProcess | undefined): child is ChildProcess {
  return child !== undefined && child.exitCode === null && child.signalCode === null;
}

function defaultKillProcess(child: ChildProcess, signal: NodeJS.Signals): void {
  if (process.platform !== "win32" && child.pid !== undefined) {
    try {
      process.kill(-child.pid, signal);
      return;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ESRCH") return;
    }
  }
  child.kill(signal);
}

export class ServiceSupervisor implements ManagedServiceController {
  private readonly records = new Map<string, ServiceRecord>();
  private readonly spawnProcess: SpawnProcess;
  private readonly killProcess: KillProcess;
  private readonly now: () => number;
  private readonly environment: Readonly<Record<string, string | undefined>>;
  private shuttingDown = false;
  private shutdownPromise?: Promise<void>;

  constructor(
    private readonly logger: ServiceLogger,
    options: ServiceSupervisorOptions = {},
  ) {
    this.spawnProcess = options.spawnProcess ?? ((command, args, spawnOptions) =>
      spawn(command, [...args], spawnOptions));
    this.killProcess = options.killProcess ?? defaultKillProcess;
    this.now = options.now ?? Date.now;
    this.environment = options.environment ?? {};
  }

  async ensure(spec: ManagedServiceSpec, signal?: AbortSignal): Promise<ManagedServiceHandle> {
    if (this.shuttingDown) throw new Error("ServiceSupervisor is shutting down");
    if (signal?.aborted) throw abortError();

    const existing = this.records.get(spec.id);
    if (existing) {
      const reusable = isDeepStrictEqual(existing.spec, spec)
        && !["failed", "stopped", "stopping"].includes(existing.status);
      if (reusable) return existing.handle;

      existing.healthAbort?.abort();
      if (existing.ownership === "owned") await this.stop(spec.id);
      this.deleteRecord(existing);
    }

    const record = this.createRecord(spec);
    this.records.set(spec.id, record);

    if (spec.health) {
      record.status = "checking";
      const preflightController = new AbortController();
      record.healthAbort = preflightController;
      const abortFromCaller = () => preflightController.abort();
      signal?.addEventListener("abort", abortFromCaller, { once: true });
      let externalHealthy: boolean;
      try {
        externalHealthy = await this.probeOnce(
          spec.health,
          preflightController.signal,
          spec.health.preflightTimeoutMs ?? Math.min(2000, spec.health.timeoutMs),
        );
      } catch (error) {
        this.deleteRecord(record);
        throw signal?.aborted ? abortError() : error;
      } finally {
        signal?.removeEventListener("abort", abortFromCaller);
        if (record.healthAbort === preflightController) record.healthAbort = undefined;
      }
      if (externalHealthy) {
        record.status = "healthy";
        record.healthy = true;
        this.logger.info(this.tag(spec.id), "Using externally managed healthy service");
        return record.handle;
      }
    }

    if (signal?.aborted || this.shuttingDown) {
      this.deleteRecord(record);
      throw signal?.aborted
        ? abortError()
        : new Error("ServiceSupervisor is shutting down");
    }

    record.ownership = "owned";
    const child = this.spawnOwned(record);
    if (!child) return record.handle;

    if (!spec.health) {
      record.status = "healthy";
      record.healthy = true;
      return record.handle;
    }

    const healthy = await this.pollReadiness(record, child, signal);
    if (record.child === child && record.status !== "failed") {
      record.healthy = healthy;
      record.status = healthy ? "healthy" : "unhealthy";
    }
    return record.handle;
  }

  async stop(id: string): Promise<void> {
    const record = this.records.get(id);
    if (!record || record.ownership === "external") return;
    if (!record.stopPromise) {
      record.stopPromise = this.stopOwnedRecord(record);
    }
    return record.stopPromise;
  }

  shutdown(): Promise<void> {
    if (this.shutdownPromise) return this.shutdownPromise;
    this.shuttingDown = true;
    for (const record of this.records.values()) {
      record.healthAbort?.abort();
    }
    this.shutdownPromise = Promise.all(
      [...this.records.values()]
        .filter((record) => record.ownership === "owned")
        .map((record) => {
          if (!record.stopPromise) record.stopPromise = this.stopOwnedRecord(record);
          return record.stopPromise;
        }),
    ).then(() => undefined);
    return this.shutdownPromise;
  }

  getSnapshot(id: string): ManagedServiceSnapshot | undefined {
    return this.records.get(id)?.handle.snapshot();
  }

  private createRecord(spec: ManagedServiceSpec): ServiceRecord {
    const record: ServiceRecord = {
      spec,
      ownership: "external" as ManagedServiceOwnership,
      status: "checking" as ManagedServiceStatus,
      healthy: false,
      restartTimes: [],
      handle: undefined as unknown as ManagedServiceHandle,
    };

    record.handle = {
      get id() { return record.spec.id; },
      get ownership() { return record.ownership; },
      get status() { return record.status; },
      get healthy() { return record.healthy; },
      get pid() { return record.child?.pid; },
      snapshot: () => Object.freeze({
        id: record.spec.id,
        ownership: record.ownership,
        status: record.status,
        healthy: record.healthy,
        pid: record.child?.pid,
        restartCount: record.restartTimes.length,
      }),
      stop: () => this.stop(record.spec.id),
    };

    return record;
  }

  private deleteRecord(record: ServiceRecord): void {
    if (this.records.get(record.spec.id) === record) {
      this.records.delete(record.spec.id);
    }
  }

  private spawnOwned(record: ServiceRecord): ChildProcess | undefined {
    const { command } = record.spec;
    record.healthAbort?.abort();
    record.healthAbort = undefined;
    record.status = "starting";
    record.healthy = false;

    let child: ChildProcess;
    try {
      child = this.spawnProcess(command.executable, command.args, {
        cwd: command.cwd,
        env: { ...this.environment, ...command.env },
        stdio: ["ignore", "pipe", "pipe"],
        detached: process.platform !== "win32",
      });
    } catch (error) {
      record.status = "failed";
      this.logger.error(this.tag(record.spec.id), `Spawn failed: ${this.errorMessage(error)}`);
      return undefined;
    }

    record.child = child;
    this.logger.info(
      this.tag(record.spec.id),
      `Started owned service${child.pid === undefined ? "" : ` (pid ${child.pid})`}`,
    );

    child.stdout?.on("data", (chunk: Buffer | string) => {
      const message = String(chunk).trim();
      if (message) this.logger.debug(this.tag(record.spec.id), `stdout: ${message}`);
    });
    child.stderr?.on("data", (chunk: Buffer | string) => {
      const message = String(chunk).trim();
      if (message) this.logger.warn(this.tag(record.spec.id), `stderr: ${message}`);
    });
    child.once("error", (error) => {
      if (record.child !== child) return;
      record.status = "failed";
      record.healthy = false;
      record.healthAbort?.abort();
      this.logger.error(this.tag(record.spec.id), `Spawn failed: ${this.errorMessage(error)}`);
    });
    child.once("exit", (code, signal) => {
      void this.handleExit(record, child, code, signal);
    });

    return child;
  }

  private async handleExit(
    record: ServiceRecord,
    child: ChildProcess,
    code: number | null,
    signal: NodeJS.Signals | null,
  ): Promise<void> {
    if (record.child !== child) return;
    record.child = undefined;
    record.healthAbort?.abort();
    record.healthAbort = undefined;
    record.healthy = false;

    const detail = signal ? `signal ${signal}` : `code ${code ?? "unknown"}`;
    this.logger.info(this.tag(record.spec.id), `Service exited with ${detail}`);

    if (this.shuttingDown || record.status === "stopping") {
      record.status = "stopped";
      return;
    }
    if (code === 0 && signal === null) {
      record.status = "stopped";
      return;
    }

    const now = this.now();
    const windowStart = now - record.spec.restart.rapidRestartWindowMs;
    record.restartTimes = record.restartTimes.filter((time) => time >= windowStart);
    if (record.restartTimes.length >= record.spec.restart.maxRapidRestarts) {
      record.status = "failed";
      this.logger.warn(
        this.tag(record.spec.id),
        `Restart budget exhausted after ${record.restartTimes.length} rapid restart(s)`,
      );
      return;
    }

    record.restartTimes.push(now);
    this.logger.info(
      this.tag(record.spec.id),
      `Restarting service (attempt ${record.restartTimes.length})`,
    );
    const replacement = this.spawnOwned(record);
    if (!replacement) return;

    if (!record.spec.health) {
      record.status = "healthy";
      record.healthy = true;
      return;
    }

    try {
      const healthy = await this.pollReadiness(record, replacement);
      if (record.child === replacement && record.status !== "failed") {
        record.healthy = healthy;
        record.status = healthy ? "healthy" : "unhealthy";
      }
    } catch (error) {
      if ((error as Error).name !== "AbortError") {
        this.logger.warn(this.tag(record.spec.id), `Restart health check failed: ${this.errorMessage(error)}`);
      }
    }
  }

  private async pollReadiness(
    record: ServiceRecord,
    child: ChildProcess,
    signal?: AbortSignal,
  ): Promise<boolean> {
    const health = record.spec.health;
    if (!health) return true;

    const controller = new AbortController();
    record.healthAbort = controller;
    const abortFromCaller = () => controller.abort();
    signal?.addEventListener("abort", abortFromCaller, { once: true });
    const deadline = this.now() + health.timeoutMs;

    try {
      while (this.now() < deadline) {
        if (signal?.aborted) throw abortError();
        if (controller.signal.aborted || record.child !== child || record.status === "failed") {
          return false;
        }

        const remaining = deadline - this.now();
        const healthy = await this.probeOnce(
          health,
          controller.signal,
          Math.min(Math.max(health.intervalMs, 100), remaining),
        );
        if (healthy) {
          this.logger.info(this.tag(record.spec.id), "Service is healthy");
          return true;
        }

        const delayMs = Math.min(health.intervalMs, deadline - this.now());
        if (delayMs > 0) await this.delay(delayMs, controller.signal);
      }
    } catch (error) {
      if (signal?.aborted) throw abortError();
      if ((error as Error).name !== "AbortError") throw error;
      return false;
    } finally {
      signal?.removeEventListener("abort", abortFromCaller);
      if (record.healthAbort === controller) record.healthAbort = undefined;
    }

    this.logger.warn(
      this.tag(record.spec.id),
      `Service did not become healthy within ${health.timeoutMs}ms`,
    );
    return false;
  }

  private async probeOnce(
    health: ManagedServiceHealthPolicy,
    signal: AbortSignal | undefined,
    timeoutMs: number,
  ): Promise<boolean> {
    if (signal?.aborted) throw abortError();

    const controller = new AbortController();
    let timedOut = false;
    const abortFromCaller = () => controller.abort();
    signal?.addEventListener("abort", abortFromCaller, { once: true });
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, Math.max(1, timeoutMs));

    try {
      const aborted = new Promise<never>((_, reject) => {
        controller.signal.addEventListener("abort", () => reject(abortError()), { once: true });
      });
      return await Promise.race([health.probe(controller.signal), aborted]);
    } catch (error) {
      if (signal?.aborted) throw abortError();
      if (timedOut || (error as Error).name === "AbortError") return false;
      this.logger.debug("ServiceProbe", `Health probe failed: ${this.errorMessage(error)}`);
      return false;
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", abortFromCaller);
    }
  }

  private async stopOwnedRecord(record: ServiceRecord): Promise<void> {
    record.healthAbort?.abort();
    record.healthAbort = undefined;
    const child = record.child;
    if (!isRunning(child)) {
      record.status = "stopped";
      record.healthy = false;
      return;
    }

    record.status = "stopping";
    record.healthy = false;
    const exited = new Promise<boolean>((resolve) => {
      child.once("exit", () => resolve(true));
    });

    this.logger.info(this.tag(record.spec.id), "Stopping owned service with SIGTERM");
    this.killProcess(child, "SIGTERM");
    const graceful = await Promise.race([
      exited,
      this.delay(record.spec.shutdown.graceMs).then(() => false),
    ]);

    if (!graceful && isRunning(child)) {
      this.logger.warn(this.tag(record.spec.id), "Grace period expired; sending SIGKILL");
      this.killProcess(child, "SIGKILL");
    }
    record.status = "stopped";
    record.healthy = false;
  }

  private delay(ms: number, signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) return Promise.reject(abortError());
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        signal?.removeEventListener("abort", onAbort);
        resolve();
      }, Math.max(0, ms));
      const onAbort = () => {
        clearTimeout(timer);
        reject(abortError());
      };
      signal?.addEventListener("abort", onAbort, { once: true });
    });
  }

  private tag(id: string): string {
    return `Service/${id}`;
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
