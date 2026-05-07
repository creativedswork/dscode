import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SessionManager } from "../../src/session/manager.js";

// Minimal Agent mock
function createMockAgent(messages: unknown[] = []) {
  return {
    state: { messages },
  } as any;
}

describe("SessionManager", () => {
  let dataDir: string;
  let manager: SessionManager;

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), "session-test-"));
    manager = new SessionManager(dataDir);
  });

  afterEach(() => {
    // cleanup handled by OS temp dir
  });

  it("should create a new session", () => {
    const session = manager.createSession("deepseek", "deepseek-v4-flash");
    expect(session.id).toBeTruthy();
    expect(session.title).toBe("New session");
    expect(session.modelProvider).toBe("deepseek");
    expect(session.modelId).toBe("deepseek-v4-flash");
    expect(session.messageCount).toBe(0);
    expect(session.createdAt).toBeGreaterThan(0);
    expect(session.updatedAt).toBeGreaterThan(0);
  });

  it("should generate unique session IDs", () => {
    const s1 = manager.createSession("p1", "m1");
    const s2 = manager.createSession("p2", "m2");
    expect(s1.id).not.toBe(s2.id);
  });

  it("should save and load a session", () => {
    const session = manager.createSession("deepseek", "deepseek-v4-flash");
    const agent = createMockAgent([
      { role: "user", content: "hello" },
      { role: "assistant", content: "hi" },
    ]);
    manager.saveSession(agent);

    // Verify file was created
    const sessionDir = join(dataDir, "sessions");
    const filePath = join(sessionDir, `${session.id}.json`);
    expect(existsSync(filePath)).toBe(true);

    // Load into a new manager
    const manager2 = new SessionManager(dataDir);
    const agent2 = createMockAgent();
    const loaded = manager2.loadSession(session.id, agent2);
    expect(loaded).toBe(true);
    expect(agent2.state.messages).toEqual([
      { role: "user", content: "hello" },
      { role: "assistant", content: "hi" },
    ]);
  });

  it("should update title from first message", () => {
    const session = manager.createSession("deepseek", "deepseek-v4-flash");
    const agent = createMockAgent([
      { role: "user", content: "This is my first message to the agent" },
    ]);
    manager.saveSession(agent);

    const meta = manager.getCurrentMetadata();
    expect(meta!.title).toBe("This is my first message to the agent");
  });

  it("should update title from first message with content blocks", () => {
    const session = manager.createSession("deepseek", "deepseek-v4-flash");
    const agent = createMockAgent([
      {
        role: "user",
        content: [
          { type: "text", text: "Hello from content blocks" },
        ],
      },
    ]);
    manager.saveSession(agent);

    const meta = manager.getCurrentMetadata();
    expect(meta!.title).toBe("Hello from content blocks");
  });

  it("should return false when loading non-existent session", () => {
    const agent = createMockAgent();
    const loaded = manager.loadSession("nonexistent-id", agent);
    expect(loaded).toBe(false);
  });

  it("should list sessions", () => {
    manager.createSession("p1", "m1");
    const agent = createMockAgent([{ role: "user", content: "hi" }]);
    manager.saveSession(agent);

    const sessions = manager.listSessions();
    expect(sessions.length).toBe(1);
    expect(sessions[0].modelProvider).toBe("p1");
  });

  it("should delete a session", () => {
    const session = manager.createSession("p1", "m1");
    const agent = createMockAgent([{ role: "user", content: "hi" }]);
    manager.saveSession(agent);

    manager.deleteSession(session.id);
    expect(manager.listSessions().length).toBe(0);
  });

  it("should return current session ID", () => {
    expect(manager.getCurrentSessionId()).toBeNull();

    const session = manager.createSession("p1", "m1");
    expect(manager.getCurrentSessionId()).toBe(session.id);
  });

  it("should return current metadata", () => {
    expect(manager.getCurrentMetadata()).toBeNull();

    const session = manager.createSession("p1", "m1");
    const meta = manager.getCurrentMetadata();
    expect(meta!.id).toBe(session.id);
  });

  it("should update message count on save", () => {
    manager.createSession("p1", "m1");
    const agent = createMockAgent([
      { role: "user", content: "a" },
      { role: "assistant", content: "b" },
      { role: "user", content: "c" },
    ]);
    manager.saveSession(agent);

    const meta = manager.getCurrentMetadata();
    expect(meta!.messageCount).toBe(3);
  });

  it("should not save when no current session", () => {
    const agent = createMockAgent([{ role: "user", content: "hi" }]);
    // Should not throw
    expect(() => manager.saveSession(agent)).not.toThrow();
  });
});
