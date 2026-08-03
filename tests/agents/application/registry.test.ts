import { copyFile, mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { AgentApplicationRegistry } from "../../../src/agents/application/registry.js";

const temporaryDirectories: string[] = [];

async function fixture(): Promise<{
  root: string;
  bundled: string;
  project: string;
  config: string;
}> {
  const root = await mkdtemp(join(tmpdir(), "dscode-agent-registry-"));
  temporaryDirectories.push(root);
  const bundled = join(root, "bundled");
  const project = join(root, "project");
  const config = join(root, "config");
  await Promise.all([
    mkdir(bundled, { recursive: true }),
    mkdir(join(project, ".dscode", "agents"), { recursive: true }),
    mkdir(config, { recursive: true }),
  ]);
  return { root, bundled, project, config };
}

async function writeBundledVision(directory: string): Promise<void> {
  await writeFile(join(directory, "vision.md"), `---
name: vision
model: vision
tools: []
fallback:
  - handler: ocr
    on: [model_error, empty_output]
---
Vision
`);
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) =>
    rm(path, { recursive: true, force: true }),
  ));
});

describe("AgentApplicationRegistry", () => {
  it("loads bundled markdown and allows safe project overrides", async () => {
    const paths = await fixture();
    await writeFile(join(paths.bundled, "vision.md"), `---
name: vision
model: vision
tools: []
fallback:
  - handler: ocr
    on: [model_error]
---
Bundled prompt
`);
    await writeFile(join(paths.project, ".dscode", "agents", "vision.md"), `---
name: vision
description: Project vision
model: anthropic/claude-sonnet-4
---
Project prompt
`);

    const registry = new AgentApplicationRegistry({
      projectPath: paths.project,
      configDir: paths.config,
      bundledDir: paths.bundled,
      homeDir: paths.root,
    });
    await registry.load();

    const vision = registry.require("vision");
    expect(vision.model).toBe("anthropic/claude-sonnet-4");
    expect(vision.tools).toEqual([]);
    expect(vision.fallback).toEqual([{ handler: "ocr", on: ["model_error"] }]);
    expect(vision.systemPrompt).toBe("Project prompt");
    expect(vision.source.kind).toBe("project-dscode");
    expect(vision.digest).toMatch(/^[a-f0-9]{64}$/);
  });

  it("rejects an external attempt to select a runtime entrypoint", async () => {
    const paths = await fixture();
    await writeFile(join(paths.bundled, "vision.md"), `---
name: vision
model: vision
---
Bundled prompt
`);
    await writeFile(join(paths.project, ".dscode", "agents", "vision.md"), `---
name: vision
runtime: pipeline
entrypoint: vision
---
Unsafe override
`);

    const registry = new AgentApplicationRegistry({
      projectPath: paths.project,
      configDir: paths.config,
      bundledDir: paths.bundled,
      homeDir: paths.root,
    });
    await registry.load();

    expect(registry.require("vision").systemPrompt).toBe("Bundled prompt");
    expect(registry.getDiagnostics()[0]?.message).toContain("Unsupported");
  });

  it("adapts Claude Code tool aliases", async () => {
    const paths = await fixture();
    await writeBundledVision(paths.bundled);
    await writeFile(join(paths.project, ".dscode", "agents", "worker.md"), `---
name: worker
tools: [Read, Grep, Bash, Agent]
---
Worker prompt
`);

    const registry = new AgentApplicationRegistry({
      projectPath: paths.project,
      configDir: paths.config,
      bundledDir: paths.bundled,
      homeDir: paths.root,
    });
    await registry.load();

    expect(registry.require("worker").tools).toEqual([
      "read_file",
      "grep",
      "bash",
      "spawn_agent",
    ]);
  });

  it("loads managed policy last and permits managed-only bypassPermissions", async () => {
    const paths = await fixture();
    const managed = join(paths.root, "managed");
    await mkdir(managed, { recursive: true });
    await writeBundledVision(paths.bundled);
    await writeFile(join(paths.project, ".dscode", "agents", "worker.md"), `---
name: worker
---
Project worker
`);
    await writeFile(join(managed, "worker.md"), `---
name: worker
permissionMode: bypassPermissions
---
Managed worker
`);

    const registry = new AgentApplicationRegistry({
      projectPath: paths.project,
      configDir: paths.config,
      bundledDir: paths.bundled,
      homeDir: paths.root,
      managedDir: managed,
    });
    await registry.load();

    expect(registry.require("worker")).toMatchObject({
      systemPrompt: "Managed worker",
      permissionMode: "bypassPermissions",
      source: { kind: "managed" },
    });
  });

  it("diagnoses unsupported nested Claude capabilities instead of ignoring them", async () => {
    const paths = await fixture();
    await writeBundledVision(paths.bundled);
    await writeFile(join(paths.project, ".dscode", "agents", "hooked.md"), `---
name: hooked
hooks:
  PreToolUse:
    - command: echo unsafe
---
Hooked
`);
    const registry = new AgentApplicationRegistry({
      projectPath: paths.project,
      configDir: paths.config,
      bundledDir: paths.bundled,
      homeDir: paths.root,
    });
    await registry.load();

    expect(registry.get("hooked")).toBeUndefined();
    expect(registry.getDiagnostics()[0]?.message).toContain("hooks are not supported");
  });

  it("loads a representative Claude Code Agent fixture", async () => {
    const paths = await fixture();
    const claudeAgents = join(paths.project, ".claude", "agents");
    await mkdir(claudeAgents, { recursive: true });
    await writeBundledVision(paths.bundled);
    await copyFile(
      join(process.cwd(), "tests", "fixtures", "claude-code-agents", "code-reviewer.md"),
      join(claudeAgents, "code-reviewer.md"),
    );
    const registry = new AgentApplicationRegistry({
      projectPath: paths.project,
      configDir: paths.config,
      bundledDir: paths.bundled,
      homeDir: paths.root,
    });
    await registry.load();

    expect(registry.require("code-reviewer")).toMatchObject({
      model: "sonnet",
      permissionMode: "plan",
      maxTurns: 12,
      memory: "project",
      tools: ["read_file", "grep", "glob", "bash"],
      disallowedTools: ["write_file", "edit"],
      source: { kind: "project-claude" },
    });
  });
});
