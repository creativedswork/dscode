import { describe, expect, it, vi } from "vitest";

import { ConversationCoordinator } from "../../src/application/conversation-coordinator.js";
import { SessionCoordinator } from "../../src/application/session-coordinator.js";

function metadata(id: string) {
  return {
    id,
    title: id,
    createdAt: 1,
    updatedAt: 2,
    modelProvider: "test",
    modelId: "model",
    messageCount: 1,
    projectPath: "/project",
    preview: "",
    hasImages: false,
    imageCount: 0,
    totalActiveMs: 0,
    contentHash: "",
  };
}

function createCoordinators() {
  const order: string[] = [];
  const target = metadata("TARGET-SESSION");
  const prepared = {
    id: target.id,
    metadata: target,
    messages: [{ role: "user", content: "target" }],
    agentMessages: [],
  };
  const agent = {
    state: { messages: [{ role: "user", content: "source" }] },
  };
  const sessionManager = {
    listSessions: () => [target],
    listAllSessions: () => [target],
    getCurrentSessionId: () => "SOURCE-SESSION",
    getCurrentMetadata: () => metadata("SOURCE-SESSION"),
    prepareLoad: vi.fn(async () => {
      order.push("prepare");
      return prepared;
    }),
    saveSession: vi.fn(() => order.push("save")),
    commitPreparedLoad: vi.fn(() => order.push("commit")),
    trySaveSession: vi.fn(),
  };
  const agentSupervisor = {
    updateParentSession: vi.fn(async () => {
      order.push("rebind");
    }),
  };
  const abort = vi.fn(() => {
    order.push("abort");
  });
  const conversation = new ConversationCoordinator();
  const sessions = new SessionCoordinator({
    sessionManager: sessionManager as any,
    agentSupervisor: () => agentSupervisor as any,
    mainAgentId: () => "main-1",
    agent: () => agent as any,
    projectPath: () => "/project",
    abort,
    conversation,
    logger: { info: vi.fn() } as any,
  });
  return {
    abort,
    agent,
    agentSupervisor,
    conversation,
    order,
    prepared,
    sessionManager,
    sessions,
  };
}

describe("SessionCoordinator", () => {
  it("runs prepare, abort/quiesce, save, rebind, and commit in order", async () => {
    let settleTurn!: () => void;
    const fixture = createCoordinators();
    const activeTurn = fixture.conversation.run(
      () => new Promise<void>((resolve) => {
        settleTurn = resolve;
      }),
    );
    fixture.abort.mockImplementation(() => {
      fixture.order.push("abort");
      settleTurn();
    });

    const pendingPermission = { toolName: "bash", preview: "echo test" };
    const result = await fixture.sessions.switch({
      sessionIdOrPrefix: "TARGET",
      pendingPermission,
    });
    await activeTurn;

    expect(fixture.order).toEqual([
      "prepare",
      "abort",
      "save",
      "rebind",
      "commit",
    ]);
    expect(result).toEqual({
      session: fixture.prepared.metadata,
      messages: fixture.prepared.messages,
      agentMessages: fixture.prepared.agentMessages,
    });
    expect(fixture.sessionManager.saveSession).toHaveBeenCalledWith(
      fixture.agent,
      pendingPermission,
    );
  });

  it("does not abort or mutate state when target resolution fails", async () => {
    const fixture = createCoordinators();
    fixture.sessionManager.listSessions = () => [];
    fixture.sessionManager.listAllSessions = () => [];
    fixture.sessionManager.getCurrentMetadata = () => null as any;

    await expect(
      fixture.sessions.switch({ sessionIdOrPrefix: "missing" }),
    ).rejects.toThrow("Session not found");

    expect(fixture.abort).not.toHaveBeenCalled();
    expect(fixture.sessionManager.prepareLoad).not.toHaveBeenCalled();
    expect(fixture.sessionManager.saveSession).not.toHaveBeenCalled();
  });

  it("resolves a project session after it leaves the capped global index", async () => {
    const fixture = createCoordinators();
    fixture.sessionManager.listAllSessions = () => [];

    await expect(
      fixture.sessions.switch({ sessionIdOrPrefix: "TARGET" }),
    ).resolves.toMatchObject({ session: fixture.prepared.metadata });
    expect(fixture.sessionManager.prepareLoad).toHaveBeenCalledWith(
      "TARGET-SESSION",
    );
  });

  it("rejects ambiguous prefixes before prepare", async () => {
    const fixture = createCoordinators();
    fixture.sessionManager.listSessions = () => [];
    fixture.sessionManager.listAllSessions = () => [
      metadata("PREFIX-ONE"),
      metadata("PREFIX-TWO"),
    ];

    await expect(
      fixture.sessions.switch({ sessionIdOrPrefix: "PREFIX" }),
    ).rejects.toThrow("Ambiguous session ID prefix");
    expect(fixture.sessionManager.prepareLoad).not.toHaveBeenCalled();
  });

  it("does not commit when Main Process rebind fails", async () => {
    const fixture = createCoordinators();
    fixture.agentSupervisor.updateParentSession = vi.fn(async () => {
      throw new Error("process store failed");
    });

    await expect(
      fixture.sessions.switch({ sessionIdOrPrefix: "TARGET" }),
    ).rejects.toThrow("process store failed");
    expect(fixture.sessionManager.commitPreparedLoad).not.toHaveBeenCalled();
  });

  it("rejects a second switch and prompts while prepare is pending", async () => {
    let finishPrepare!: () => void;
    const fixture = createCoordinators();
    fixture.sessionManager.prepareLoad = vi.fn(() =>
      new Promise((resolve) => {
        finishPrepare = () => resolve(fixture.prepared);
      })
    );

    const first = fixture.sessions.switch({ sessionIdOrPrefix: "TARGET" });
    await Promise.resolve();

    await expect(
      fixture.sessions.switch({ sessionIdOrPrefix: "TARGET" }),
    ).rejects.toThrow("already in progress");
    await expect(
      fixture.conversation.run(async () => {}),
    ).rejects.toThrow("session switch is in progress");

    finishPrepare();
    await first;
  });
});
