import { describe, expect, it } from "vitest";
import { Type } from "@mariozechner/pi-ai";

import { buildMcpServers } from "../../src/ui/mcp-browser.js";
import { DriverRegistry } from "../../src/drivers/registry.js";
import { ToolRegistry } from "../../src/drivers/tool-registry.js";
import { makeDiscoveryDriver } from "../../src/drivers/discovery.js";
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

describe("MCP browser state projection", () => {
  it("projects refresh and protocol fields from server state", () => {
    const registry = new DriverRegistry();
    const toolRegistry = new ToolRegistry(registry);
    registry.register(makeDiscoveryDriver(toolRegistry));
    toolRegistry.initialize(makeSkillTool());

    const states: MCPServerState[] = [
      {
        config: { name: "demo", transport: "streamable-http", url: "https://example.com/mcp" },
        status: "connected",
        toolCount: 0,
        resolvedTransport: "streamable-http",
        negotiatedProtocolVersion: "2025-11-25",
        compatibilityMode: "downgraded",
        refreshState: "error",
        refreshError: "boom",
      },
    ];

    const [server] = buildMcpServers(states, registry, toolRegistry);

    expect(server).toMatchObject({
      name: "demo",
      transport: "streamable-http",
      protocolVersion: "2025-11-25",
      compatibilityMode: "downgraded",
      refreshState: "error",
      refreshError: "boom",
    });
  });
});
