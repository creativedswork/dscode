import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createStandardAgentHost } from "../../src/bootstrap/create-standard-agent-host.js";
import { AgentHostStartError } from "../../src/application/agent-host.js";
import { loadConfig } from "../../src/core/config.js";

const temporaryDirectories: string[] = [];

async function hostFixture(label: string, invalidModel = false) {
  const root = await mkdtemp(join(tmpdir(), `dscode-host-${label}-`));
  temporaryDirectories.push(root);
  const project = join(root, "project");
  const configDir = join(root, "config");
  const dataDir = join(root, "data");
  await Promise.all([
    mkdir(join(project, ".dscode"), { recursive: true }),
    mkdir(configDir, { recursive: true }),
    mkdir(dataDir, { recursive: true }),
  ]);
  await writeFile(
    join(project, ".dscode", "settings.json"),
    JSON.stringify({ appHost: { enabled: false } }),
  );
  const environment = Object.freeze({
    DSCODE_CONFIG_HOME: configDir,
    DSCODE_DATA_HOME: root,
    HOME: root,
  });
  const config = loadConfig(project, {
    environment,
    currentWorkingDirectory: root,
    configDir,
    dataDir,
    userMcpFile: join(root, ".mcp.json"),
  });
  config.appHost.enabled = false;
  if (invalidModel) config.modelId = "not-a-real-model";
  const host = await createStandardAgentHost({
    id: `host-${label}`,
    config,
    environment,
    homeDirectory: root,
    logger: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    } as any,
    agentDefinitions: [{
      name: `worker-${label}`,
      systemPrompt: `Worker ${label}`,
      tools: ["read_file"],
    }],
  });
  return { host, root, project };
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) =>
    rm(path, { recursive: true, force: true }),
  ));
});

describe("standard Agent Host", () => {
  it("isolates two Hosts and keeps shutdown instance-owned", async () => {
    const first = await hostFixture("a");
    const second = await hostFixture("b");
    const processCwd = process.cwd();
    let firstConfigEvents = 0;
    let secondConfigEvents = 0;
    first.host.api.events.on("config:change", () => firstConfigEvents++);
    second.host.api.events.on("config:change", () => secondConfigEvents++);

    await Promise.all([first.host.start(), second.host.start()]);
    expect(first.host.state()).toBe("running");
    expect(second.host.state()).toBe("running");
    expect(first.host.api.eval.hostId()).toBe("host-a");
    expect(second.host.api.eval.hostId()).toBe("host-b");
    expect(first.host.api.eval.currentProjectPath()).toBe(first.project);
    expect(second.host.api.eval.currentProjectPath()).toBe(second.project);
    expect(first.host.api.sessions.currentId()).toBeDefined();
    expect(second.host.api.sessions.currentId()).toBeDefined();

    first.host.api.memory.add("first-only", "project", "session-a");
    first.host.api.permissions.grantForSession("bash");
    await first.host.api.settings.setThinking("off");
    expect(first.host.api.memory.list("project")).toEqual([
      expect.objectContaining({ content: "first-only" }),
    ]);
    expect(second.host.api.memory.list("project")).toEqual([]);
    expect(first.host.api.permissions.sessionGrants()).toContain("bash");
    expect(second.host.api.permissions.sessionGrants()).not.toContain("bash");
    expect(firstConfigEvents).toBe(1);
    expect(secondConfigEvents).toBe(0);

    const nextProject = join(first.root, "next-project");
    await mkdir(join(nextProject, ".dscode"), { recursive: true });
    const switched = await first.host.api.project.setPath(nextProject);
    expect(switched.success).toBe(true);
    expect(first.host.api.eval.currentProjectPath()).toBe(nextProject);
    expect(second.host.api.eval.currentProjectPath()).toBe(second.project);
    expect(process.cwd()).toBe(processCwd);

    const firstShutdown = first.host.shutdown();
    expect(first.host.shutdown()).toBe(firstShutdown);
    await firstShutdown;
    expect(first.host.state()).toBe("stopped");
    expect(second.host.state()).toBe("running");
    await second.host.api.settings.setThinking("off");
    expect(secondConfigEvents).toBe(1);

    await second.host.shutdown();
    expect(second.host.state()).toBe("stopped");
  });

  it("reports startup failure and keeps cleanup idempotent", async () => {
    const fixture = await hostFixture("failed", true);

    await expect(fixture.host.start()).rejects.toBeInstanceOf(
      AgentHostStartError,
    );
    expect(fixture.host.state()).toBe("failed");
    const firstShutdown = fixture.host.shutdown();
    expect(fixture.host.shutdown()).toBe(firstShutdown);
    await firstShutdown;
    expect(fixture.host.state()).toBe("stopped");
  });
});
