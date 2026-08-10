import { copyFile, mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { AgentApplicationRegistry } from "../../../src/agents/definitions/registry.js";
import { deriveAgentContext } from "../../../src/agents/process/context.js";

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

  it("refreshes the Application catalog when the project path changes", async () => {
    const paths = await fixture();
    const nextProject = join(paths.root, "next-project");
    await Promise.all([
      writeBundledVision(paths.bundled),
      mkdir(join(nextProject, ".dscode", "agents"), { recursive: true }),
      writeFile(join(paths.project, ".dscode", "agents", "reviewer.md"), `---
name: reviewer
description: Review final artifacts
---
Review
`),
    ]);
    await writeFile(join(nextProject, ".dscode", "agents", "researcher.md"), `---
name: researcher
description: Research source material
---
Research
`);
    const registry = new AgentApplicationRegistry({
      projectPath: paths.project,
      configDir: paths.config,
      bundledDir: paths.bundled,
      homeDir: paths.root,
    });

    await registry.load();
    const firstCatalog = registry.list();
    expect(Object.isFrozen(firstCatalog)).toBe(true);
    expect(firstCatalog.map(({ name, description }) => ({ name, description }))).toEqual([
      { name: "reviewer", description: "Review final artifacts" },
      { name: "vision", description: "" },
    ]);

    await registry.updateProjectPath(nextProject);
    expect(registry.list().map(({ name, description }) => ({ name, description }))).toEqual([
      { name: "researcher", description: "Research source material" },
      { name: "vision", description: "" },
    ]);
  });

  it("gives equivalent file and programmatic definitions the same capability path", async () => {
    const paths = await fixture();
    await writeBundledVision(paths.bundled);
    await writeFile(
      join(paths.project, ".dscode", "agents", "file-worker.md"),
      `---
name: file-worker
description: Equivalent worker
tools: [Read, Bash]
disallowedTools: [Write]
model: sonnet
permissionMode: plan
maxTurns: 4
skills: [review]
memory: project
---
Equivalent prompt
`,
    );
    const registry = new AgentApplicationRegistry({
      projectPath: paths.project,
      configDir: paths.config,
      bundledDir: paths.bundled,
      homeDir: paths.root,
      definitions: [{
        name: "program-worker",
        description: "Equivalent worker",
        systemPrompt: "Equivalent prompt",
        tools: ["read_file", "bash"],
        disallowedTools: ["write_file"],
        model: "sonnet",
        permissionMode: "plan",
        maxTurns: 4,
        skills: ["review"],
        memory: "project",
      }],
    });

    await registry.load();
    const file = registry.require("file-worker");
    const program = registry.require("program-worker");
    const comparable = ({
      name: _name,
      source: _source,
      digest: _digest,
      ...definition
    }: typeof file) => definition;
    expect(comparable(program)).toEqual(comparable(file));
    expect(program.source).toEqual({
      kind: "internal",
      path: "programmatic:program-worker",
    });
    expect(Object.isFrozen(program)).toBe(true);

    const capabilities = deriveAgentContext({
      application: program,
      parent: {
        agentId: "main",
        cwd: paths.project,
        parentSessionId: "session",
        depth: 0,
        attachment: "foreground",
        allowedTools: ["read_file", "bash"],
        deniedTools: ["bash"],
      },
      availableTools: ["read_file", "bash", "write_file"],
      attachment: "foreground",
    });
    expect(capabilities.allowedTools).toEqual(["read_file"]);
    expect(capabilities.deniedTools).toEqual(
      expect.arrayContaining(["bash", "write_file"]),
    );
  });

  it("validates a programmatic definition before registering it", async () => {
    const paths = await fixture();
    await writeBundledVision(paths.bundled);
    const registry = new AgentApplicationRegistry({
      projectPath: paths.project,
      configDir: paths.config,
      bundledDir: paths.bundled,
      homeDir: paths.root,
    });
    await registry.load();

    expect(() => registry.registerDefinition({
      name: "unsafe",
      systemPrompt: "Unsafe",
      permissionMode: "bypassPermissions",
    })).toThrow("restricted to managed");
    expect(registry.get("unsafe")).toBeUndefined();
  });
});
