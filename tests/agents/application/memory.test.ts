import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { loadAgentMemory } from "../../../src/agents/application/memory.js";
import type { AgentApplicationSnapshot } from "../../../src/agents/application/types.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) =>
    rm(path, { recursive: true, force: true }),
  ));
});

describe("Agent Application Memory", () => {
  it("loads project memory by Application name", async () => {
    const root = await mkdtemp(join(tmpdir(), "dscode-agent-memory-"));
    temporaryDirectories.push(root);
    const memoryDir = join(root, ".dscode", "agent-memory", "reviewer");
    await mkdir(memoryDir, { recursive: true });
    await writeFile(join(memoryDir, "MEMORY.md"), "Always check authorization boundaries.\n");
    const application: AgentApplicationSnapshot = {
      name: "reviewer",
      description: "Reviewer",
      systemPrompt: "Review",
      memory: "project",
      source: { kind: "project-dscode", path: "reviewer.md" },
      digest: "a".repeat(64),
      registryGeneration: 1,
    };

    const memory = loadAgentMemory(application, join(root, "config"), root);
    expect(memory).toContain("Application Memory: reviewer");
    expect(memory).toContain("Scope: project");
    expect(memory).toContain("Always check authorization boundaries.");
  });
});
