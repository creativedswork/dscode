import { describe, expect, it, vi } from "vitest";

import { executeSlashCommand } from "../../src/ui/commands.js";

function makeContext(overrides: Record<string, unknown> = {}) {
  return {
    agent: { reset: vi.fn(), state: { messages: [] } },
    sessionManager: {},
    memoryManager: {},
    driverRegistry: {},
    toolRegistry: {},
    skillManager: {},
    permissionManager: {},
    contextManager: {},
    config: {},
    onSetModel: vi.fn(),
    onSetThinking: vi.fn(),
    ...overrides,
  } as any;
}

describe("slash commands", () => {
  it("opens the MCP browser when MCP servers are available", async () => {
    const openMcpBrowser = vi.fn();
    const addInfo = vi.fn();
    const addError = vi.fn();

    executeSlashCommand(
      "/mcp",
      makeContext({
        mcpManager: {
          getStates: () => [{ config: { name: "github" }, status: "connected", toolCount: 2 }],
        },
      }),
      { openMcpBrowser, addInfo, addError } as any,
    );

    await Promise.resolve();

    expect(openMcpBrowser).toHaveBeenCalledOnce();
    expect(addInfo).not.toHaveBeenCalled();
    expect(addError).not.toHaveBeenCalled();
  });

  it("shows an info message when no MCP servers are configured", async () => {
    const openMcpBrowser = vi.fn();
    const addInfo = vi.fn();
    const addError = vi.fn();

    executeSlashCommand(
      "/mcp",
      makeContext({
        mcpManager: {
          getStates: () => [],
        },
      }),
      { openMcpBrowser, addInfo, addError } as any,
    );

    await Promise.resolve();

    expect(openMcpBrowser).not.toHaveBeenCalled();
    expect(addInfo).toHaveBeenCalledWith("No MCP servers configured.");
    expect(addError).not.toHaveBeenCalled();
  });

  it("clears the visible conversation on /reset", async () => {
    const reset = vi.fn();
    const clearConversationView = vi.fn();
    const addInfo = vi.fn();

    executeSlashCommand(
      "/reset",
      makeContext({ agent: { reset, state: { messages: [] } } }),
      { clearConversationView, addInfo } as any,
    );

    await Promise.resolve();

    expect(reset).toHaveBeenCalledOnce();
    expect(clearConversationView).toHaveBeenCalledOnce();
    expect(addInfo).not.toHaveBeenCalledWith("(conversation reset)");
  });
});
