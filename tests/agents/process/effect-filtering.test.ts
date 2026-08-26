import { describe, expect, it } from "vitest";

import type { AgentApplicationSnapshot } from "../../../src/agents/definitions/types.js";
import { deriveAgentContext } from "../../../src/agents/process/context.js";
import type { AgentContext } from "../../../src/agents/process/types.js";
import {
  AGENT_PROCESS_TOOL_CAPABILITIES,
  makeAgentProcessTools,
} from "../../../src/agents/tools/process-tools.js";
import { DriverRegistry } from "../../../src/drivers/registry.js";
import type { ToolCapability } from "../../../src/drivers/types.js";
import { MCPManager } from "../../../src/mcp/manager.js";
import type { MCPClient } from "../../../src/mcp/client.js";

const application: AgentApplicationSnapshot = {
  name: "planner",
  description: "planner",
  systemPrompt: "plan",
  permissionMode: "plan",
  source: { kind: "internal", path: "test" },
  digest: "a".repeat(64),
  registryGeneration: 1,
};

function derive(tools: readonly ToolCapability[]): AgentContext {
  const parent: AgentContext = {
    agentId: "main",
    cwd: "/project",
    parentSessionId: "session",
    depth: 0,
    attachment: "foreground",
    allowedTools: tools.map((tool) => tool.name),
    deniedTools: [],
  };
  return deriveAgentContext({
    application,
    parent,
    availableTools: tools,
    attachment: "foreground",
  });
}

function mockClient(): MCPClient {
  return {
    listTools: async () => [
      {
        name: "fetch_report",
        inputSchema: {},
        effect: "read",
      },
      {
        name: "read_public_page",
        inputSchema: {},
        effect: "network",
      },
      {
        name: "read_customer_record",
        inputSchema: {},
        effect: "external_write",
      },
      {
        name: "read_unknown",
        inputSchema: {},
      },
    ],
    callTool: async () => ({}),
  } as unknown as MCPClient;
}

describe("effect-based Plan capability filtering", () => {
  it("declares concrete effects for every built-in driver tool", () => {
    const tools = new DriverRegistry().getAllTools();

    expect(tools.length).toBeGreaterThan(0);
    expect(tools.every((tool) => tool.effect !== undefined)).toBe(true);
    expect(tools.find((tool) => tool.name === "read_file")?.effect).toBe("read");
    expect(tools.find((tool) => tool.name === "write_file")?.effect)
      .toBe("workspace_write");
    expect(tools.find((tool) => tool.name === "bash")?.effect).toBe("process");
  });

  it("keeps dynamic process tool declarations aligned with their capabilities", () => {
    const tools = makeAgentProcessTools({} as never, "main");

    expect(tools.map((tool) => ({
      name: tool.name,
      effect: tool.effect,
    }))).toEqual(AGENT_PROCESS_TOOL_CAPABILITIES);
  });

  it("uses effect metadata instead of read-looking names", () => {
    const context = derive([
      { name: "delete_everything", effect: "read" },
      { name: "read_network", effect: "network" },
      { name: "read_external", effect: "external_write" },
      { name: "read_missing" },
      { name: "read_unknown", effect: "unknown" },
      {
        name: "record_plan_fact",
        effect: "unknown",
        planOperation: { domain: "plan", sideEffectFree: true },
      },
    ]);

    expect(context.allowedTools).toEqual([
      "delete_everything",
      "record_plan_fact",
    ]);
    expect(context.deniedTools).toEqual(expect.arrayContaining([
      "read_network",
      "read_external",
      "read_missing",
      "read_unknown",
    ]));
  });

  it("preserves MCP read metadata and denies unsafe or missing MCP effects", async () => {
    const manager = new MCPManager([{
      name: "demo",
      transport: "streamable-http",
      url: "https://example.com/mcp",
    }]);
    const registry = new DriverRegistry();
    manager["clients"].set("demo", mockClient());
    manager["states"].set("demo", {
      config: {
        name: "demo",
        transport: "streamable-http",
        url: "https://example.com/mcp",
      },
      status: "connected",
      toolCount: 0,
    });

    await manager.registerDrivers(registry);

    const mcpTools = registry.getDriversBySource("mcp")[0].tools;
    expect(mcpTools.map((tool) => [tool.name, tool.effect])).toEqual([
      ["mcp__demo__fetch_report", "read"],
      ["mcp__demo__read_public_page", "network"],
      ["mcp__demo__read_customer_record", "external_write"],
      ["mcp__demo__read_unknown", "unknown"],
    ]);
    expect(derive(mcpTools).allowedTools).toEqual([
      "mcp__demo__fetch_report",
    ]);
  });

  it("keeps Main-only route operations out of Planner capabilities", () => {
    const context = derive([{
      name: "submit_plan_route_assessment",
      effect: "unknown",
      planOperation: { domain: "plan", sideEffectFree: true },
      audience: "main",
    }]);

    expect(context.allowedTools).toEqual([]);
    expect(context.deniedTools).toContain("submit_plan_route_assessment");
  });
});
