import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import type { ChildProcess } from "node:child_process";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ServiceSupervisor } from "../../src/services/service-supervisor.js";
import type { ManagedServiceSpec } from "../../src/services/types.js";

interface FakeChild extends ChildProcess {
  finish(code: number | null, signal?: NodeJS.Signals | null): void;
}

function makeChild(pid: number): FakeChild {
  const child = new EventEmitter() as FakeChild;
  Object.assign(child, {
    pid,
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    stdin: null,
    stdio: [],
    connected: false,
    killed: false,
    exitCode: null,
    signalCode: null,
    kill: vi.fn(),
    ref: vi.fn(),
    unref: vi.fn(),
    disconnect: vi.fn(),
    send: vi.fn(),
  });
  child.finish = (code, signal = null) => {
    Object.defineProperty(child, "exitCode", { value: code, writable: true, configurable: true });
    Object.defineProperty(child, "signalCode", { value: signal, writable: true, configurable: true });
    child.emit("exit", code, signal);
  };
  return child;
}

function makeLogger() {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

function makeSpec(overrides: Partial<ManagedServiceSpec> = {}): ManagedServiceSpec {
  return {
    id: "demo",
    command: {
      executable: "demo-service",
      args: ["--serve"],
      cwd: "/tmp",
      env: { DEMO_PORT: "1234" },
    },
    restart: {
      maxRapidRestarts: 3,
      rapidRestartWindowMs: 5000,
    },
    shutdown: {
      graceMs: 10,
    },
    ...overrides,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("ServiceSupervisor", () => {
  it("uses an already healthy service as external and never owns it", async () => {
    const logger = makeLogger();
    const spawnProcess = vi.fn();
    const killProcess = vi.fn();
    const supervisor = new ServiceSupervisor(logger, { spawnProcess, killProcess });
    const spec = makeSpec({
      health: {
        probe: vi.fn().mockResolvedValue(true),
        intervalMs: 1,
        timeoutMs: 20,
      },
    });

    const handle = await supervisor.ensure(spec);
    await supervisor.shutdown();

    expect(handle.snapshot()).toMatchObject({
      id: "demo",
      ownership: "external",
      status: "healthy",
      healthy: true,
    });
    expect(spawnProcess).not.toHaveBeenCalled();
    expect(killProcess).not.toHaveBeenCalled();
  });

  it("spawns and health-checks an owned service", async () => {
    const logger = makeLogger();
    const child = makeChild(101);
    const spawnProcess = vi.fn().mockReturnValue(child);
    const probe = vi.fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    const supervisor = new ServiceSupervisor(logger, { spawnProcess, killProcess: vi.fn() });

    const handle = await supervisor.ensure(makeSpec({
      health: { probe, intervalMs: 1, timeoutMs: 20 },
    }));

    expect(handle.snapshot()).toMatchObject({
      ownership: "owned",
      status: "healthy",
      healthy: true,
      pid: 101,
    });
    expect(spawnProcess).toHaveBeenCalledWith(
      "demo-service",
      ["--serve"],
      expect.objectContaining({
        cwd: "/tmp",
        env: expect.objectContaining({ DEMO_PORT: "1234" }),
        stdio: ["ignore", "pipe", "pipe"],
      }),
    );
  });

  it("returns an unhealthy handle after a bounded readiness timeout", async () => {
    const logger = makeLogger();
    const child = makeChild(102);
    const supervisor = new ServiceSupervisor(logger, {
      spawnProcess: vi.fn().mockReturnValue(child),
      killProcess: vi.fn(),
    });

    const handle = await supervisor.ensure(makeSpec({
      health: {
        probe: vi.fn().mockResolvedValue(false),
        intervalMs: 1,
        timeoutMs: 5,
        preflightTimeoutMs: 1,
      },
    }));

    expect(handle.status).toBe("unhealthy");
    expect(handle.healthy).toBe(false);
    expect(logger.warn).toHaveBeenCalledWith(
      "Service/demo",
      expect.stringContaining("did not become healthy"),
    );
  });

  it("cancels preflight health detection without spawning", async () => {
    const logger = makeLogger();
    const spawnProcess = vi.fn();
    const supervisor = new ServiceSupervisor(logger, { spawnProcess });
    const controller = new AbortController();
    const probe = vi.fn((signal: AbortSignal) => {
      if (probe.mock.calls.length > 1) return Promise.resolve(true);
      return new Promise<boolean>((_resolve, reject) => {
        signal.addEventListener("abort", () => {
          const error = new Error("aborted");
          error.name = "AbortError";
          reject(error);
        }, { once: true });
      });
    });
    const spec = makeSpec({
      health: { probe, intervalMs: 1, timeoutMs: 100 },
    });

    const pending = supervisor.ensure(spec, controller.signal);
    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(spawnProcess).not.toHaveBeenCalled();
    await expect(supervisor.ensure(spec)).resolves.toMatchObject({
      ownership: "external",
      healthy: true,
    });
  });

  it("does not spawn when shutdown interrupts a preflight probe", async () => {
    const logger = makeLogger();
    const spawnProcess = vi.fn();
    const supervisor = new ServiceSupervisor(logger, { spawnProcess });
    const probe = vi.fn((signal: AbortSignal) => new Promise<boolean>((_resolve, reject) => {
      signal.addEventListener("abort", () => {
        const error = new Error("aborted");
        error.name = "AbortError";
        reject(error);
      }, { once: true });
    }));

    const pending = supervisor.ensure(makeSpec({
      health: { probe, intervalMs: 1, timeoutMs: 100 },
    }));
    await supervisor.shutdown();

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(spawnProcess).not.toHaveBeenCalled();
  });

  it("restarts unexpected exits within budget and then stops", async () => {
    const logger = makeLogger();
    const first = makeChild(201);
    const second = makeChild(202);
    const spawnProcess = vi.fn()
      .mockReturnValueOnce(first)
      .mockReturnValueOnce(second);
    const supervisor = new ServiceSupervisor(logger, {
      spawnProcess,
      killProcess: vi.fn(),
      now: () => 1000,
    });
    const handle = await supervisor.ensure(makeSpec({
      restart: { maxRapidRestarts: 1, rapidRestartWindowMs: 5000 },
    }));

    first.finish(1);
    await Promise.resolve();
    expect(spawnProcess).toHaveBeenCalledTimes(2);
    expect(handle.pid).toBe(202);

    second.finish(1);
    await Promise.resolve();
    expect(spawnProcess).toHaveBeenCalledTimes(2);
    expect(handle.status).toBe("failed");
    expect(logger.warn).toHaveBeenCalledWith(
      "Service/demo",
      expect.stringContaining("Restart budget exhausted"),
    );
  });

  it("replaces changed specs and recreates stopped services", async () => {
    const first = makeChild(211);
    const second = makeChild(212);
    const third = makeChild(213);
    const spawnProcess = vi.fn()
      .mockReturnValueOnce(first)
      .mockReturnValueOnce(second)
      .mockReturnValueOnce(third);
    const killProcess = vi.fn((child: ChildProcess, signal: NodeJS.Signals) => {
      (child as FakeChild).finish(null, signal);
    });
    const supervisor = new ServiceSupervisor(makeLogger(), {
      spawnProcess,
      killProcess,
    });
    const original = makeSpec();

    const firstHandle = await supervisor.ensure(original);
    const secondHandle = await supervisor.ensure(makeSpec({
      command: {
        ...original.command,
        args: ["--serve", "--port", "5678"],
      },
    }));

    expect(killProcess).toHaveBeenCalledWith(first, "SIGTERM");
    expect(firstHandle.status).toBe("stopped");
    expect(secondHandle.pid).toBe(212);

    second.finish(0);
    await Promise.resolve();
    const thirdHandle = await supervisor.ensure(original);

    expect(spawnProcess).toHaveBeenCalledTimes(3);
    expect(thirdHandle.pid).toBe(213);
  });

  it("routes child stdout and stderr through the scoped logger", async () => {
    const logger = makeLogger();
    const child = makeChild(301);
    const supervisor = new ServiceSupervisor(logger, {
      spawnProcess: vi.fn().mockReturnValue(child),
      killProcess: vi.fn(),
    });

    await supervisor.ensure(makeSpec());
    child.stdout?.emit("data", Buffer.from("ready\n"));
    child.stderr?.emit("data", Buffer.from("warning\n"));

    expect(logger.debug).toHaveBeenCalledWith("Service/demo", "stdout: ready");
    expect(logger.warn).toHaveBeenCalledWith("Service/demo", "stderr: warning");
  });

  it("shuts down owned services once with graceful termination", async () => {
    const logger = makeLogger();
    const child = makeChild(401);
    const killProcess = vi.fn((_child: ChildProcess, signal: NodeJS.Signals) => {
      if (signal === "SIGTERM") child.finish(null, "SIGTERM");
    });
    const supervisor = new ServiceSupervisor(logger, {
      spawnProcess: vi.fn().mockReturnValue(child),
      killProcess,
    });

    await supervisor.ensure(makeSpec());
    const firstShutdown = supervisor.shutdown();
    const secondShutdown = supervisor.shutdown();

    expect(firstShutdown).toBe(secondShutdown);
    await firstShutdown;
    expect(killProcess).toHaveBeenCalledTimes(1);
    expect(killProcess).toHaveBeenCalledWith(child, "SIGTERM");
    expect(supervisor.getSnapshot("demo")?.status).toBe("stopped");
  });

  it("does not stop a service owned by another Host supervisor", async () => {
    const firstChild = makeChild(411);
    const secondChild = makeChild(412);
    const firstKill = vi.fn((_child: ChildProcess, signal: NodeJS.Signals) => {
      firstChild.finish(null, signal);
    });
    const secondKill = vi.fn((_child: ChildProcess, signal: NodeJS.Signals) => {
      secondChild.finish(null, signal);
    });
    const first = new ServiceSupervisor(makeLogger(), {
      spawnProcess: vi.fn().mockReturnValue(firstChild),
      killProcess: firstKill,
    });
    const second = new ServiceSupervisor(makeLogger(), {
      spawnProcess: vi.fn().mockReturnValue(secondChild),
      killProcess: secondKill,
    });
    await Promise.all([
      first.ensure(makeSpec()),
      second.ensure(makeSpec()),
    ]);

    await first.shutdown();
    expect(firstKill).toHaveBeenCalledWith(firstChild, "SIGTERM");
    expect(secondKill).not.toHaveBeenCalled();
    expect(second.getSnapshot("demo")?.status).toBe("healthy");

    await second.shutdown();
    expect(secondKill).toHaveBeenCalledWith(secondChild, "SIGTERM");
  });

  it("force-kills an owned service after its grace period", async () => {
    const logger = makeLogger();
    const child = makeChild(402);
    const killProcess = vi.fn();
    const supervisor = new ServiceSupervisor(logger, {
      spawnProcess: vi.fn().mockReturnValue(child),
      killProcess,
    });

    await supervisor.ensure(makeSpec({ shutdown: { graceMs: 2 } }));
    await supervisor.shutdown();

    expect(killProcess.mock.calls.map(([, signal]) => signal)).toEqual(["SIGTERM", "SIGKILL"]);
  });

  it("reports synchronous spawn failures without throwing", async () => {
    const logger = makeLogger();
    const supervisor = new ServiceSupervisor(logger, {
      spawnProcess: vi.fn(() => {
        throw new Error("missing executable");
      }),
    });

    const handle = await supervisor.ensure(makeSpec());

    expect(handle.status).toBe("failed");
    expect(logger.error).toHaveBeenCalledWith(
      "Service/demo",
      "Spawn failed: missing executable",
    );
  });
});
