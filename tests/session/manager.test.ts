import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, existsSync, readFileSync, rmdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SessionManager } from "../../src/session/manager.js";
import { SessionStore } from "../../src/session/store.js";

// Minimal Agent mock
function createMockAgent(messages: unknown[] = []) {
  return {
    state: { messages },
  } as any;
}

const TEST_PROJECT = "/test/project";

describe("SessionManager", () => {
  let dataDir: string;
  let manager: SessionManager;

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), "session-test-"));
    manager = new SessionManager(dataDir, TEST_PROJECT);
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

  it("should save and load a session", async () => {
    const session = manager.createSession("deepseek", "deepseek-v4-flash");
    const agent = createMockAgent([
      { role: "user", content: "hello" },
      { role: "assistant", content: "hi" },
    ]);
    manager.saveSession(agent);

    // Verify file was created
    const sessionDir = join(dataDir, "sessions");
    const sessionFile = join(sessionDir, `${session.id}.json`);
    // Session is saved in by-project/<slug>/ not directly in sessions/
    const slug = require("node:crypto").createHash("sha256").update(TEST_PROJECT).digest("hex").slice(0, 8);
    const projDir = join(sessionDir, "by-project", `test_project-${slug}`);
    const projSessionFile = join(projDir, `${session.id}.json`);
    expect(existsSync(projSessionFile)).toBe(true);

    // Load into a new manager
    const manager2 = new SessionManager(dataDir, TEST_PROJECT);
    const agent2 = createMockAgent();
    const result = await manager2.loadSession(session.id, agent2);
    expect(result.success).toBe(true);
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

  it("should return error when loading non-existent session", async () => {
    const agent = createMockAgent();
    const result = await manager.loadSession("nonexistent-id", agent);
    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it("should track active time only between start/stop calls", async () => {
    manager.createSession("p1", "m1");
    // activeSince should be null after createSession (not auto-started)
    expect(manager.getTotalActiveMs()).toBe(0);

    // Simulate idle time — should not be counted
    await new Promise((r) => setTimeout(r, 50));

    // Start timer
    manager.startActiveTimer();
    await new Promise((r) => setTimeout(r, 50));

    // Timer is running — total should include live part
    const live = manager.getTotalActiveMs();
    expect(live).toBeGreaterThan(0);

    // Stop timer
    manager.stopActiveTimer();
    const afterStop = manager.getTotalActiveMs();

    // After stop, idle time should not increase total
    await new Promise((r) => setTimeout(r, 50));
    expect(manager.getTotalActiveMs()).toBe(afterStop);

    // Restart should accumulate more
    manager.startActiveTimer();
    await new Promise((r) => setTimeout(r, 50));
    manager.stopActiveTimer();
    expect(manager.getTotalActiveMs()).toBeGreaterThan(afterStop);
  });

  it("should not start timer if already started", async () => {
    manager.createSession("p1", "m1");
    manager.startActiveTimer();
    await new Promise((r) => setTimeout(r, 10));
    const first = manager.getTotalActiveMs();
    // Second start should be a no-op (activeSince already set)
    manager.startActiveTimer();
    await new Promise((r) => setTimeout(r, 10));
    manager.stopActiveTimer();
    // Should have accumulated from first start, not reset
    expect(manager.getTotalActiveMs()).toBeGreaterThan(first);
  });

  it("should not stop timer if already stopped", () => {
    manager.createSession("p1", "m1");
    manager.startActiveTimer();
    manager.stopActiveTimer();
    const first = manager.getTotalActiveMs();
    // Second stop should be a no-op
    manager.stopActiveTimer();
    expect(manager.getTotalActiveMs()).toBe(first);
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

    const result = manager.deleteSession(session.id);
    expect(result.success).toBe(true);
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

  // ── New tests for persistEmptySession and ENOENT fix ──

  it("persistEmptySession should save an empty session to disk", () => {
    const session = manager.createSession("p1", "m1");
    manager.persistEmptySession();

    // Zero-message sessions are filtered from listSessions() (server adds them back in pushSessionList)
    const sessions = manager.listSessions();
    expect(sessions.length).toBe(0);

    // But current session metadata should still be accessible
    const current = manager.getCurrentMetadata();
    expect(current).not.toBeNull();
    expect(current!.id).toBe(session.id);
    expect(current!.messageCount).toBe(0);
  });

  it("persistEmptySession should not throw with no current session", () => {
    expect(() => manager.persistEmptySession()).not.toThrow();
  });

  it("should recreate directory when saving after delete removes project dir", () => {
    const session = manager.createSession("p1", "m1");
    const agent = createMockAgent([{ role: "user", content: "hi" }]);
    manager.saveSession(agent);

    // Delete the session (and the project dir since it was the only session)
    manager.deleteSession(session.id);

    // Now save again — should recreate dir without ENOENT
    const session2 = manager.createSession("p1", "m2");
    const agent2 = createMockAgent([{ role: "user", content: "hello again" }]);
    expect(() => manager.saveSession(agent2)).not.toThrow();

    // Verify the new session was saved
    const sessions = manager.listSessions();
    expect(sessions.length).toBe(1);
    expect(sessions[0].id).toBe(session2.id);
  });
});

describe("SessionStore directory resilience", () => {
  let dataDir: string;

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), "store-test-"));
  });

  it("save should recreate project dir if deleted", () => {
    const store = new SessionStore(dataDir, TEST_PROJECT);
    const metadata = {
      id: "test-session-id",
      title: "Test",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      modelProvider: "p",
      modelId: "m",
      messageCount: 1,
      projectPath: TEST_PROJECT,
      preview: "",
      hasImages: false,
      imageCount: 0,
    };
    const session = { version: 1 as const, metadata, messages: [{ role: "user", content: "hi" }] };

    // First save
    store.save(session);

    // Manually delete the project directory
    const slug = require("node:crypto").createHash("sha256").update(TEST_PROJECT).digest("hex").slice(0, 8);
    const projDir = join(dataDir, "sessions", "by-project", `test_project-${slug}`);
    rmdirSync(projDir, { recursive: true });
    expect(existsSync(projDir)).toBe(false);

    // Save again — should not throw
    expect(() => store.save(session)).not.toThrow();
    expect(existsSync(projDir)).toBe(true);
  });
});
