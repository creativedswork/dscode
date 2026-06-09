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

    executeSlashCommand(
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

    await Promise.resolve();

    expect(openMcpBrowser).toHaveBeenCalledOnce();
  });

  it("shows an info message when no MCP servers are configured", async () => {
    const addInfo = vi.fn();
    const addError = vi.fn();

    executeSlashCommand(
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

    await Promise.resolve();

    expect(addInfo).toHaveBeenCalledWith("No MCP servers configured.");
    expect(addError).not.toHaveBeenCalled();
  });

  it("clears the visible conversation on /reset", async () => {
    const reset = vi.fn();
    const clearConversationView = vi.fn();
    const addInfo = vi.fn();

    executeSlashCommand(
      "/reset",
      makeContext(
        { agent: { reset, state: { messages: [] } } },
        { clearConversationView, addInfo },
      ),
    );

    await Promise.resolve();

    expect(reset).toHaveBeenCalledOnce();
    expect(clearConversationView).toHaveBeenCalledOnce();
    expect(addInfo).not.toHaveBeenCalledWith("(conversation reset)");
  });
});
