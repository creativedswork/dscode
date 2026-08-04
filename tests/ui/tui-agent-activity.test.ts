import { describe, expect, it, vi } from "vitest";

import { HarnessEventBus } from "../../src/core/events.js";
import type { AgentProcess } from "../../src/agents/process/types.js";
import {
  ConversationView,
  formatAgentActivityForTui,
} from "../../src/ui/conversation.js";

vi.mock("../../src/ui/tui-app.js", () => ({
  TuiApp: class {
    upsertAgentActivity = vi.fn();
    addInfo = vi.fn();
  },
}));

import { TuiBackend } from "../../src/ui/tui-backend.js";

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
    attachment: "background",
    contextMode: "minimal",
    context: {},
    runtime: {},
    createdAt: 1000,
    ...overrides,
  } as AgentProcess;
}

function setup(process: AgentProcess, currentSessionId = "session-1") {
  const events = new HarnessEventBus({ error: vi.fn() } as any);
  const backend = new TuiBackend({
    events,
    agentSupervisor: {
      get: (agentId: string) => agentId === process.agentId ? process : undefined,
    },
    sessionManager: {
      getCurrentSessionId: () => currentSessionId,
    },
  } as any);
  return {
    events,
    tui: (backend as any).tui as {
      upsertAgentActivity: ReturnType<typeof vi.fn>;
      addInfo: ReturnType<typeof vi.fn>;
    },
  };
}

function spawn(events: HarnessEventBus, process: AgentProcess) {
  events.emit({
    type: "agent:spawned",
    agentId: process.agentId,
    parentAgentId: process.parentAgentId,
    application: "general",
    attachment: process.attachment,
    input: "inspect in background",
  });
}

describe("TUI Agent Activity", () => {
  it("updates the conversation on realtime completion without a toast", () => {
    const process = processFixture();
    const { events, tui } = setup(process);
    spawn(events, process);
    process.state = "completed";
    process.exit = {
      agentId: process.agentId,
      state: "completed",
      output: "Found two issues",
      startedAt: 1100,
      endedAt: 5000,
    };
    events.emit({ type: "agent:exit", result: process.exit });

    expect(tui.upsertAgentActivity).toHaveBeenLastCalledWith(
      expect.objectContaining({
        state: "completed",
        output: "Found two issues",
      }),
    );
    expect(tui.addInfo).not.toHaveBeenCalled();
  });

  it("renders failure and filters another Session", () => {
    const process = processFixture();
    const other = setup(process, "session-2");
    spawn(other.events, process);
    expect(other.tui.upsertAgentActivity).not.toHaveBeenCalled();

    const current = setup(process);
    spawn(current.events, process);
    process.state = "failed";
    process.exit = {
      agentId: process.agentId,
      state: "failed",
      error: "Timed out",
      startedAt: 1100,
      endedAt: 5000,
    };
    current.events.emit({ type: "agent:exit", result: process.exit });
    expect(current.tui.upsertAgentActivity).toHaveBeenLastCalledWith(
      expect.objectContaining({
        state: "failed",
        error: "Timed out",
      }),
    );
  });

  it("formats compact duration, input, progress, output, and error summaries", () => {
    const text = formatAgentActivityForTui({
      agentId: "agent-abcdef12-3456",
      parentSessionId: "session-1",
      application: "general",
      attachment: "foreground",
      state: "completed",
      input: "inspect implementation",
      output: "Found two issues",
      progress: { phase: "search", current: 2, total: 4, message: "Reading" },
      createdAt: 1000,
      startedAt: 2000,
      endedAt: 7000,
    });

    expect(text).toContain("✓ General Agent  completed · foreground · 5s");
    expect(text).toContain("  inspect implementation");
    expect(text).toContain("  ↳ Found two issues");
    expect(text).not.toContain("input:");
    expect(text).not.toContain("progress:");
    expect(text).not.toContain("output:");
    expect(text).toContain("agent id: abcdef · full output retained in Agent Process Store");
  });

  it("renders running progress using the prototype terminal syntax", () => {
    const text = formatAgentActivityForTui({
      agentId: "agent-12345678-running",
      parentSessionId: "session-1",
      application: "vision",
      attachment: "foreground",
      state: "running",
      input: "Describe this image",
      progress: { phase: "describing", current: 1, total: 2, message: "Reading image" },
      createdAt: 1000,
      startedAt: 2000,
    }, 5000);

    expect(text).toContain("◆ Vision  running · foreground · 3s");
    expect(text).toContain("  Describe this image");
    expect(text).toContain("  ↳ 1/2 · Reading image");
    expect(text).toContain("  agent id: 123456");
  });

  it("replays display-ready Agent history alongside thinking, tools, and text", () => {
    const view = new ConversationView({ requestRender: vi.fn() } as any);
    view.replayMessages([
      { role: "user", content: "Delegate" },
      {
        role: "agent",
        content: "",
        agentActivity: {
          agentId: "agent-history",
          parentSessionId: "session-1",
          application: "general",
          attachment: "foreground",
          state: "completed",
          input: "inspect",
          output: "Done",
          createdAt: 1000,
          endedAt: 2000,
        },
      },
      {
        role: "assistant",
        content: "Answer",
        thinking: "Consider results",
        tools: [{
          name: "read_file",
          args: "src/a.ts",
          result: "contents",
          isError: false,
        }],
      },
    ]);

    const blocks = (view as any).blocks as Array<{ type: string; content?: string }>;
    expect(blocks.map((block) => block.type)).toEqual(["text", "agent", "text"]);
    expect(blocks[1].content).toContain("agent id: histor");
    expect(blocks[2].content).toContain("[thinking]");
    expect(blocks[2].content).toContain("read_file");
    expect(blocks[2].content).toContain("Answer");
  });
});
