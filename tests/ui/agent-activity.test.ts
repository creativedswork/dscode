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
    description: "Researcher: inspect implementation",
    application: { name: "general" },
    role: "subagent",
    state: "created",
    attachment: "foreground",
    recording: "session",
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
      label: "Researcher",
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

  it("uses Vision as the built-in Vision Agent label", () => {
    const process = processFixture({
      description: undefined,
      application: { name: "vision" } as AgentProcess["application"],
    });
    const { events, broadcast } = setup(process);

    events.emit({
      type: "agent:spawned",
      agentId: process.agentId,
      parentAgentId: process.parentAgentId,
      application: "vision",
      attachment: "foreground",
      input: "describe the image",
    });

    expect(agentActivities(broadcast).at(-1)?.activity).toMatchObject({
      label: "Vision",
      application: "vision",
    });
  });

  it("projects parallel tool lifecycle by toolCallId without duplicates", () => {
    const process = processFixture({ state: "running", startedAt: 1100 });
    const { events, broadcast } = setup(process);

    const toolProgress = (
      toolCallId: string,
      toolName: string,
      status: "running" | "completed",
      startedAt: number,
      endedAt?: number,
    ) => events.emit({
      type: "agent:progress",
      agentId: process.agentId,
      phase: "tool",
      message: `${status} ${toolName}`,
      details: {
        kind: "tool",
        status,
        executionId: process.agentId,
        toolCallId,
        toolName,
        args: `path=${toolCallId}`,
        startedAt,
        endedAt,
        isError: false,
        resultDetail: status === "completed"
          ? { summary: `${toolCallId} result`, text: `${toolCallId} result` }
          : undefined,
      },
    });

    toolProgress("call-1", "read_file", "running", 1200);
    toolProgress("call-2", "bash", "running", 1300);
    toolProgress("call-1", "read_file", "completed", 1200, 1400);
    toolProgress("call-1", "read_file", "completed", 1200, 1400);

    const activity = agentActivities(broadcast).at(-1)?.activity;
    expect(activity.executionId).toBe(process.agentId);
    expect(activity.tools).toEqual([
      expect.objectContaining({
        toolCallId: "call-1",
        name: "read_file",
        status: "completed",
        args: "path=call-1",
        resultDetail: {
          summary: "call-1 result",
          text: "call-1 result",
        },
        endedAt: 1400,
      }),
      expect.objectContaining({
        toolCallId: "call-2",
        name: "bash",
        status: "running",
      }),
    ]);
    expect(activity.tools).toHaveLength(2);
  });

  it("binds and resolves permission on the matching active tool", () => {
    const process = processFixture({ state: "waiting", startedAt: 1100 });
    const { events, broadcast } = setup(process);
    events.emit({
      type: "agent:progress",
      agentId: process.agentId,
      phase: "tool",
      details: {
        kind: "tool",
        status: "running",
        toolCallId: "call-bash",
        toolName: "bash",
        startedAt: 1200,
      },
    });
    events.emit({
      type: "agent:progress",
      agentId: process.agentId,
      phase: "permission",
      details: {
        kind: "permission",
        status: "waiting",
        toolCallId: "call-bash",
        toolName: "bash",
        preview: "$ pwd",
      },
    });

    expect(agentActivities(broadcast).at(-1)?.activity).toMatchObject({
      permission: {
        toolCallId: "call-bash",
        toolName: "bash",
        preview: "$ pwd",
      },
      tools: [
        expect.objectContaining({
          toolCallId: "call-bash",
          status: "permission",
        }),
      ],
    });

    events.emit({
      type: "agent:progress",
      agentId: process.agentId,
      phase: "permission",
      details: {
        kind: "permission",
        status: "resolved",
        toolCallId: "call-bash",
        toolName: "bash",
      },
    });
    expect(agentActivities(broadcast).at(-1)?.activity).toMatchObject({
      permission: undefined,
      tools: [
        expect.objectContaining({
          toolCallId: "call-bash",
          status: "running",
        }),
      ],
    });
  });

  it("projects failed Tool error detail onto the matching activity", () => {
    const process = processFixture({ state: "running", startedAt: 1100 });
    const { events, broadcast } = setup(process);
    events.emit({
      type: "agent:progress",
      agentId: process.agentId,
      phase: "tool",
      details: {
        kind: "tool",
        status: "running",
        toolCallId: "call-failed",
        toolName: "bash",
        args: "command=false",
        startedAt: 1200,
      },
    });
    events.emit({
      type: "agent:progress",
      agentId: process.agentId,
      phase: "model",
      details: {
        kind: "tool",
        status: "failed",
        toolCallId: "call-failed",
        toolName: "bash",
        startedAt: 1200,
        endedAt: 1300,
        isError: true,
        resultDetail: { summary: "exit 1", text: "exit 1" },
      },
    });

    expect(agentActivities(broadcast).at(-1)?.activity.tools).toEqual([
      expect.objectContaining({
        toolCallId: "call-failed",
        status: "failed",
        args: "command=false",
        isError: true,
        resultDetail: { summary: "exit 1", text: "exit 1" },
      }),
    ]);
  });

  it("preserves SubAgent identity in the Web permission prompt", async () => {
    const process = processFixture({ state: "waiting", startedAt: 1100 });
    const { backend, broadcast } = setup(process);

    const pending = backend.getPromptPermission()(
      "bash",
      "$ pwd",
      { command: "pwd" },
      { agentId: process.agentId, toolCallId: "call-bash" },
    );

    expect(broadcast).toHaveBeenCalledWith(expect.objectContaining({
      type: "permission_prompt",
      toolName: "bash",
      preview: "$ pwd",
      agentId: process.agentId,
      toolCallId: "call-bash",
    }));

    (backend as any).permissionResolve({ decision: "deny" });
    (backend as any).permissionResolve = null;
    await expect(pending).resolves.toEqual({ decision: "deny" });
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

  it("keeps process-only Eval workers out of the Chat conversation", () => {
    const process = processFixture({
      application: { name: "chief-graph" } as AgentProcess["application"],
      recording: "process-only",
    });
    const { events, broadcast } = setup(process);

    events.emit({
      type: "agent:spawned",
      agentId: process.agentId,
      parentAgentId: process.parentAgentId,
      application: "chief-graph",
      attachment: "foreground",
      input: "Build the CHIEF graph",
    });
    process.state = "completed";
    process.exit = {
      agentId: process.agentId,
      state: "completed",
      output: "Eval-only output",
      startedAt: 1100,
      endedAt: 5000,
    };
    events.emit({ type: "agent:exit", result: process.exit });

    expect(agentActivities(broadcast)).toHaveLength(0);
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
