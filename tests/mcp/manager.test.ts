import { describe, expect, it, vi } from "vitest";
import { Type } from "@earendil-works/pi-ai";

import { buildMcpServers } from "../../src/ui/tui/mcp-browser.js";
import { DriverRegistry } from "../../src/drivers/registry.js";
import { ToolRegistry } from "../../src/drivers/tool-registry.js";
import { makeDiscoveryDriver } from "../../src/drivers/discovery.js";
import { MCPManager } from "../../src/mcp/manager.js";
import type { MCPClient } from "../../src/mcp/client.js";
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

function makeMockClient(overrides: Partial<MCPClient> = {}): MCPClient {
  return {
    connect: async () => {},
    close: async () => {},
    listTools: async () => [],
    callTool: async () => ({}),
    readResource: async () => ({ contents: [] }),
    getToolDef: () => undefined,
    getAllToolDefs: () => [],
    getNegotiatedProtocolVersion: () => null,
    getResolvedTransport: () => "streamable-http",
    getCompatibilityMode: () => "native",
    onEvent: () => () => {},
    ...overrides,
  } as unknown as MCPClient;
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

describe("MCPManager registerDrivers reconnect", () => {
  const baseConfig = {
    name: "test-server",
    transport: "streamable-http" as const,
    url: "https://example.com/mcp",
  };

  it("reconnects after backoff when listTools fails on a connected server", async () => {
    vi.useFakeTimers();
    const random = vi.spyOn(Math, "random").mockReturnValue(0);
    const manager = new MCPManager([baseConfig]);
    const registry = new DriverRegistry();

    try {
      const failClient = makeMockClient({
        listTools: async () => { throw new Error("connection lost"); },
      });
      manager["clients"].set("test-server", failClient);
      manager["states"].set("test-server", {
        config: baseConfig,
        status: "connected",
        toolCount: 5,
      });

      let connectCalled = false;
      const successClient = makeMockClient({
        connect: async () => { connectCalled = true; },
        listTools: async () => [{ name: "tool1", inputSchema: {} }] as any,
      });

      const reconnectServer = vi.fn(async (name: string) => {
        const state = manager["states"].get(name)!;
        await successClient.connect();
        manager["clients"].set(name, successClient);
        const tools = await successClient.listTools();
        manager["registerDriver"](name, tools as any);
        state.status = "connected";
        state.error = undefined;
        state.toolCount = (tools as any).length;
        state.refreshState = "idle";
        state.refreshError = undefined;
        state.lastRefreshAt = Date.now();
        return true;
      });
      manager["reconnectServer"] = reconnectServer;

      await manager.registerDrivers(registry);

      expect(manager.getState("test-server")!.status).toBe("reconnecting");
      expect(reconnectServer).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(1_000);

      expect(reconnectServer).toHaveBeenCalledOnce();
      expect(reconnectServer).toHaveBeenCalledWith("test-server");
      expect(connectCalled).toBe(true);
      const state = manager.getState("test-server")!;
      expect(state.status).toBe("connected");
      expect(state.toolCount).toBe(1);
    } finally {
      random.mockRestore();
      vi.useRealTimers();
    }
  });

  it("does not reconnect when server status is disconnected", async () => {
    const manager = new MCPManager([baseConfig]);
    const registry = new DriverRegistry();

    const failClient = makeMockClient({
      listTools: async () => { throw new Error("connection lost"); },
    });
    manager["clients"].set("test-server", failClient);
    manager["states"].set("test-server", {
      config: baseConfig,
      status: "disconnected",
      toolCount: 0,
    });

    let reconnectCalled = false;
    manager["reconnectServer"] = async () => { reconnectCalled = true; return false; };

    await manager.registerDrivers(registry);

    expect(reconnectCalled).toBe(false);
    const state = manager.getState("test-server")!;
    expect(state.status).toBe("error");
  });

  it("sets error state when reconnect also fails", async () => {
    const manager = new MCPManager([baseConfig]);
    const registry = new DriverRegistry();

    const failClient = makeMockClient({
      listTools: async () => { throw new Error("connection lost"); },
    });
    manager["clients"].set("test-server", failClient);
    manager["states"].set("test-server", {
      config: baseConfig,
      status: "connected",
      toolCount: 5,
    });

    // Simulate reconnectServer failing: sets error state, returns false
    manager["reconnectServer"] = async (name: string) => {
      const state = manager["states"].get(name)!;
      state.status = "error";
      state.error = "reconnect failed";
      state.refreshState = "error";
      state.refreshError = "reconnect failed";
      return false;
    };

    await manager.registerDrivers(registry);

    // After reconnectServer returns false, state should not be "connected"
    const state = manager.getState("test-server")!;
    expect(state.status).not.toBe("connected");
  });
});

describe("MCPManager connectServer reconnect", () => {
  const baseConfig = {
    name: "test-server",
    transport: "streamable-http" as const,
    url: "https://example.com/mcp",
  };

  it("allows reconnection when server is in error state", async () => {
    const manager = new MCPManager([baseConfig]);

    const staleClient = makeMockClient();
    manager["clients"].set("test-server", staleClient);
    manager["states"].set("test-server", {
      config: baseConfig,
      status: "error",
      toolCount: 0,
      error: "previous failure",
    });

    let closeCalled = false;
    staleClient.close = async () => { closeCalled = true; };

    try {
      await manager.connectServer("test-server");
    } catch {
      // Expected — no real server to connect to
    }

    expect(closeCalled).toBe(true);
    expect(manager["clients"].has("test-server")).toBe(false);
  });

  it("skips when server is already connected", async () => {
    const manager = new MCPManager([baseConfig]);

    const connectedClient = makeMockClient();
    manager["clients"].set("test-server", connectedClient);
    manager["states"].set("test-server", {
      config: baseConfig,
      status: "connected",
      toolCount: 5,
    });

    let closeCalled = false;
    connectedClient.close = async () => { closeCalled = true; };

    await manager.connectServer("test-server");

    expect(closeCalled).toBe(false);
    expect(manager["clients"].has("test-server")).toBe(true);
  });

  it("skips when server is connecting", async () => {
    const manager = new MCPManager([baseConfig]);

    const connectingClient = makeMockClient();
    manager["clients"].set("test-server", connectingClient);
    manager["states"].set("test-server", {
      config: baseConfig,
      status: "connecting",
      toolCount: 0,
    });

    await manager.connectServer("test-server");

    expect(manager["clients"].has("test-server")).toBe(true);
  });
});
