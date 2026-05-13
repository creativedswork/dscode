import { describe, expect, it } from "vitest";
import { Type } from "@mariozechner/pi-ai";

import { DriverRegistry } from "../../src/drivers/registry.js";
import { ToolRegistry } from "../../src/drivers/tool-registry.js";
import { makeDiscoveryDriver } from "../../src/drivers/discovery.js";
import { buildMcpServers } from "../../src/ui/mcp-browser.js";
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
});
