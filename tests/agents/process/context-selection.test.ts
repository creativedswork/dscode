import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { ContextAssembler } from "../../../src/agents/process/context-selection.js";
import type { AgentProcess } from "../../../src/agents/process/types.js";

const temporaryDirectories: string[] = [];

function parent(cwd: string): AgentProcess {
  return {
    agentId: "main",
    parentSessionId: "session",
    application: {
      name: "main",
      description: "main",
      systemPrompt: "main",
      source: { kind: "internal", path: "main" },
      digest: "0".repeat(64),
      registryGeneration: 1,
    },
    role: "main",
    state: "running",
    attachment: "foreground",
    recording: "session",
    contextMode: "minimal",
    context: {
      agentId: "main",
      cwd,
      parentSessionId: "session",
      depth: 0,
      attachment: "foreground",
      allowedTools: [],
      deniedTools: [],
    },
    runtime: {
      capabilities: { suspend: false, messaging: false },
      async start() {
        return { text: "unused" };
      },
      async terminate() {},
      kill() {},
      snapshot() {
        return {
          messages: [{
            id: "msg-1",
            role: "user",
            content: "requirement",
          }],
        };
      },
    },
    createdAt: Date.now(),
  };
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) =>
    rm(path, { recursive: true, force: true }),
  ));
});

describe("ContextAssembler", () => {
  it("materializes typed selections in caller order", async () => {
    const root = await mkdtemp(join(tmpdir(), "dscode-selected-"));
    temporaryDirectories.push(root);
    await writeFile(join(root, "auth.ts"), "one\ntwo\nthree\n");

    const snapshot = await new ContextAssembler().assemble({
      items: [
        { type: "message", messageId: "msg-1" },
        { type: "file", path: "auth.ts", lineStart: 2, lineEnd: 3 },
      ],
      maxBytes: 10_000,
    }, parent(root));

    expect(snapshot.content.indexOf("message:msg-1"))
      .toBeLessThan(snapshot.content.indexOf("file:auth.ts"));
    expect(snapshot.content).toContain("two\nthree");
    expect(snapshot.digest).toMatch(/^[a-f0-9]{64}$/);
    expect(snapshot.truncated).toBe(false);
  });

  it("rejects path escapes and applies explicit overflow policy", async () => {
    const root = await mkdtemp(join(tmpdir(), "dscode-selected-"));
    const outside = await mkdtemp(join(tmpdir(), "dscode-selected-outside-"));
    temporaryDirectories.push(root, outside);
    await writeFile(join(root, "large.txt"), "x".repeat(500));
    await writeFile(join(outside, "secret.txt"), "secret");
    await symlink(outside, join(root, "escape"));
    const assembler = new ContextAssembler();

    await expect(assembler.assemble({
      items: [{ type: "file", path: "../secret" }],
    }, parent(root))).rejects.toThrow("outside parent cwd");
    await expect(assembler.assemble({
      items: [{ type: "message", messageId: "other-session-message" }],
    }, parent(root))).rejects.toThrow("not visible");
    await expect(assembler.assemble({
      items: [{ type: "file", path: "escape/secret.txt" }],
    }, parent(root))).rejects.toThrow("outside parent cwd");
    await expect(assembler.assemble({
      items: [{
        type: "diff",
        scope: "commit",
        ref: "--output=/tmp/dscode-selected-context",
      }],
    }, parent(root))).rejects.toThrow("cannot start with");

    const truncated = await assembler.assemble({
      items: [{ type: "file", path: "large.txt" }],
      maxBytes: 100,
      overflow: "truncate-tail",
    }, parent(root));
    expect(truncated.bytes).toBeLessThanOrEqual(100);
    expect(truncated.truncated).toBe(true);
  });
});
