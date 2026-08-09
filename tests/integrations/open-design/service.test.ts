import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createOpenDesignHealthProbe,
  createOpenDesignServiceSpec,
  resolveOpenDesignCommand,
  type ReadyOpenDesignConfig,
} from "../../../src/integrations/open-design/service.js";

const roots: string[] = [];

function makeRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "open-design-"));
  roots.push(root);
  return root;
}

function makeConfig(path: string, port = 7456): ReadyOpenDesignConfig {
  return {
    enabled: true,
    path,
    port,
    autoStart: true,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("Open Design managed service declaration", () => {
  it("prefers the project-local od executable", () => {
    const root = makeRoot();
    const executable = join(root, "node_modules", ".bin", "od");
    mkdirSync(join(root, "node_modules", ".bin"), { recursive: true });
    writeFileSync(executable, "");

    const command = resolveOpenDesignCommand(makeConfig(root, 8123));

    expect(command).toEqual({
      executable,
      args: ["--port", "8123", "--no-open"],
      cwd: root,
      env: { OD_PORT: "8123" },
    });
  });

  it("falls back to the pnpm workspace command", () => {
    const root = makeRoot();

    const command = resolveOpenDesignCommand(makeConfig(root));

    expect(command).toEqual({
      executable: "pnpm",
      args: [
        "tools-dev",
        "run",
        "web",
        "--",
        "--port",
        "7456",
        "--no-open",
      ],
      cwd: root,
      env: { OD_PORT: "7456" },
    });
  });

  it("checks the real Open Design readiness endpoint", async () => {
    const request = vi.fn().mockResolvedValue({ status: 200 });
    const probe = createOpenDesignHealthProbe(9000, request as typeof fetch);
    const controller = new AbortController();

    await expect(probe(controller.signal)).resolves.toBe(true);
    expect(request).toHaveBeenCalledWith(
      "http://127.0.0.1:9000/api/projects",
      { signal: controller.signal },
    );
  });

  it("declares bounded Open Design lifecycle policies", () => {
    const root = makeRoot();
    const request = vi.fn();

    const spec = createOpenDesignServiceSpec(makeConfig(root), request as typeof fetch);

    expect(spec).toMatchObject({
      id: "open-design",
      health: {
        intervalMs: 500,
        timeoutMs: 30000,
        preflightTimeoutMs: 2000,
      },
      restart: {
        maxRapidRestarts: 3,
        rapidRestartWindowMs: 5000,
      },
      shutdown: {
        graceMs: 3000,
      },
    });
  });
});
