import { describe, expect, it } from "vitest";
import { Type } from "@mariozechner/pi-ai";

import { DriverRegistry } from "../../src/drivers/registry.js";
import { ToolRegistry } from "../../src/drivers/tool-registry.js";
import { makeDiscoveryDriver } from "../../src/drivers/discovery.js";
import { buildMcpServers, getMcpVisibleRows, renderMcpServerList, renderMcpToolList } from "../../src/ui/mcp-browser.js";
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
