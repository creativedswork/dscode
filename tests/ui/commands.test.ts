import { describe, expect, it, vi } from "vitest";

import { executeSlashCommand } from "../../src/ui/commands.js";

function makeContext(
  harnessOverrides: Record<string, unknown> = {},
  uiOverrides: Record<string, unknown> = {},
) {
  return {
    harness: {
      agent: { reset: vi.fn(), state: { messages: [] } },
      sessionManager: { trySaveSession: vi.fn(), createSession: vi.fn(), persistEmptySession: vi.fn(), getCurrentSessionId: () => null },
      memoryManager: {},
      driverRegistry: {},
      toolRegistry: {},
      skillManager: {},
      permissionManager: {},
      contextManager: {},
      config: {},
      onSetModel: vi.fn(),
      onSetThinking: vi.fn(),
      onSetCwd: vi.fn(),
      ...harnessOverrides,
    },
    ui: {
      addInfo: vi.fn(),
      addError: vi.fn(),
      ...uiOverrides,
    },
  } as any;
}

describe("slash commands", () => {
  it("opens the MCP browser when MCP servers are available", async () => {
    const openMcpBrowser = vi.fn();

    await executeSlashCommand(
      "/mcp",
      makeContext(
        {
          mcpManager: {
            getStates: () => [{ config: { name: "github" }, status: "connected", toolCount: 2 }],
          },
        },
        { openMcpBrowser },
      ),
    );

    expect(openMcpBrowser).toHaveBeenCalledOnce();
  });

  it("shows an info message when no MCP servers are configured", async () => {
    const addInfo = vi.fn();
    const addError = vi.fn();

    await executeSlashCommand(
      "/mcp",
      makeContext(
        {
          mcpManager: {
            getStates: () => [],
          },
        },
        { addInfo, addError },
      ),
    );

    expect(addInfo).toHaveBeenCalledWith("No MCP servers configured.");
    expect(addError).not.toHaveBeenCalled();
  });

  it("clears the visible conversation on /reset", async () => {
    const reset = vi.fn();
    const clearConversationView = vi.fn();
    const addInfo = vi.fn();

    await executeSlashCommand(
      "/reset",
      makeContext(
        { agent: { reset, state: { messages: [] } } },
        { clearConversationView, addInfo },
      ),
    );

    expect(reset).toHaveBeenCalledOnce();
    expect(clearConversationView).toHaveBeenCalledOnce();
    expect(addInfo).not.toHaveBeenCalledWith("(conversation reset)");
  });

  it("loads sessions through the unified Harness switch API", async () => {
    const switchSession = vi.fn(async () => ({
      session: {
        id: "TARGET-SESSION",
        title: "Target",
        createdAt: 1,
        updatedAt: 2,
        modelProvider: "test",
        modelId: "model",
        messageCount: 1,
        projectPath: "/project",
      },
      messages: [{ role: "user", content: "target" }],
      agentMessages: [],
    }));
    const clearConversationView = vi.fn();
    const replayMessages = vi.fn();
    const takePendingPermission = vi.fn(() => ({
      toolName: "bash",
      preview: "echo test",
    }));
    const context = makeContext(
      {
        switchSession,
        agent: { reset: vi.fn(), state: { messages: [{ role: "user", content: "target" }] } },
      },
      { clearConversationView, replayMessages, takePendingPermission },
    );

    await executeSlashCommand("/session load TARGET", context);

    expect(switchSession).toHaveBeenCalledWith({
      sessionIdOrPrefix: "TARGET",
      pendingPermission: { toolName: "bash", preview: "echo test" },
    });
    expect(clearConversationView).toHaveBeenCalledOnce();
    expect(replayMessages).toHaveBeenCalledWith(context.harness.agent.state.messages);
    expect(context.harness.sessionManager.loadSession).toBeUndefined();
  });
});
