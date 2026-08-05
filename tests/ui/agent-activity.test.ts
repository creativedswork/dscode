import { describe, expect, it, vi } from "vitest";

import { HarnessEventBus } from "../../src/core/events.js";
import type { AgentProcess } from "../../src/agents/process/types.js";
import { WebUiBackend } from "../../src/ui/web/web-backend.js";

function processFixture(
  overrides: Partial<AgentProcess> = {},
): AgentProcess {
  return {
    agentId: "agent-1",
    parentAgentId: "main-1",
    parentSessionId: "session-1",
    application: { name: "general" },
    role: "subagent",
    state: "created",
    attachment: "foreground",
    contextMode: "minimal",
    context: {},
    runtime: {},
    createdAt: 1000,
    ...overrides,
  } as AgentProcess;
}

function setup(process: AgentProcess) {
  const events = new HarnessEventBus({ error: vi.fn() } as any);
  let currentSessionId = "session-1";
  const agentSupervisor = {
    get: vi.fn((agentId: string) => agentId === process.agentId ? process : undefined),
    spawn: vi.fn(),
    wait: vi.fn(),
  };
  const harness = {
    events,
    agentSupervisor,
    sessionManager: {
      getCurrentSessionId: () => currentSessionId,
      getCurrentMetadata: () => null,
      listSessions: () => [],
      getTotalActiveMs: () => 0,
      agentMessages: [],
    },
    agent: { state: { messages: [], model: { name: "model" } } },
    commandManager: { listManifests: () => [] },
    contextManager: { getContextWindow: () => 0 },
    promptWithImages: vi.fn().mockResolvedValue(undefined),
    promptAndSave: vi.fn().mockResolvedValue(undefined),
    saveSessionNow: vi.fn(),
    logger: { info: vi.fn(), error: vi.fn() },
  } as any;
  const backend = new WebUiBackend({
    port: 0,
    harness,
    configStore: {} as any,
    config: {
      projectPath: "/project",
      provider: "test",
      modelId: "model",
    } as any,
  });
  const broadcast = vi.spyOn((backend as any).wsServer, "broadcast");
  return {
    events,
    broadcast,
    backend,
    harness,
    agentSupervisor,
    setCurrentSessionId(id: string) {
      currentSessionId = id;
    },
  };
}

function agentActivities(broadcast: ReturnType<typeof vi.spyOn>) {
  return broadcast.mock.calls
    .map((call: unknown[]) => call[0])
    .filter((event: any) => event.type === "agent_activity");
}

describe("Web Agent Activity projection", () => {
  it("projects a foreground lifecycle into complete snapshots", () => {
    const process = processFixture();
    const { events, broadcast } = setup(process);

    events.emit({
      type: "agent:spawned",
      agentId: process.agentId,
      parentAgentId: process.parentAgentId,
      application: "general",
      attachment: "foreground",
      input: "inspect the implementation",
    });
    process.state = "running";
    process.startedAt = 1100;
    events.emit({
      type: "agent:progress",
      agentId: process.agentId,
      phase: "search",
      progress: 2,
      total: 4,
      message: "Reading files",
    });
    process.state = "completed";
    process.endedAt = 5000;
    process.exit = {
      agentId: process.agentId,
      state: "completed",
      output: "Found two issues",
      startedAt: 1100,
      endedAt: 5000,
    };
    events.emit({ type: "agent:exit", result: process.exit });

    const activities = agentActivities(broadcast);
    expect(activities).toHaveLength(3);
    expect(activities[0].activity).toMatchObject({
      state: "running",
      attachment: "foreground",
      input: "inspect the implementation",
    });
    expect(activities[1].activity.progress).toEqual({
      phase: "search",
      current: 2,
      total: 4,
      message: "Reading files",
    });
    expect(activities[2].activity).toMatchObject({
      state: "completed",
      output: "Found two issues",
      endedAt: 5000,
    });
  });

  it("projects background failure without a completion toast", () => {
    const process = processFixture({ attachment: "background" });
    const { events, broadcast } = setup(process);

    events.emit({
      type: "agent:spawned",
      agentId: process.agentId,
      parentAgentId: process.parentAgentId,
      application: "general",
      attachment: "background",
      input: "run in background",
    });
    process.state = "failed";
    process.exit = {
      agentId: process.agentId,
      state: "failed",
      error: "Timed out",
      startedAt: 1100,
      endedAt: 5000,
    };
    events.emit({ type: "agent:exit", result: process.exit });

    expect(agentActivities(broadcast).at(-1)?.activity).toMatchObject({
      attachment: "background",
      state: "failed",
      error: "Timed out",
    });
    expect(broadcast).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "info" }),
    );
  });

  it("filters another Session and deduplicates unchanged progress", () => {
    const process = processFixture();
    const { events, broadcast, setCurrentSessionId } = setup(process);
    const progress = {
      type: "agent:progress" as const,
      agentId: process.agentId,
      phase: "search",
      progress: 1,
      total: 2,
      message: "Reading",
    };

    setCurrentSessionId("session-2");
    events.emit(progress);
    expect(agentActivities(broadcast)).toHaveLength(0);

    setCurrentSessionId("session-1");
    process.state = "running";
    events.emit(progress);
    events.emit(progress);
    expect(agentActivities(broadcast)).toHaveLength(1);
  });

  it("always forwards terminal snapshots", () => {
    const process = processFixture({
      state: "completed",
      exit: {
        agentId: "agent-1",
        state: "completed",
        output: "Done",
        startedAt: 1100,
        endedAt: 5000,
      },
    });
    const { events, broadcast } = setup(process);

    events.emit({ type: "agent:exit", result: process.exit! });
    events.emit({ type: "agent:exit", result: process.exit! });

    expect(agentActivities(broadcast)).toHaveLength(2);
  });

  it("rebuilds Session history without creating or resuming processes", () => {
    const process = processFixture();
    const { backend, harness, agentSupervisor } = setup(process);
    harness.sessionManager.agentMessages = [{
      role: "subagent",
      agentId: "agent-history",
      application: "general",
      state: "completed",
      input: { prompt: "historical work" },
      output: { text: "Done" },
      createdAt: 1000,
      endedAt: 2000,
    }];

    const messages = (backend as any).buildConversationHistory();

    expect(messages).toEqual([
      expect.objectContaining({
        role: "agent",
        agentActivity: expect.objectContaining({
          agentId: "agent-history",
          state: "completed",
        }),
      }),
    ]);
    expect(agentSupervisor.spawn).not.toHaveBeenCalled();
    expect(agentSupervisor.wait).not.toHaveBeenCalled();
  });

  it("keeps the Web display prompt separate from image runtime input", async () => {
    const process = processFixture();
    const { backend, harness } = setup(process);
    const send = vi.fn();

    await (backend as any).handleMessage({ send }, {
      type: "chat",
      text: "describe this image",
      images: [{ data: "aW1hZ2U=", mimeType: "image/png" }],
    });

    expect(send).toHaveBeenCalledWith(expect.objectContaining({
      type: "user_message",
      text: "describe this image",
    }));
    expect(harness.promptWithImages).toHaveBeenCalledWith(
      "describe this image",
      [expect.objectContaining({ type: "image", mimeType: "image/png" })],
      "describe this image",
    );
  });
});
