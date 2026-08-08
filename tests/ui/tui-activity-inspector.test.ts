import { describe, expect, it, vi } from "vitest";

import {
  buildTuiInspectableActivities,
  selectCurrentActivity,
  TuiActivityInspector,
} from "../../src/ui/tui-activity-inspector.js";
import type { UIMessage } from "../../src/ui/shared/types.js";

function stripAnsi(text: string): string {
  return text.replace(/\u001b\[[0-9;]*m/g, "");
}

describe("TuiActivityInspector", () => {
  it("treats an empty Tool result projection as completed", () => {
    const activities = buildTuiInspectableActivities([{
      id: "assistant-1",
      role: "assistant",
      content: "",
      tools: [{
        toolCallId: "call-empty",
        name: "bash",
        args: "true",
        result: "",
        resultDetail: {
          summary: "",
          text: "",
          charCount: 0,
          lineCount: 0,
        },
        isError: false,
      }],
    }]);

    expect(activities[0]).toMatchObject({
      id: "main-tool:call-empty",
      status: "completed",
    });
  });

  it("does not fabricate an identity for a legacy Agent Tool", () => {
    const activities = buildTuiInspectableActivities([{
      id: "agent-legacy",
      role: "agent",
      content: "",
      agentActivity: {
        agentId: "agent-legacy",
        parentSessionId: "session-1",
        label: "Researcher",
        application: "general",
        attachment: "foreground",
        state: "completed",
        input: "inspect",
        createdAt: 1000,
        tools: [{
          name: "read_file",
          status: "completed",
          startedAt: 1100,
          summary: "summary only",
        }],
      },
    } as UIMessage]);

    expect(activities.map((activity) => activity.id)).toEqual([
      "agent:agent-legacy",
    ]);
  });

  it("auto-selects Permission, running Tool, streaming Thinking, then recent activity", () => {
    const messages: UIMessage[] = [{
      id: "assistant-1",
      role: "assistant",
      content: "",
      thinking: "working",
      isStreaming: true,
      tools: [{
        toolCallId: "main-running",
        name: "read_file",
        args: "a.ts",
        result: "",
        isError: false,
      }],
    }, {
      id: "agent-agent-1",
      role: "agent",
      content: "",
      agentActivity: {
        agentId: "agent-1",
        parentSessionId: "session-1",
        label: "Researcher",
        application: "general",
        attachment: "foreground",
        state: "waiting",
        input: "inspect",
        createdAt: 1000,
        tools: [{
          toolCallId: "agent-permission",
          name: "bash",
          status: "permission",
          startedAt: 1100,
        }],
        permission: {
          toolCallId: "agent-permission",
          toolName: "bash",
          preview: "pwd",
        },
      },
    }];

    const activities = buildTuiInspectableActivities(messages);
    expect(selectCurrentActivity(activities)).toBe(
      "agent-tool:agent-1:agent-permission",
    );
    expect(selectCurrentActivity(
      activities.filter((activity) => activity.status !== "permission"),
    )).toBe("main-tool:main-running");
    expect(selectCurrentActivity(
      activities.filter((activity) =>
        activity.kind !== "main-tool"
        && activity.kind !== "agent"
        && activity.kind !== "agent-tool"
      ),
    )).toBe("thinking:assistant-1");
  });

  it("keeps stable selection and disclosure across streaming updates", () => {
    let messages: UIMessage[] = [{
      id: "assistant-1",
      role: "assistant",
      content: "",
      thinking: "first thought",
      isStreaming: true,
    }];
    const inspector = new TuiActivityInspector(
      () => messages,
      () => undefined,
      vi.fn(),
      vi.fn(),
    );

    inspector.handleInput("\r");
    messages = [{
      ...messages[0],
      thinking: "first thought, then more detail",
      tools: [{
        toolCallId: "new-tool",
        name: "read_file",
        args: "a.ts",
        result: "",
        isError: false,
      }],
    }];
    inspector.refresh();

    expect(inspector.getSelection()).toBe("thinking:assistant-1");
    expect(stripAnsi(inspector.render(80).join("\n"))).toContain(
      "first thought, then more detail",
    );
  });

  it("keeps a selected running Tool visible when its Execution completes", () => {
    let messages: UIMessage[] = [{
      id: "agent-1",
      role: "agent",
      content: "",
      agentActivity: {
        agentId: "agent-1",
        parentSessionId: "session-1",
        label: "Researcher",
        application: "general",
        attachment: "foreground",
        state: "running",
        input: "inspect",
        createdAt: 1000,
        tools: [{
          toolCallId: "call-1",
          name: "read_file",
          status: "running",
          startedAt: 1100,
        }],
      },
    }];
    const inspector = new TuiActivityInspector(
      () => messages,
      () => undefined,
      vi.fn(),
      vi.fn(),
    );

    expect(inspector.getSelection()).toBe("agent-tool:agent-1:call-1");
    messages = [{
      ...messages[0],
      agentActivity: {
        ...messages[0].agentActivity!,
        state: "completed",
        endedAt: 1300,
        tools: [{
          toolCallId: "call-1",
          name: "read_file",
          status: "completed",
          startedAt: 1100,
          endedAt: 1200,
        }],
      },
    }];
    inspector.refresh();

    expect(inspector.getSelection()).toBe("agent-tool:agent-1:call-1");
    expect(stripAnsi(inspector.render(80).join("\n"))).toContain(
      "Researcher > read_file",
    );

    inspector.handleInput("\x1b[D");
    expect(inspector.getSelection()).toBe("agent:agent-1");
    expect(stripAnsi(inspector.render(80).join("\n"))).not.toContain(
      "Researcher > read_file",
    );
  });

  it("preserves manual disclosure while Permission temporarily locks its owner open", () => {
    let messages: UIMessage[] = [{
      id: "agent-1",
      role: "agent",
      content: "",
      agentActivity: {
        agentId: "agent-1",
        parentSessionId: "session-1",
        label: "Researcher",
        application: "general",
        attachment: "foreground",
        state: "running",
        input: "inspect",
        createdAt: 1000,
        tools: [{
          toolCallId: "call-1",
          name: "bash",
          status: "completed",
          startedAt: 1100,
          endedAt: 1200,
        }],
      },
    }];
    const inspector = new TuiActivityInspector(
      () => messages,
      () => undefined,
      vi.fn(),
      vi.fn(),
    );

    expect(inspector.getSelection()).toBe("agent:agent-1");
    expect(stripAnsi(inspector.render(80).join("\n"))).toContain(
      "Researcher > bash",
    );
    inspector.handleInput("\r");
    expect(stripAnsi(inspector.render(80).join("\n"))).not.toContain(
      "Researcher > bash",
    );

    messages = [{
      ...messages[0],
      agentActivity: {
        ...messages[0].agentActivity!,
        state: "waiting",
        tools: [{
          toolCallId: "call-1",
          name: "bash",
          status: "permission",
          startedAt: 1100,
        }],
        permission: {
          toolCallId: "call-1",
          toolName: "bash",
          preview: "pwd",
        },
      },
    }];
    inspector.refresh();
    expect(stripAnsi(inspector.render(80).join("\n"))).toContain(
      "Researcher > bash",
    );

    inspector.handleInput("\r");
    expect(stripAnsi(inspector.render(80).join("\n"))).toContain(
      "Researcher > bash",
    );

    messages = [{
      ...messages[0],
      agentActivity: {
        ...messages[0].agentActivity!,
        state: "running",
        permission: undefined,
        tools: [{
          toolCallId: "call-1",
          name: "bash",
          status: "running",
          startedAt: 1100,
        }],
      },
    }];
    inspector.refresh();
    expect(stripAnsi(inspector.render(80).join("\n"))).not.toContain(
      "Researcher > bash",
    );
  });

  it("wraps Tab navigation and falls back when the selected item disappears", () => {
    let messages: UIMessage[] = [{
      id: "assistant-1",
      role: "assistant",
      content: "",
      thinking: "think",
      tools: [{
        toolCallId: "call-1",
        name: "read_file",
        args: "a.ts",
        result: "",
        isError: false,
      }],
    }];
    const inspector = new TuiActivityInspector(
      () => messages,
      () => undefined,
      vi.fn(),
      vi.fn(),
    );
    inspector.restoreSelection("thinking:assistant-1");

    inspector.handleInput("\t");
    expect(inspector.getSelection()).toBe("main-tool:call-1");
    inspector.handleInput("\t");
    expect(inspector.getSelection()).toBe("thinking:assistant-1");
    inspector.handleInput("\x1b[Z");
    expect(inspector.getSelection()).toBe("main-tool:call-1");

    messages = [{
      id: "assistant-2",
      role: "assistant",
      content: "",
      thinking: "replacement",
      isStreaming: true,
    }];
    inspector.refresh();
    expect(inspector.getSelection()).toBe("thinking:assistant-2");
  });

  it("pages complete inline output beyond previous character limits", () => {
    const output = Array.from(
      { length: 240 },
      (_, index) => `result line ${index + 1}`,
    ).join("\n");
    const messages: UIMessage[] = [{
      id: "assistant-1",
      role: "assistant",
      content: "",
      tools: [{
        toolCallId: "call-long",
        name: "read_file",
        args: "large.txt",
        result: "summary",
        resultDetail: {
          summary: "summary",
          text: output,
          charCount: output.length,
          lineCount: 240,
        },
        isError: false,
      }],
    }];
    const onClose = vi.fn();
    const inspector = new TuiActivityInspector(
      () => messages,
      () => undefined,
      onClose,
      vi.fn(),
    );

    inspector.handleInput("\r");
    const firstPage = stripAnsi(inspector.render(80).join("\n"));
    expect(firstPage).toContain("Lines 1-12 of 240");
    expect(firstPage).toContain("result line 1");
    expect(firstPage).not.toContain("result line 120");
    expect(firstPage).toContain("↑↓/J/K scroll");

    inspector.handleInput("\x1b[B");
    expect(stripAnsi(inspector.render(80).join("\n"))).toContain(
      "Lines 2-13 of 240",
    );
    inspector.handleInput("k");
    expect(stripAnsi(inspector.render(80).join("\n"))).toContain(
      "Lines 1-12 of 240",
    );

    inspector.handleInput("\x1b[6~");
    const secondPage = stripAnsi(inspector.render(80).join("\n"));
    expect(secondPage).toContain("Lines 13-24 of 240");
    expect(secondPage).toContain("result line 13");
    expect(output).toContain("result line 240");

    inspector.handleInput("\x1b");
    expect(inspector.isOutputOpen()).toBe(false);
    expect(inspector.getSelection()).toBe("main-tool:call-long");
    expect(onClose).not.toHaveBeenCalled();

    inspector.handleInput("\r");
    inspector.handleInput("\x1b[D");
    expect(inspector.isOutputOpen()).toBe(false);

    inspector.handleInput("\x1b");
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("resolves referenced output without copying it into the snapshot", () => {
    const output = "resolved from process store";
    const messages: UIMessage[] = [{
      id: "agent-1",
      role: "agent",
      content: "",
      agentActivity: {
        agentId: "agent-1",
        parentSessionId: "session-1",
        application: "general",
        attachment: "foreground",
        state: "completed",
        input: "inspect",
        createdAt: 1000,
        tools: [{
          toolCallId: "call-ref",
          name: "bash",
          status: "completed",
          startedAt: 1100,
          endedAt: 1200,
          resultDetail: {
            summary: "summary",
            ref: {
              owner: "agent-process",
              ownerId: "agent-1",
              toolCallId: "call-ref",
            },
          },
        }],
      },
    }];
    const inspector = new TuiActivityInspector(
      () => messages,
      (ref) => ref.toolCallId === "call-ref" ? output : undefined,
      vi.fn(),
      vi.fn(),
    );

    inspector.handleInput("\r");
    inspector.handleInput("\t");
    inspector.handleInput("\r");

    expect(stripAnsi(inspector.render(80).join("\n"))).toContain(output);
    expect(messages[0].agentActivity?.tools?.[0].resultDetail?.text).toBeUndefined();
  });

  it("collapses completed Execution tools and reveals them with Enter", () => {
    const messages: UIMessage[] = [{
      id: "agent-1",
      role: "agent",
      content: "",
      agentActivity: {
        agentId: "agent-1",
        parentSessionId: "session-1",
        label: "Researcher",
        application: "general",
        attachment: "foreground",
        state: "completed",
        input: "inspect",
        output: "done",
        createdAt: 1000,
        endedAt: 2000,
        tools: [{
          toolCallId: "call-1",
          name: "read_file",
          status: "completed",
          startedAt: 1100,
          endedAt: 1200,
          resultDetail: { summary: "done", text: "done" },
        }],
      },
    }];
    const inspector = new TuiActivityInspector(
      () => messages,
      () => undefined,
      vi.fn(),
      vi.fn(),
    );

    expect(inspector.getSelection()).toBe("agent:agent-1");
    expect(stripAnsi(inspector.render(80).join("\n"))).not.toContain(
      "Researcher > read_file",
    );

    inspector.handleInput("\r");

    expect(stripAnsi(inspector.render(80).join("\n"))).toContain(
      "Researcher > read_file",
    );

    messages[0] = {
      ...messages[0],
      agentActivity: {
        ...messages[0].agentActivity!,
        output: "updated",
      },
    };
    inspector.refresh();
    expect(stripAnsi(inspector.render(80).join("\n"))).toContain(
      "Researcher > read_file",
    );
  });
});
