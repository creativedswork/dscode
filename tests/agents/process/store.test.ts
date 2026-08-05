import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { AgentProcessStore } from "../../../src/agents/process/store.js";
import type { AgentProcess } from "../../../src/agents/process/types.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) =>
    rm(path, { recursive: true, force: true }),
  ));
});

describe("AgentProcessStore", () => {
  it("atomically persists versioned metadata without serializing Runtime", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "dscode-process-store-"));
    temporaryDirectories.push(dataDir);
    const store = new AgentProcessStore(dataDir, "/project");
    const agentProcess: AgentProcess = {
      agentId: "agent-1",
      parentAgentId: "main-1",
      parentSessionId: "session-1",
      application: {
        name: "general",
        description: "General",
        systemPrompt: "Prompt",
        source: { kind: "project-dscode", path: ".dscode/agents/general.md" },
        digest: "a".repeat(64),
        registryGeneration: 2,
      },
      role: "subagent",
      state: "completed",
      attachment: "foreground",
      recording: "process-only",
      contextMode: "minimal",
      context: {
        agentId: "agent-1",
        cwd: "/project",
        parentSessionId: "session-1",
        depth: 1,
        attachment: "foreground",
        allowedTools: [],
        deniedTools: ["spawn_agent"],
      },
      runtime: {
        capabilities: { suspend: false, messaging: false },
        async start() { return { text: "" }; },
        async terminate() {},
        kill() {},
      },
      runtimeSnapshot: {
        messages: [{ role: "user", content: "task" }],
        usage: { totalTokens: 10 },
      },
      createdAt: 1,
      startedAt: 2,
      endedAt: 3,
    };

    await store.save(agentProcess);
    const loaded = await store.load("agent-1");
    expect(loaded).toMatchObject({
      version: 1,
      agentId: "agent-1",
      recording: "process-only",
      application: {
        digest: "a".repeat(64),
        registryGeneration: 2,
      },
      runtimeSnapshot: {
        usage: { totalTokens: 10 },
      },
    });
    expect(loaded).not.toHaveProperty("runtime");

    const projectDirectories = await readdir(join(dataDir, "agent-processes", "by-project"));
    const indexRaw = await readFile(
      join(dataDir, "agent-processes", "by-project", projectDirectories[0], "index.json"),
      "utf8",
    );
    expect(JSON.parse(indexRaw)).toEqual([
      expect.objectContaining({
        agentId: "agent-1",
        state: "completed",
        recording: "process-only",
      }),
    ]);
  });

  it("loads explicit Agent IDs and reports missing records", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "dscode-process-store-"));
    temporaryDirectories.push(dataDir);
    const store = new AgentProcessStore(dataDir, "/project");
    const process = {
      agentId: "agent-1",
      parentAgentId: "main-1",
      parentSessionId: "session-1",
      application: {
        name: "general",
        description: "General",
        systemPrompt: "Prompt",
        source: { kind: "bundled" as const, path: "general.md" },
        digest: "a".repeat(64),
        registryGeneration: 1,
      },
      role: "subagent" as const,
      state: "completed" as const,
      attachment: "foreground" as const,
      recording: "session" as const,
      contextMode: "minimal" as const,
      context: {
        agentId: "agent-1",
        cwd: "/project",
        parentSessionId: "session-1",
        depth: 1,
        attachment: "foreground" as const,
        allowedTools: [],
        deniedTools: [],
      },
      runtime: {
        capabilities: { suspend: false, messaging: false },
        async start() { return { text: "" }; },
        async terminate() {},
        kill() {},
      },
      createdAt: 1,
    } satisfies AgentProcess;
    await store.save(process);

    const loaded = await store.loadMany(["agent-1", "missing", "agent-1"]);

    expect([...loaded.found]).toEqual([
      ["agent-1", expect.objectContaining({ recording: "session" })],
    ]);
    expect(loaded.missing).toEqual(["missing"]);
  });

  it("defaults legacy version 1 records to Session recording", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "dscode-process-store-"));
    temporaryDirectories.push(dataDir);
    const store = new AgentProcessStore(dataDir, "/project");
    const process = {
      agentId: "agent-legacy",
      parentSessionId: "session-1",
      application: {
        name: "general",
        description: "General",
        systemPrompt: "Prompt",
        source: { kind: "bundled" as const, path: "general.md" },
        digest: "a".repeat(64),
        registryGeneration: 1,
      },
      role: "subagent" as const,
      state: "completed" as const,
      attachment: "foreground" as const,
      recording: "process-only" as const,
      contextMode: "minimal" as const,
      context: {
        agentId: "agent-legacy",
        cwd: "/project",
        parentSessionId: "session-1",
        depth: 1,
        attachment: "foreground" as const,
        allowedTools: [],
        deniedTools: [],
      },
      runtime: {
        capabilities: { suspend: false, messaging: false },
        async start() { return { text: "" }; },
        async terminate() {},
        kill() {},
      },
      createdAt: 1,
    } satisfies AgentProcess;
    await store.save(process);
    const projectDirectories = await readdir(join(dataDir, "agent-processes", "by-project"));
    const processPath = join(
      dataDir,
      "agent-processes",
      "by-project",
      projectDirectories[0],
      "agent-legacy.json",
    );
    const raw = JSON.parse(await readFile(processPath, "utf8"));
    delete raw.recording;
    await writeFile(processPath, `${JSON.stringify(raw)}\n`, "utf8");

    await expect(store.load("agent-legacy")).resolves.toMatchObject({
      recording: "session",
    });
  });
});
