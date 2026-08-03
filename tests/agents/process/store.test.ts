import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
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
      expect.objectContaining({ agentId: "agent-1", state: "completed" }),
    ]);
  });
});
