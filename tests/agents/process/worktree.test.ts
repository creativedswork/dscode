import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it, vi } from "vitest";

import { HarnessEventBus } from "../../../src/core/events.js";
import { createMainAgentContext, getAgentContext } from "../../../src/agents/process/context.js";
import { AgentSupervisor } from "../../../src/agents/process/supervisor.js";
import type { AgentApplicationSnapshot } from "../../../src/agents/application/types.js";
import type {
  AgentProcessInput,
  AgentProcessRuntime,
} from "../../../src/agents/runtimes/runtime.js";

const execFileAsync = promisify(execFile);
const temporaryDirectories: string[] = [];

async function git(cwd: string, ...args: string[]): Promise<void> {
  await execFileAsync("git", ["-C", cwd, ...args]);
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) =>
    rm(path, { recursive: true, force: true }),
  ));
});

describe("background Agent Worktree isolation", () => {
  it("preserves changed Worktree without modifying the main workspace", async () => {
    const root = await mkdtemp(join(tmpdir(), "dscode-worktree-"));
    temporaryDirectories.push(root);
    await git(root, "init");
    await git(root, "config", "user.email", "test@example.com");
    await git(root, "config", "user.name", "Test");
    await writeFile(join(root, "shared.txt"), "main\n");
    await git(root, "add", "shared.txt");
    await git(root, "commit", "-m", "baseline");

    const main: AgentApplicationSnapshot = {
      name: "main",
      description: "main",
      systemPrompt: "main",
      source: { kind: "internal", path: "src/core/harness.ts" },
      digest: "m".repeat(64),
      registryGeneration: 1,
    };
    const writer: AgentApplicationSnapshot = {
      ...main,
      name: "writer",
      background: true,
      isolation: "worktree",
      tools: ["write_file"],
      digest: "w".repeat(64),
    };
    const runtime: AgentProcessRuntime = {
      capabilities: { suspend: false, messaging: false },
      async start(_input: AgentProcessInput) {
        const context = getAgentContext();
        if (!context) throw new Error("missing AgentContext");
        await writeFile(join(context.cwd, "shared.txt"), "agent\n");
        return { text: "changed" };
      },
      async terminate() {},
      kill() {},
    };
    const apps = new Map([["main", main], ["writer", writer]]);
    const supervisor = new AgentSupervisor(
      { require: (name: string) => apps.get(name)! } as any,
      () => runtime,
      { save: vi.fn(async () => {}) } as any,
      new HarnessEventBus({ error: vi.fn() } as any),
      { error: vi.fn() } as any,
      () => ["write_file"],
    );
    const mainProcess = supervisor.registerMain(
      main,
      runtime,
      createMainAgentContext(root, "session", ["write_file"]),
    );

    const spawned = await supervisor.spawn({
      application: "writer",
      input: { prompt: "change" },
      parentAgentId: mainProcess.agentId,
      attachment: "background",
    });
    const exit = await supervisor.wait(spawned.agentId);
    const worktree = (exit.details as any).worktree;

    expect(await readFile(join(root, "shared.txt"), "utf8")).toBe("main\n");
    expect(await readFile(join(worktree.path, "shared.txt"), "utf8")).toBe("agent\n");
    expect(worktree.preserved).toBe(true);
    expect(worktree.changed).toBe(true);

    await git(root, "worktree", "remove", "--force", worktree.path);
    await git(root, "branch", "-D", worktree.branch);
  });

  it("isolates two writers targeting the same relative path", async () => {
    const root = await mkdtemp(join(tmpdir(), "dscode-worktree-parallel-"));
    temporaryDirectories.push(root);
    await git(root, "init");
    await git(root, "config", "user.email", "test@example.com");
    await git(root, "config", "user.name", "Test");
    await writeFile(join(root, "shared.txt"), "main\n");
    await git(root, "add", "shared.txt");
    await git(root, "commit", "-m", "baseline");

    const main: AgentApplicationSnapshot = {
      name: "main",
      description: "main",
      systemPrompt: "main",
      source: { kind: "internal", path: "src/core/harness.ts" },
      digest: "m".repeat(64),
      registryGeneration: 1,
    };
    const writer: AgentApplicationSnapshot = {
      ...main,
      name: "writer",
      background: true,
      isolation: "worktree",
      tools: ["write_file"],
      digest: "w".repeat(64),
    };
    const runtimeFactory = (): AgentProcessRuntime => ({
      capabilities: { suspend: false, messaging: false },
      async start(input: AgentProcessInput) {
        const context = getAgentContext();
        if (!context) throw new Error("missing AgentContext");
        await writeFile(join(context.cwd, "shared.txt"), `${input.prompt}\n`);
        return { text: input.prompt };
      },
      async terminate() {},
      kill() {},
    });
    const apps = new Map([["main", main], ["writer", writer]]);
    const supervisor = new AgentSupervisor(
      { require: (name: string) => apps.get(name)! } as any,
      runtimeFactory,
      { save: vi.fn(async () => {}) } as any,
      new HarnessEventBus({ error: vi.fn() } as any),
      { error: vi.fn() } as any,
      () => ["write_file"],
    );
    const mainProcess = supervisor.registerMain(
      main,
      runtimeFactory(),
      createMainAgentContext(root, "session", ["write_file"]),
    );

    const children = await Promise.all(["first", "second"].map((prompt) =>
      supervisor.spawn({
        application: "writer",
        input: { prompt },
        parentAgentId: mainProcess.agentId,
        attachment: "background",
      }),
    ));
    const exits = await Promise.all(children.map((child) => supervisor.wait(child.agentId)));
    const worktrees = exits.map((exit) => (exit.details as any).worktree);

    expect(await readFile(join(root, "shared.txt"), "utf8")).toBe("main\n");
    expect(new Set(worktrees.map((worktree) => worktree.path)).size).toBe(2);
    expect((await Promise.all(worktrees.map((worktree) =>
      readFile(join(worktree.path, "shared.txt"), "utf8"),
    ))).sort()).toEqual(["first\n", "second\n"]);

    for (const worktree of worktrees) {
      await git(root, "worktree", "remove", "--force", worktree.path);
      await git(root, "branch", "-D", worktree.branch);
    }
  });
});
