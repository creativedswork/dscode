import { describe, expect, it, vi } from "vitest";

import { Harness } from "../../src/core/harness.js";

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

function createHarness(overrides: Record<string, unknown> = {}) {
  const order: string[] = [];
  const target = metadata("TARGET-SESSION");
  const prepared = {
    id: target.id,
    metadata: target,
    messages: [{ role: "user", content: "target" }],
    agentMessages: [],
  };
  const harness = Object.create(Harness.prototype) as any;
  Object.assign(harness, {
    sessionSwitchInProgress: false,
    activeMainTurn: null,
    pendingBackgroundContinuationSessions: new Set<string>(),
    backgroundContinuationDrain: null,
    shuttingDown: false,
    mainAgentId: "main-1",
    config: { projectPath: "/project" },
    piAgentRuntime: { state: { messages: [{ role: "user", content: "source" }] } },
    sessionManager: {
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
    },
    agentSupervisor: {
      spawn: vi.fn(),
      updateParentSession: vi.fn(async () => {
        order.push("rebind");
      }),
    },
    abort: vi.fn(() => order.push("abort")),
    ...overrides,
  });
  return { harness: harness as Harness, order, prepared };
}

describe("Harness.switchSession", () => {
  it("runs prepare, abort/quiesce, save, rebind, and commit in order", async () => {
    let settleTurn!: () => void;
    const activeTurn = new Promise<void>((resolve) => {
      settleTurn = resolve;
    });
    const { harness, order, prepared } = createHarness({
      activeMainTurn: activeTurn,
    });
    (harness as any).abort = vi.fn(() => {
      order.push("abort");
      settleTurn();
    });

    const pendingPermission = { toolName: "bash", preview: "echo test" };
    const result = await harness.switchSession({
      sessionIdOrPrefix: "TARGET",
      pendingPermission,
    });

    expect(order).toEqual(["prepare", "abort", "save", "rebind", "commit"]);
    expect(result).toEqual({
      session: prepared.metadata,
      messages: prepared.messages,
      agentMessages: prepared.agentMessages,
    });
    expect((harness as any).agentSupervisor.spawn).not.toHaveBeenCalled();
    expect((harness as any).sessionManager.saveSession).toHaveBeenCalledWith(
      (harness as any).agent,
      pendingPermission,
    );
  });

  it("does not abort or mutate state when target resolution fails", async () => {
    const { harness } = createHarness();
    (harness as any).sessionManager.listSessions = () => [];
    (harness as any).sessionManager.listAllSessions = () => [];
    (harness as any).sessionManager.getCurrentMetadata = () => null;

    await expect(
      harness.switchSession({ sessionIdOrPrefix: "missing" }),
    ).rejects.toThrow("Session not found");

    expect((harness as any).abort).not.toHaveBeenCalled();
    expect((harness as any).sessionManager.prepareLoad).not.toHaveBeenCalled();
    expect((harness as any).sessionManager.saveSession).not.toHaveBeenCalled();
  });

  it("resolves a project session after it is evicted from the capped global index", async () => {
    const { harness, prepared } = createHarness();
    (harness as any).sessionManager.listAllSessions = () => [];

    await expect(
      harness.switchSession({ sessionIdOrPrefix: "TARGET" }),
    ).resolves.toEqual({
      session: prepared.metadata,
      messages: prepared.messages,
      agentMessages: prepared.agentMessages,
    });

    expect((harness as any).sessionManager.prepareLoad).toHaveBeenCalledWith(
      "TARGET-SESSION",
    );
  });

  it("rejects ambiguous prefixes before prepare", async () => {
    const { harness } = createHarness();
    (harness as any).sessionManager.listSessions = () => [];
    (harness as any).sessionManager.listAllSessions = () => [
      metadata("PREFIX-ONE"),
      metadata("PREFIX-TWO"),
    ];

    await expect(
      harness.switchSession({ sessionIdOrPrefix: "PREFIX" }),
    ).rejects.toThrow("Ambiguous session ID prefix");

    expect((harness as any).sessionManager.prepareLoad).not.toHaveBeenCalled();
  });

  it("does not commit when Main Process rebind fails", async () => {
    const { harness } = createHarness();
    (harness as any).agentSupervisor.updateParentSession = vi.fn(async () => {
      throw new Error("process store failed");
    });

    await expect(
      harness.switchSession({ sessionIdOrPrefix: "TARGET" }),
    ).rejects.toThrow("process store failed");

    expect((harness as any).sessionManager.commitPreparedLoad).not.toHaveBeenCalled();
  });

  it("rejects a second switch and prompts while prepare is pending", async () => {
    let finishPrepare!: () => void;
    const { harness, prepared } = createHarness();
    (harness as any).sessionManager.prepareLoad = vi.fn(() =>
      new Promise((resolve) => {
        finishPrepare = () => resolve(prepared);
      }),
    );

    const first = harness.switchSession({ sessionIdOrPrefix: "TARGET" });
    await Promise.resolve();

    await expect(
      harness.switchSession({ sessionIdOrPrefix: "TARGET" }),
    ).rejects.toThrow("already in progress");
    await expect(
      harness.promptAndSave("must be rejected"),
    ).rejects.toThrow("session switch is in progress");

    finishPrepare();
    await first;
  });
});
