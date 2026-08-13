import { describe, expect, it, vi } from "vitest";

import { HarnessEventBus } from "../../src/application/events.js";
import type { AgentProcess } from "../../src/agents/process/types.js";
import {
  ConversationView,
  formatAgentActivityForTui,
  formatUserMessageForTui,
  TuiAgentActivityCard,
  TuiThinkingBlock,
} from "../../src/ui/tui/conversation.js";
import { visibleWidth } from "@earendil-works/pi-tui";
import { createHarnessApiFixture } from "../helpers/harness-api.js";

vi.mock("../../src/ui/tui/app.js", () => ({
  TuiApp: class {
    upsertAgentActivity = vi.fn();
    addInfo = vi.fn();
  },
}));

import { TuiBackend } from "../../src/ui/tui/backend.js";

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
    recording: "session",
    contextMode: "minimal",
    context: {},
    runtime: {},
    createdAt: 1000,
    ...overrides,
  } as AgentProcess;
}

function setup(process: AgentProcess, currentSessionId = "session-1") {
  const events = new HarnessEventBus({ error: vi.fn() } as any);
  const base = createHarnessApiFixture();
  const backend = new TuiBackend(createHarnessApiFixture({
    events,
    agents: {
      ...base.agents,
      get: (agentId: string) =>
        agentId === process.agentId ? process as any : undefined,
    },
    sessions: {
      ...base.sessions,
      currentId: () => currentSessionId,
    },
  }));
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

function stripAnsi(text: string): string {
  return text.replace(/\u001b\[[0-9;]*m/g, "");
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

  it("does not render process-only Eval workers in the TUI conversation", () => {
    const process = processFixture({
      application: { name: "chief-attribution" } as AgentProcess["application"],
      recording: "process-only",
    });
    const { events, tui } = setup(process);

    spawn(events, process);
    process.state = "completed";
    process.exit = {
      agentId: process.agentId,
      state: "completed",
      output: "Eval-only output",
      startedAt: 1100,
      endedAt: 5000,
    };
    events.emit({ type: "agent:exit", result: process.exit });

    expect(tui.upsertAgentActivity).not.toHaveBeenCalled();
  });

  it("formats duration, input, and the complete short result", () => {
    const text = formatAgentActivityForTui({
      agentId: "agent-abcdef12-3456",
      parentSessionId: "session-1",
      label: "Researcher",
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

    expect(text).toContain("✓ Researcher  completed · foreground · 5s");
    expect(text).toContain("  inspect implementation");
    expect(text).toContain("  ↳ Found two issues");
    expect(text).not.toContain("input:");
    expect(text).not.toContain("progress:");
    expect(text).not.toContain("output:");
    expect(text).toContain("agent id: abcdef");
    expect(text).not.toContain("full output retained in Agent Process Store");
  });

  it("preserves result lines and only truncates oversized output", () => {
    const multiline = formatAgentActivityForTui({
      agentId: "agent-multiline",
      parentSessionId: "session-1",
      application: "general",
      attachment: "foreground",
      state: "completed",
      input: "inspect implementation",
      output: "Summary\n\n| Check | Status |\n| test | passed |",
      createdAt: 1000,
      endedAt: 2000,
    });
    expect(multiline).toContain(
      "  ↳ Summary\n    \n    | Check | Status |\n    | test | passed |",
    );

    const oversized = formatAgentActivityForTui({
      agentId: "agent-oversized",
      parentSessionId: "session-1",
      application: "general",
      attachment: "foreground",
      state: "completed",
      input: "inspect implementation",
      output: "x".repeat(2_100),
      createdAt: 1000,
      endedAt: 2000,
    });
    expect(oversized).toContain(
      "output summarized; Ctrl+E opens Inspector",
    );
  });

  it("renders running progress using the prototype terminal syntax", () => {
    const text = formatAgentActivityForTui({
      agentId: "agent-12345678-running",
      parentSessionId: "session-1",
      label: "Vision Analyst",
      application: "vision",
      attachment: "foreground",
      state: "running",
      input: "Describe this image",
      progress: { phase: "describing", current: 1, total: 2, message: "Reading image" },
      createdAt: 1000,
      startedAt: 2000,
    }, 5000);

    expect(text).toContain("◆ Vision Analyst  running · foreground · 3s");
    expect(text).toContain("  Describe this image");
    expect(text).toContain("  ↳ 1/2 · Reading image");
    expect(text).toContain("  agent id: 123456");
  });

  it("renders tool summary collapsed and timeline expanded", () => {
    const activity = {
      agentId: "agent-tools",
      parentSessionId: "session-1",
      application: "general",
      attachment: "foreground" as const,
      state: "running" as const,
      input: "inspect",
      createdAt: 1000,
      tools: [
        {
          toolCallId: "call-1",
          name: "read_file",
          status: "completed" as const,
          startedAt: 1100,
          endedAt: 1200,
        },
        {
          toolCallId: "call-2",
          name: "bash",
          status: "running" as const,
          summary: "{\"command\":\"pwd\"}",
          startedAt: 1300,
        },
      ],
    };

    const collapsed = formatAgentActivityForTui(activity, 2000, {
      toolsExpanded: false,
    });
    expect(collapsed).toContain("› Tools · 2 total · 1 done · 1 active");
    expect(collapsed).not.toContain("read_file  completed");

    const expanded = formatAgentActivityForTui(activity, 2000, {
      toolsExpanded: true,
    });
    expect(expanded).toContain("⌄ Tools · 2 total · 1 done · 1 active");
    expect(expanded).toContain("✓ read_file  completed");
    expect(expanded).toContain("◌ bash");
  });

  it("renders an Agent Activity as a bounded card", () => {
    const card = new TuiAgentActivityCard(
      "◆ General Agent  running · foreground · 3s\n  inspect implementation\n  ↳ Running bash",
    );

    const lines = card.render(64);
    const plain = lines.map(stripAnsi);

    expect(plain[0]).toMatch(/^╭─+╮$/);
    expect(plain.at(-1)).toMatch(/^╰─+╯$/);
    expect(plain).toContainEqual(expect.stringContaining("General Agent"));
    expect(plain).toContainEqual(expect.stringContaining("Running bash"));
    expect(lines.every((line) => visibleWidth(line) === 64)).toBe(true);
  });

  it("bounds visible long output without mutating the Activity snapshot", () => {
    const output = Array.from(
      { length: 80 },
      (_, index) => `result line ${index + 1}`,
    ).join("\n");
    const activity = {
      agentId: "agent-long",
      parentSessionId: "session-1",
      application: "general",
      attachment: "foreground" as const,
      state: "completed" as const,
      input: "inspect",
      output,
      createdAt: 1000,
      endedAt: 2000,
    };
    const card = new TuiAgentActivityCard(activity);
    const rendered = stripAnsi(card.render(48).join("\n"));

    expect(rendered).toContain("result line 1");
    expect(rendered).not.toContain("result line 80");
    expect(rendered).toContain("output summarized; Ctrl+E");
    expect(activity.output).toBe(output);

    const singleLineActivity = {
      ...activity,
      agentId: "agent-single-line",
      output: "x".repeat(5_000),
    };
    const singleLineCard = new TuiAgentActivityCard(singleLineActivity);
    expect(singleLineCard.render(48).length).toBeLessThanOrEqual(24);
    expect(singleLineActivity.output).toHaveLength(5_000);
  });

  it("keeps collapsed Thinking to one terminal row and bounds expanded rows", () => {
    const content = "reasoning ".repeat(500);
    const collapsed = new TuiThinkingBlock(content, false).render(32);
    const expanded = new TuiThinkingBlock(content, true).render(32);
    const mixedWidthContent =
      "The user wants a Xiaohongshu (小红书) visual post based on MemGPT. "
      + "Load the xiaohongshu-visual-post skill before proceeding. ".repeat(4);
    const mixedWidthCollapsed = new TuiThinkingBlock(
      mixedWidthContent,
      false,
    ).render(213);

    expect(collapsed).toHaveLength(1);
    expect(visibleWidth(collapsed[0])).toBeLessThanOrEqual(32);
    expect(mixedWidthCollapsed).toHaveLength(1);
    expect(visibleWidth(mixedWidthCollapsed[0])).toBeLessThanOrEqual(213);
    expect(expanded.length).toBeLessThanOrEqual(19);
  });

  it("compacts long user messages without changing canonical live or replay text", () => {
    const content = [
      "[file:MemGPT.pdf] ## MemGPT 笔记整理",
      ...Array.from(
        { length: 20 },
        (_, index) => `第 ${index + 1} 行详细笔记 ${"内容".repeat(40)}`,
      ),
    ].join("\n");
    const formatted = stripAnsi(formatUserMessageForTui(content));

    expect(formatted).toContain("[file:MemGPT.pdf] ## MemGPT 笔记整理");
    expect(formatted).toContain(`${content.length.toLocaleString()} chars`);
    expect(formatted).toContain("21 lines");
    expect(formatted).not.toContain("第 1 行详细笔记");

    const live = new ConversationView({ requestRender: vi.fn() } as any);
    live.addUserMessage(content);
    expect(live.getMessages()[0].content).toBe(content);
    expect(stripAnsi(live.component.render(120).join("\n"))).not.toContain(
      "第 1 行详细笔记",
    );

    const replay = new ConversationView({ requestRender: vi.fn() } as any);
    replay.replayMessages([{
      id: "user-history",
      role: "user",
      content,
    }]);
    expect(replay.getMessages()[0].content).toBe(content);
    expect(stripAnsi(replay.component.render(120).join("\n"))).toContain(
      "21 lines",
    );
    expect(stripAnsi(replay.component.render(120).join("\n"))).not.toContain(
      "第 1 行详细笔记",
    );
  });

  it("uses the Agent card as the only successful spawn representation", () => {
    const view = new ConversationView({ requestRender: vi.fn() } as any);
    view.startAssistantMessage();
    view.textDelta("Delegating this task.");
    view.toolStart("spawn_agent", { application: "general" }, "spawn-1");
    view.upsertAgentActivity({
      agentId: "agent-live",
      parentSessionId: "session-1",
      label: "Researcher",
      application: "general",
      attachment: "foreground",
      state: "waiting",
      input: "inspect implementation",
      progress: { phase: "tool", message: "Running bash" },
      createdAt: 1000,
      startedAt: 2000,
    });

    const live = stripAnsi(view.component.render(72).join("\n"));
    expect(live).toContain("╭");
    expect(live).toContain("Running bash");
    expect(live).not.toContain("spawn_agent");

    view.toolEnd("spawn_agent", { state: "completed" }, false, "spawn-1");
    view.finishAssistantMessage();

    const blocks = (view as any).blocks as Array<{ type: string }>;
    expect(blocks.map((block) => block.type)).toEqual(["text", "agent"]);
    const committed = stripAnsi(view.component.render(72).join("\n"));
    expect(committed).not.toContain("spawn_agent");
    expect(committed).toContain("Researcher");
  });

  it("keeps a failed pre-spawn tool visible when no Agent card exists", () => {
    const view = new ConversationView({ requestRender: vi.fn() } as any);
    view.startAssistantMessage();
    view.toolStart("spawn_agent", { application: "missing" }, "spawn-failed");
    view.toolEnd(
      "spawn_agent",
      "Unknown Agent Application",
      true,
      "spawn-failed",
    );
    view.finishAssistantMessage();

    const rendered = stripAnsi(view.component.render(72).join("\n"));
    expect(rendered).toContain("spawn_agent");
    expect(rendered).toContain("Unknown Agent Application");
    expect(rendered).not.toContain("SubAgent");
  });

  it("keeps Chat summaries compact without forcing permission tools open", () => {
    const view = new ConversationView({ requestRender: vi.fn() } as any);
    view.startAssistantMessage();
    view.thinkingDelta("Detailed reasoning retained in the turn");
    expect(stripAnsi(view.component.render(72).join("\n"))).toContain(
      "› Thinking",
    );
    expect(stripAnsi(view.component.render(72).join("\n"))).toContain("› Thinking");
    expect(view.getActiveExecutionStatus()).toBe("Thinking");

    view.toolStart("read_file", { path: "notes.md" }, "main-read");
    expect(view.getActiveExecutionStatus()).toBe("Main · read_file · running");
    view.toolEnd("read_file", "done", false, "main-read");

    view.upsertAgentActivity({
      agentId: "agent-fold",
      parentSessionId: "session-1",
      label: "Researcher",
      application: "general",
      attachment: "foreground",
      state: "completed",
      input: "inspect",
      output: "Done",
      createdAt: 1000,
      endedAt: 2000,
      tools: [{
        toolCallId: "call-1",
        name: "read_file",
        status: "completed",
        startedAt: 1100,
        endedAt: 1200,
      }],
    });
    expect(stripAnsi(view.component.render(72).join("\n"))).toContain(
      "› Tools · 1 total · 1 done",
    );
    view.upsertAgentActivity({
      agentId: "agent-fold",
      parentSessionId: "session-1",
      label: "Researcher",
      application: "general",
      attachment: "foreground",
      state: "waiting",
      input: "inspect",
      createdAt: 1000,
      tools: [{
        toolCallId: "call-2",
        name: "bash",
        status: "permission",
        startedAt: 1300,
      }],
      permission: {
        toolCallId: "call-2",
        toolName: "bash",
        preview: "$ pwd",
      },
    });
    const permission = stripAnsi(view.component.render(72).join("\n"));
    expect(permission).toContain("bash  permission");
    expect(permission).toContain("⌄ Tools");
    expect(view.getActiveExecutionStatus()).toBe(
      "Researcher · bash · permission required",
    );

    view.upsertAgentActivity({
      agentId: "agent-fold",
      parentSessionId: "session-1",
      label: "Researcher",
      application: "general",
      attachment: "foreground",
      state: "running",
      input: "inspect",
      createdAt: 1000,
      tools: [{
        toolCallId: "call-2",
        name: "bash",
        status: "running",
        startedAt: 1300,
      }],
    });
    expect(stripAnsi(view.component.render(72).join("\n"))).toContain(
      "⌄ Tools · 1 total · 1 active",
    );
    expect(stripAnsi(view.component.render(72).join("\n"))).toContain(
      "◌ bash",
    );
    expect(view.getActiveExecutionStatus()).toBe(
      "Researcher · bash · running",
    );
  });

  it("renders an empty Main Tool result as completed", () => {
    const view = new ConversationView({ requestRender: vi.fn() } as any);
    view.startAssistantMessage();
    view.toolStart("bash", { command: "true" }, "call-empty");
    view.toolEnd("bash", "", false, "call-empty");

    const rendered = stripAnsi(view.component.render(72).join("\n"));
    expect(rendered).toContain("✓ bash");
    expect(rendered).not.toContain("⟳ bash");
  });

  it("keeps a multiline Main Tool result on one Chat summary row", () => {
    const view = new ConversationView({ requestRender: vi.fn() } as any);
    const output = Array.from(
      { length: 80 },
      (_, index) => `result line ${index + 1}`,
    ).join("\n");
    view.startAssistantMessage();
    view.toolStart("read_file", { path: "large.txt" }, "call-large");
    view.toolEnd("read_file", output, false, "call-large");

    const lines = view.component.render(120).map((line) => stripAnsi(line));
    expect(lines.join("\n")).toContain("80 lines");
    expect(lines.join("\n")).not.toContain("result line");
  });

  it("binds an interactive permission prompt by tool call identity", () => {
    const view = new ConversationView({ requestRender: vi.fn() } as any);
    view.upsertAgentActivity({
      agentId: "agent-runtime",
      parentSessionId: "session-1",
      application: "general",
      attachment: "foreground",
      state: "waiting",
      input: "inspect",
      createdAt: 1000,
      tools: [{
        toolCallId: "call-permission",
        name: "bash",
        status: "permission",
        startedAt: 1100,
      }],
      permission: {
        toolCallId: "call-permission",
        toolName: "bash",
        preview: "$ pwd",
      },
    });
    view.showPermissionPrompt("bash", "$ pwd", null, null, {
      agentId: "stale-agent-id",
      toolCallId: "call-permission",
    });

    const rendered = stripAnsi(view.component.render(100).join("\n"));
    expect(rendered).toContain("bash  permission");
    expect(rendered).toContain("Owner: SubAgent > bash");
    expect(rendered).toContain("▶ Allow once  [1]");
    expect(rendered).toContain("Allow matching calls for this Session  [2]");
  });

  it("compacts Skill resource paths in live Main Tool rows", () => {
    const view = new ConversationView({ requestRender: vi.fn() } as any);
    view.startAssistantMessage();
    view.toolStart("read_file", {
      path: "/Users/test/project/.dscode/skills/visual-post/references/output-contract.md",
    }, "call-read");

    const rendered = stripAnsi(view.component.render(120).join("\n"));
    expect(rendered).toContain(
      'path="visual-post/references/output-contract.md"',
    );
    expect(rendered).not.toContain("/Users/test/project");
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

    const blocks = (view as any).blocks as Array<{
      type: string;
      content?: string;
      activity?: { agentId: string };
    }>;
    expect(blocks.map((block) => block.type)).toEqual([
      "text",
      "agent",
      "thinking",
      "text",
    ]);
    expect(blocks[1].activity?.agentId).toBe("agent-history");
    expect(blocks[2].content).toBe("Consider results");
    expect(blocks[3].content).toContain("read_file");
    expect(blocks[3].content).toContain("Answer");
  });
});
