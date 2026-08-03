import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SessionManager } from "../../../src/session/manager.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) =>
    rm(path, { recursive: true, force: true }),
  ));
});

describe("AgentSessionMessage parentSessionId routing", () => {
  it("persists role=subagent in the active parent session", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "dscode-agent-session-"));
    temporaryDirectories.push(dataDir);
    const manager = new SessionManager(dataDir, "/project", { error: vi.fn() } as any);
    const session = manager.createSession("test", "model");
    manager.upsertAgentMessage(session.id, {
      role: "subagent",
      agentId: "agent-general",
      parentAgentId: "main-1",
      application: "general",
      state: "completed",
      input: { prompt: "inspect this project" },
      output: { text: "done" },
      createdAt: 1,
      startedAt: 2,
      endedAt: 3,
    });
    manager.saveSession({
      state: { messages: [{ role: "user", content: "delegate" }] },
    } as any);

    const saved = await manager.loadSessionFile(session.id);
    expect(saved?.agentMessages?.[0]).toMatchObject({
      role: "subagent",
      agentId: "agent-general",
      application: "general",
    });
    expect(saved?.messages).toEqual([{ role: "user", content: "delegate" }]);
  });

  it("writes to the spawning session after the active session changes", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "dscode-vision-session-"));
    temporaryDirectories.push(dataDir);
    const manager = new SessionManager(dataDir, "/project", { error: vi.fn() } as any);
    const first = manager.createSession("test", "model");
    manager.saveSession({
      state: {
        messages: [{ role: "user", content: "first" }],
      },
    } as any);
    const second = manager.createSession("test", "model");

    manager.upsertAgentMessage(first.id, {
      role: "subagent",
      agentId: "agent-vision",
      parentAgentId: "main-1",
      application: "vision",
      state: "completed",
      input: {
        prompt: "describe",
        attachments: [{
          type: "image",
          data: { type: "image_ref", hash: "image.png", mimeType: "image/png" },
        }],
      },
      output: { text: "description", source: "vision" },
      messageIndex: 0,
      createdAt: 1,
      endedAt: 2,
    });

    const firstSession = await manager.loadSessionFile(first.id);
    expect(firstSession?.version).toBe(3);
    expect(firstSession?.agentMessages).toHaveLength(1);
    expect(firstSession?.agentMessages?.[0]).toMatchObject({
      role: "subagent",
      agentId: "agent-vision",
      application: "vision",
      output: { text: "description" },
    });
    expect(firstSession?.visionMessages).toBeUndefined();
    expect(manager.getCurrentSessionId()).toBe(second.id);
  });

  it("reads legacy visionMessages as generic subagent records", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "dscode-vision-session-"));
    temporaryDirectories.push(dataDir);
    const manager = new SessionManager(dataDir, "/project", { error: vi.fn() } as any);
    const session = manager.createSession("test", "model");
    manager.saveSession({
      state: { messages: [{ role: "user", content: "describe" }] },
    } as any);
    const location = manager.getSessionFilePath(session.id);
    expect(location).not.toBeNull();
    await writeFile(location!.path, JSON.stringify({
      version: 2,
      metadata: session,
      messages: [{ role: "user", content: "describe" }],
      visionMessages: [{
        turnIndex: 0,
        messageIndex: 0,
        images: [{ type: "image_ref", hash: "image.png", mimeType: "image/png" }],
        prompt: "describe",
        description: "legacy description",
        modelProvider: "test",
        modelId: "vision",
        timestamp: 1,
      }],
    }));

    const agent = { state: { messages: [] as any[] } } as any;
    expect((await manager.loadSession(session.id, agent)).success).toBe(true);
    expect(manager.agentMessages[0]).toMatchObject({
      role: "subagent",
      application: "vision",
      input: { prompt: "describe" },
      output: { text: "legacy description" },
    });

    manager.saveSession(agent);
    const migrated = await manager.loadSessionFile(session.id);
    expect(migrated?.version).toBe(3);
    expect(migrated?.agentMessages).toHaveLength(1);
    expect(migrated?.visionMessages).toBeUndefined();
  });
});
