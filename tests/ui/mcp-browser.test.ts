import { describe, expect, it } from "vitest";
import { Type } from "@mariozechner/pi-ai";

import { DriverRegistry } from "../../src/drivers/registry.js";
import { ToolRegistry } from "../../src/drivers/tool-registry.js";
import { makeDiscoveryDriver } from "../../src/drivers/discovery.js";
import {
  buildMcpServers,
  createInitialMcpBrowserState,
  getMcpVisibleRows,
  reduceMcpBrowserState,
  renderMcpServerList,
  renderMcpToolList,
} from "../../src/ui/mcp-browser.js";
import type { McpBrowserState } from "../../src/ui/mcp-browser.js";
import type { MCPServerState } from "../../src/mcp/types.js";

function makeSkillTool() {
  return {
    name: "skill",
    label: "Skill",
    description: "Load a skill",
    parameters: Type.Object({ name: Type.String() }),
    execute: async () => ({ content: [{ type: "text", text: "ok" }] }),
  };
}

function makeState(overrides: Partial<McpBrowserState> = {}): McpBrowserState {
  return {
    selectedServerIndex: null,
    serverSelection: 0,
    serverWindowStart: 0,
    toolSelection: 0,
    toolWindowStart: 0,
    ...overrides,
  };
}

describe("reduceMcpBrowserState", () => {
  describe("initial state", () => {
    it("creates a clean initial state", () => {
      const state = createInitialMcpBrowserState();
      expect(state).toEqual({
        selectedServerIndex: null,
        serverSelection: 0,
        serverWindowStart: 0,
        toolSelection: 0,
        toolWindowStart: 0,
      });
    });
  });

  describe("escape", () => {
    it("closes the browser from server list", () => {
      const result = reduceMcpBrowserState(makeState(), { type: "escape" }, 3, 0);
      expect(result.shouldClose).toBe(true);
    });

    it("returns to server list from tool list", () => {
      const result = reduceMcpBrowserState(
        makeState({ selectedServerIndex: 0, toolSelection: 5, toolWindowStart: 3 }),
        { type: "escape" },
        3,
        10,
      );
      expect(result.shouldClose).toBe(false);
      expect(result.state.selectedServerIndex).toBeNull();
      expect(result.state.toolSelection).toBe(0);
      expect(result.state.toolWindowStart).toBe(0);
      expect(result.state.serverSelection).toBe(0);
    });
  });

  describe("enter", () => {
    it("opens the tool list for the selected server", () => {
      const result = reduceMcpBrowserState(
        makeState({ serverSelection: 1 }),
        { type: "enter" },
        3,
        10,
      );
      expect(result.shouldClose).toBe(false);
      expect(result.state.selectedServerIndex).toBe(1);
      expect(result.state.toolSelection).toBe(0);
      expect(result.state.toolWindowStart).toBe(0);
    });

    it("closes the browser when no servers exist", () => {
      const result = reduceMcpBrowserState(makeState(), { type: "enter" }, 0, 0);
      expect(result.shouldClose).toBe(true);
    });

    it("is a no-op when already viewing a tool list", () => {
      const state = makeState({ selectedServerIndex: 0, toolSelection: 3 });
      const result = reduceMcpBrowserState(state, { type: "enter" }, 3, 10);
      expect(result.state).toEqual(state);
      expect(result.shouldClose).toBe(false);
    });

    it("opens the first server by default", () => {
      const result = reduceMcpBrowserState(makeState(), { type: "enter" }, 5, 20);
      expect(result.state.selectedServerIndex).toBe(0);
      expect(result.state.toolSelection).toBe(0);
    });
  });

  describe("up", () => {
    it("moves server selection up", () => {
      const result = reduceMcpBrowserState(
        makeState({ serverSelection: 2 }),
        { type: "up" },
        5,
        0,
      );
      expect(result.state.serverSelection).toBe(1);
      expect(result.state.serverWindowStart).toBe(0); // 5 servers fit in visible rows, no scroll needed
      expect(result.shouldClose).toBe(false);
    });

    it("clamps server selection at 0", () => {
      const result = reduceMcpBrowserState(
        makeState({ serverSelection: 0 }),
        { type: "up" },
        5,
        0,
      );
      expect(result.state.serverSelection).toBe(0);
    });

    it("moves tool selection up in tool list", () => {
      const result = reduceMcpBrowserState(
        makeState({ selectedServerIndex: 0, toolSelection: 5, toolWindowStart: 3 }),
        { type: "up" },
        3,
        15,
      );
      expect(result.state.toolSelection).toBe(4);
      expect(result.state.toolWindowStart).toBe(4);
    });

    it("clamps tool selection at 0", () => {
      const result = reduceMcpBrowserState(
        makeState({ selectedServerIndex: 0, toolSelection: 0 }),
        { type: "up" },
        3,
        15,
      );
      expect(result.state.toolSelection).toBe(0);
    });

    it("handles empty tool list", () => {
      const result = reduceMcpBrowserState(
        makeState({ selectedServerIndex: 0, toolSelection: 0 }),
        { type: "up" },
        3,
        0,
      );
      expect(result.state.toolSelection).toBe(0);
      expect(result.state.toolWindowStart).toBe(0);
    });
  });

  describe("down", () => {
    it("moves server selection down", () => {
      const result = reduceMcpBrowserState(
        makeState({ serverSelection: 0 }),
        { type: "down" },
        10,
        0,
      );
      expect(result.state.serverSelection).toBe(1);
    });

    it("scrolls server window when selection exceeds visible range", () => {
      const result = reduceMcpBrowserState(
        makeState({ serverSelection: 7, serverWindowStart: 0 }),
        { type: "down" },
        10,
        0,
      );
      expect(result.state.serverSelection).toBe(8);
      expect(result.state.serverWindowStart).toBe(1);
    });

    it("clamps server selection at max", () => {
      const result = reduceMcpBrowserState(
        makeState({ serverSelection: 4 }),
        { type: "down" },
        5,
        0,
      );
      expect(result.state.serverSelection).toBe(4);
    });

    it("moves tool selection down and scrolls", () => {
      const result = reduceMcpBrowserState(
        makeState({ selectedServerIndex: 0, toolSelection: 7, toolWindowStart: 0 }),
        { type: "down" },
        3,
        10,
      );
      expect(result.state.toolSelection).toBe(8);
      expect(result.state.toolWindowStart).toBe(1);
    });

    it("clamps tool selection at max", () => {
      const result = reduceMcpBrowserState(
        makeState({ selectedServerIndex: 0, toolSelection: 9 }),
        { type: "down" },
        3,
        10,
      );
      expect(result.state.toolSelection).toBe(9);
    });

    it("handles empty tool list gracefully", () => {
      const result = reduceMcpBrowserState(
        makeState({ selectedServerIndex: 0, toolSelection: 0 }),
        { type: "down" },
        3,
        0,
      );
      expect(result.state.toolSelection).toBe(0);
      expect(result.state.toolWindowStart).toBe(0);
    });
  });

  describe("window clamping", () => {
    it("adjusts server window start when selection moves above it", () => {
      const result = reduceMcpBrowserState(
        makeState({ serverSelection: 5, serverWindowStart: 5 }),
        { type: "up" },
        10,
        0,
      );
      expect(result.state.serverSelection).toBe(4);
      expect(result.state.serverWindowStart).toBe(2); // clamp: 10 servers, 8 visible → max windowStart = 2
    });

    it("does not move window start when selection is still visible", () => {
      const result = reduceMcpBrowserState(
        makeState({ serverSelection: 3, serverWindowStart: 0 }),
        { type: "down" },
        10,
        0,
      );
      expect(result.state.serverSelection).toBe(4);
      expect(result.state.serverWindowStart).toBe(0);
    });

    it("clamps window start to valid range after server count change", () => {
      const result = reduceMcpBrowserState(
        makeState({ serverSelection: 2, serverWindowStart: 3 }),
        { type: "down" },
        5,
        0,
      );
      expect(result.state.serverWindowStart).toBe(0);
    });
  });

  describe("full navigation flow", () => {
    it("enter server → navigate tools → escape back → enter again", () => {
      let result = reduceMcpBrowserState(
        makeState({ serverSelection: 0 }),
        { type: "enter" },
        3,
        33,
      );
      expect(result.shouldClose).toBe(false);
      expect(result.state.selectedServerIndex).toBe(0);
      expect(result.state.toolSelection).toBe(0);

      result = reduceMcpBrowserState(result.state, { type: "down" }, 3, 33);
      expect(result.state.toolSelection).toBe(1);

      result = reduceMcpBrowserState(result.state, { type: "down" }, 3, 33);
      expect(result.state.toolSelection).toBe(2);

      result = reduceMcpBrowserState(result.state, { type: "escape" }, 3, 33);
      expect(result.shouldClose).toBe(false);
      expect(result.state.selectedServerIndex).toBeNull();
      expect(result.state.toolSelection).toBe(0);

      result = reduceMcpBrowserState(result.state, { type: "down" }, 3, 33);
      expect(result.state.serverSelection).toBe(1);

      result = reduceMcpBrowserState(result.state, { type: "enter" }, 3, 33);
      expect(result.state.selectedServerIndex).toBe(1);
      expect(result.state.toolSelection).toBe(0);
    });

    it("escape from server list closes browser", () => {
      const result = reduceMcpBrowserState(makeState(), { type: "escape" }, 3, 0);
      expect(result.shouldClose).toBe(true);
    });
  });
});

describe("buildMcpServers", () => {
  it("maps MCP tools and availability states", () => {
    const registry = new DriverRegistry();
    const toolRegistry = new ToolRegistry(registry);

    registry.register({
      name: "mcp_demo",
      description: "Demo MCP",
      source: "mcp",
      tools: [
        {
          name: "mcp_demo_ping",
          label: "demo: ping",
          description: "Ping the demo server",
          parameters: Type.Object({}),
          execute: async () => ({ content: [] }),
        },
        {
          name: "mcp_demo_search",
          label: "demo: search",
          description: "Search demo data",
          parameters: Type.Object({}),
          execute: async () => ({ content: [] }),
        },
        {
          name: "mcp_demo_delete",
          label: "demo: delete",
          description: "Delete demo data",
          parameters: Type.Object({}),
          execute: async () => ({ content: [] }),
        },
      ],
    });
    registry.register(makeDiscoveryDriver(toolRegistry));

    toolRegistry.initialize(makeSkillTool(), new Set(["mcp_demo_ping"]));
    toolRegistry.markAsDiscovered(["mcp_demo_search"]);

    const states: MCPServerState[] = [
      {
        config: { name: "demo", description: "Demo server", transport: "stdio", command: "demo" },
        status: "connected",
        toolCount: 3,
        resolvedTransport: "streamable-http",
        negotiatedProtocolVersion: "2025-11-25",
        compatibilityMode: "native",
      },
    ];

    const servers = buildMcpServers(states, registry, toolRegistry);

    expect(servers).toHaveLength(1);
    expect(servers[0]).toMatchObject({
      name: "demo",
      description: "Demo server",
      status: "connected",
      toolCount: 3,
    });
    expect(servers[0].tools).toEqual([
      expect.objectContaining({ name: "mcp_demo_ping", state: "loaded" }),
      expect.objectContaining({ name: "mcp_demo_search", state: "loaded" }),
      expect.objectContaining({ name: "mcp_demo_delete", state: "discoverable" }),
    ]);
  });

  it("keeps errored servers even when no driver is registered", () => {
    const registry = new DriverRegistry();
    const toolRegistry = new ToolRegistry(registry);
    registry.register(makeDiscoveryDriver(toolRegistry));
    toolRegistry.initialize(makeSkillTool());

    const states: MCPServerState[] = [
      {
        config: { name: "broken", transport: "stdio", command: "broken" },
        status: "error",
        error: "spawn failed",
        toolCount: 0,
      },
    ];

    const servers = buildMcpServers(states, registry, toolRegistry);

    expect(servers).toEqual([
      expect.objectContaining({
        name: "broken",
        status: "error",
        error: "spawn failed",
        toolCount: 0,
        tools: [],
      }),
    ]);
  });

  it("renders a fixed-height tool window and keeps the selected row visible", () => {
    const server = {
      name: "demo",
      description: "Demo server",
      status: "connected",
      toolCount: 12,
      tools: Array.from({ length: 12 }, (_, index) => ({
        name: `mcp_demo_tool_${index}`,
        label: `demo: tool_${index}`,
        description: `Description ${index}`,
        state: "discoverable" as const,
      })),
    };

    const output = renderMcpToolList(server, 6, 6);
    const lines = output.split("\n");
    const visibleRows = lines.filter((line) => line.includes("demo: tool_")).length;

    expect(output).toContain("demo: tool_6");
    expect(output).toContain("demo: tool_11");
    expect(output).toContain("7/12");
    expect(output).not.toContain("demo: tool_0 [");
    expect(visibleRows).toBe(getMcpVisibleRows(server.tools.length));
  });

  it("renders the server list before opening a tool list", () => {
    const servers = Array.from({ length: 10 }, (_, index) => ({
      name: `server_${index}`,
      description: `Server ${index}`,
      status: "connected" as const,
      toolCount: index + 1,
      tools: [],
    }));

    const output = renderMcpServerList(servers, 4, 4);
    const lines = output.split("\n");
    const visibleRows = lines.filter((line) => line.includes("tools)")).length;

    expect(output).toContain("server_4");
    expect(output).toContain("server_9");
    expect(output).not.toContain("server_0\n");
    expect(output).toContain("browse server");
    expect(output).toContain("5/10");
    expect(visibleRows).toBe(getMcpVisibleRows(servers.length));
  });

  it("renders transport, protocol, and refresh errors for the selected server", () => {
    const output = renderMcpServerList([
      {
        name: "demo",
        description: "Demo server",
        status: "connected",
        toolCount: 2,
        tools: [],
        transport: "streamable-http",
        protocolVersion: "2025-11-25",
        compatibilityMode: "downgraded",
        refreshState: "error",
        refreshError: "refresh failed",
      },
    ], 0, 0);

    expect(output).toContain("streamable-http");
    expect(output).toContain("2025-11-25");
    expect(output).toContain("connected (downgraded)");
    expect(output).toContain("Refresh failed: refresh failed");
  });
});
