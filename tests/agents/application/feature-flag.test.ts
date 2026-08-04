import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { loadConfig } from "../../../src/core/config.js";
import {
  Harness,
  shouldUseNativeMainImagePath,
} from "../../../src/core/harness.js";
import { PiAgentRuntimeAdapter } from "../../../src/agents/runtimes/pi-agent-runtime.js";

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
    const previous = {
      configHome: process.env.DSCODE_CONFIG_HOME,
      dataHome: process.env.DSCODE_DATA_HOME,
      home: process.env.HOME,
      cwd: process.cwd(),
    };
    process.env.DSCODE_CONFIG_HOME = configHome;
    process.env.DSCODE_DATA_HOME = dataHome;
    process.env.HOME = root;
    try {
      const config = loadConfig(project);
      config.appHost.enabled = false;
      const harness = new Harness(config, {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
      } as any);
      await harness.initialize();

      expect(config.agents.enabled).toBe(false);
      expect(harness.driverRegistry.get("agent-process")).toBeUndefined();
      const mainProcess = harness.agentSupervisor.list().find((item) => item.role === "main");
      expect(mainProcess?.runtime).toBeInstanceOf(PiAgentRuntimeAdapter);
      expect((mainProcess?.runtime as PiAgentRuntimeAdapter).agent).toBe(harness.agent);
      const processImages = vi.fn(async () => ({
        source: "none",
        enrichedText: "",
        cachedRefs: [],
      }));
      harness.imagePipeline = { process: processImages, shutdown: vi.fn() } as any;
      const before = harness.agentSupervisor.list().length;
      await (harness as any).processImagesWithVisionAgent(
        [{ type: "image", data: "aW1hZ2U=", mimeType: "image/png" }],
        "",
        undefined,
        true,
      );
      expect(harness.agentSupervisor.list()).toHaveLength(before);
      const firstCall = processImages.mock.calls[0] as unknown as [unknown, unknown, unknown];
      expect(firstCall[2]).toMatchObject({
        systemPrompt: expect.stringContaining("image analysis Agent"),
      });
      await (harness as any).shutdown();
    } finally {
      process.chdir(previous.cwd);
      if (previous.configHome === undefined) delete process.env.DSCODE_CONFIG_HOME;
      else process.env.DSCODE_CONFIG_HOME = previous.configHome;
      if (previous.dataHome === undefined) delete process.env.DSCODE_DATA_HOME;
      else process.env.DSCODE_DATA_HOME = previous.dataHome;
      if (previous.home === undefined) delete process.env.HOME;
      else process.env.HOME = previous.home;
    }
  });
});
