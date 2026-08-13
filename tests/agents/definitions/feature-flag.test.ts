import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { loadConfig } from "../../../src/config/loader.js";
import {
  shouldUseNativeMainImagePath,
} from "../../../src/application/harness.js";
import { createStandardAgentHost } from "../../../src/bootstrap/create-standard-agent-host.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) =>
    rm(path, { recursive: true, force: true }),
  ));
});

describe("agents.enabled rollback switch", () => {
  it("uses native Main image input only when the Agent system is disabled", () => {
    expect(shouldUseNativeMainImagePath(true, false, true)).toBe(false);
    expect(shouldUseNativeMainImagePath(true, true, true)).toBe(false);
    expect(shouldUseNativeMainImagePath(false, false, true)).toBe(true);
    expect(shouldUseNativeMainImagePath(false, true, true)).toBe(false);
    expect(shouldUseNativeMainImagePath(false, false, false)).toBe(false);
  });

  it("keeps process tools out of the Main Agent DriverRegistry when disabled", async () => {
    const root = await mkdtemp(join(tmpdir(), "dscode-agents-disabled-"));
    temporaryDirectories.push(root);
    const project = join(root, "project");
    const configHome = join(root, "config");
    const dataHome = join(root, "data-home");
    await Promise.all([
      mkdir(join(project, ".dscode"), { recursive: true }),
      mkdir(configHome, { recursive: true }),
      mkdir(dataHome, { recursive: true }),
    ]);
    await writeFile(
      join(project, ".dscode", "settings.json"),
      JSON.stringify({ agents: { enabled: false }, appHost: { enabled: false } }),
    );
    const environment = {
      DSCODE_CONFIG_HOME: configHome,
      DSCODE_DATA_HOME: dataHome,
      HOME: root,
    };
    const config = loadConfig(project, {
      environment,
      currentWorkingDirectory: root,
      configDir: configHome,
      dataDir: join(dataHome, "data"),
      userMcpFile: join(root, ".mcp.json"),
    });
    config.appHost.enabled = false;
    const host = await createStandardAgentHost({
      config,
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
      } as any,
      environment,
      homeDirectory: root,
    });
    await host.initialize();

    expect(config.agents.enabled).toBe(false);
    expect(host.api.drivers.list()).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "agent-process" }),
    ]));
    expect(host.api.agents.list()).toEqual([
      expect.objectContaining({ role: "main" }),
    ]);
    await host.shutdown();
  });
});
