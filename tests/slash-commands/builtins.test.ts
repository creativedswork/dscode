import { describe, expect, it, vi } from "vitest";

import {
  executeSlashCommand,
  getSlashCommandAutocomplete,
  resolveCustomCommand,
} from "../../src/slash-commands/builtins.js";

function makeContext(
  harnessOverrides: Record<string, unknown> = {},
  uiOverrides: Record<string, unknown> = {},
) {
  return {
    harness: {
      conversation: {
        reset: vi.fn(),
        snapshot: () => ({ messages: [], agentMessages: [], modelName: "model" }),
      },
      sessions: {
        currentId: () => undefined,
      },
      settings: {
        get: () => ({
          provider: "test",
          modelId: "model",
          projectPath: "/project",
        }),
      },
      mcp: { list: () => [] },
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
          mcp: {
            list: () => [{ name: "github", status: "connected", toolCount: 2 }],
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
          mcp: { list: () => [] },
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
        { conversation: { reset } },
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
        sessions: {
          currentId: () => undefined,
          switch: switchSession,
        },
      },
      { clearConversationView, replayMessages, takePendingPermission },
    );

    await executeSlashCommand("/session load TARGET", context);

    expect(switchSession).toHaveBeenCalledWith({
      sessionIdOrPrefix: "TARGET",
      pendingPermission: { toolName: "bash", preview: "echo test" },
    });
    expect(clearConversationView).toHaveBeenCalledOnce();
    expect(replayMessages).toHaveBeenCalledWith([
      { role: "user", content: "target" },
    ]);
    expect(context.harness.sessionManager).toBeUndefined();
  });

  it("uses the same command catalog for autocomplete and custom expansion", () => {
    const manifest = {
      name: "review",
      description: "Review code",
      body: "Review $input",
      source: "project" as const,
      path: "/project/.dscode/commands/review.md",
    };
    const context = makeContext({
      commands: {
        get: (name: string) => name === manifest.name ? manifest : undefined,
      },
    });

    expect(getSlashCommandAutocomplete([manifest])).toContainEqual({
      name: "review",
      description: "Review code",
    });
    expect(resolveCustomCommand("/review src/main.ts", context))
      .toBe("Review src/main.ts");
  });
});
