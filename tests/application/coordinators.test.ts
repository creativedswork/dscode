import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

import { ConversationCoordinator } from "../../src/application/conversation-coordinator.js";
import { McpController } from "../../src/application/mcp-controller.js";
import { ProjectCoordinator } from "../../src/application/project-coordinator.js";

function driverRegistry() {
  const drivers = new Map<string, any>();
  return {
    register: (driver: any) => drivers.set(driver.name, driver),
    get: (name: string) => drivers.get(name),
    listAll: () => [...drivers.values()],
    getAllTools: () => [...drivers.values()].flatMap((driver) => driver.tools),
    getDriversBySource: (source: string) =>
      [...drivers.values()].filter((driver) => driver.source === source),
    unregister: (name: string) => drivers.delete(name),
  };
}

function toolCatalog() {
  return {
    initialize: vi.fn(),
    buildToolsForRequest: vi.fn(() => []),
    buildDeferredToolsHint: vi.fn(() => ""),
    getDeferredToolNames: vi.fn(() => []),
    getDiscoveredToolNames: vi.fn(() => new Set<string>()),
  };
}

function manager(name: string, fail = false) {
  const listeners = new Set<(event: any) => void>();
  return {
    processImages: undefined,
    initialize: vi.fn(async () => {
      if (fail) throw new Error(`failed ${name}`);
    }),
    registerDrivers: vi.fn(async (drivers: any) => {
      drivers.register({
        name: `mcp__${name}`,
        description: name,
        tools: [],
        source: "mcp",
      });
    }),
    onEvent: vi.fn((listener: (event: any) => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }),
    getStates: vi.fn(() => [{
      config: { name },
      status: "connected",
      toolCount: 0,
    }]),
    getAlwaysLoadToolNames: vi.fn(() => new Set<string>()),
    getAppOnlyToolNames: vi.fn(() => []),
    shutdown: vi.fn(async () => {}),
    connectServer: vi.fn(async () => {}),
    disconnectServer: vi.fn(async () => {}),
    emit(event: any) {
      for (const listener of listeners) listener(event);
    },
  };
}

describe("Application coordinators", () => {
  it("owns Main turn retry, rollback, and persistence ordering", async () => {
    const coordinator = new ConversationCoordinator();
    const messages: unknown[] = [{ role: "user", content: "hello" }];
    const events: any[] = [];
    let attempts = 0;
    const save = vi.fn();

    await coordinator.prompt({
      text: "hello",
      maxRetries: 1,
      baseDelayMs: 1,
      maxDelayMs: 1,
      messageCount: () => messages.length,
      truncateMessages: (length) => {
        messages.length = length;
      },
      prompt: async () => {
        attempts++;
        messages.push({
          role: "assistant",
          stopReason: attempts === 1 ? "error" : "stop",
          errorMessage: attempts === 1 ? "network failed" : undefined,
        });
      },
      lastError: () => {
        const last = messages.at(-1) as any;
        return last?.stopReason === "error" ? last.errorMessage : undefined;
      },
      isRetryable: () => true,
      save,
      publish: (event) => events.push(event),
      sleep: async () => {},
      random: () => 0,
    });

    expect(attempts).toBe(2);
    expect(messages).toHaveLength(2);
    expect(save).toHaveBeenCalledOnce();
    expect(events.map((event) => event.type)).toContain("llm:retry");
  });

  it("keeps the active MCP manager and drivers when replacement fails", async () => {
    const drivers = driverRegistry();
    const tools = toolCatalog();
    const first = manager("first");
    const failed = manager("failed", true);
    const publish = vi.fn();
    const controller = new McpController({
      createManager: (configs) =>
        (configs[0].name === "first" ? first : failed) as any,
      drivers,
      tools,
      makeSkillTool: () => ({ name: "skill" }) as any,
      processImages: async () => ({
        enrichedText: "",
        cachedRefs: [],
        source: "none",
      }),
      applyTools: vi.fn(),
      refreshCapabilities: async () => {},
      publish,
    });

    await controller.start([{ name: "first", transport: "stdio" } as any]);
    await expect(
      controller.reload([{ name: "failed", transport: "stdio" } as any]),
    ).rejects.toThrow("failed failed");

    expect(controller.manager).toBe(first);
    expect(drivers.get("mcp__first")).toBeDefined();
    expect(first.shutdown).not.toHaveBeenCalled();
    expect(publish).toHaveBeenCalledWith(expect.objectContaining({
      type: "mcp:state",
    }));
  });

  it("does not commit project state when MCP preparation fails", async () => {
    const commit = vi.fn();
    const save = vi.fn();
    const previous = {
      dataDir: "/old-data",
      projectPath: "/old",
      mcp: [{ name: "old" } as any],
    } as any;
    const coordinator = new ProjectCoordinator({
      resolve: (path) => path,
      exists: () => true,
      currentRuntime: () => previous,
      prepareRuntime: async () => ({
        dataDir: "/data",
        projectPath: "/next",
        mcp: [{ name: "broken" } as any],
      }) as any,
      beginTransition: vi.fn(),
      endTransition: vi.fn(),
      quiesce: async () => {},
      saveCurrentSession: save,
      reloadMcp: async () => {
        throw new Error("connection refused");
      },
      updateSessionProject: commit,
      updateMemoryProject: commit,
      updateProcessProject: commit,
      updateApplications: async () => {
        commit();
      },
      rebindMainSession: async () => {
        commit();
      },
      replaceRuntime: async () => {
        commit();
      },
      reportError: vi.fn(),
    });

    await expect(coordinator.switchProject("/next")).resolves.toMatchObject({
      success: false,
      error: expect.stringContaining("connection refused"),
    });
    expect(commit).not.toHaveBeenCalled();
    expect(save).toHaveBeenCalledOnce();
  });

  it("rolls project owners back in reverse order after a partial commit", async () => {
    const state = {
      mcp: "old",
      session: "old",
      memory: "old",
      process: "old",
      applications: "old",
      main: "old",
    };
    let transition = false;
    const previous = {
      dataDir: "/old-data",
      projectPath: "/old",
      mcp: [{ name: "old" } as any],
    } as any;
    const coordinator = new ProjectCoordinator({
      resolve: (path) => path,
      exists: () => true,
      currentRuntime: () => previous,
      prepareRuntime: async (projectPath) => ({
        dataDir: projectPath === "/old" ? "/old-data" : "/next-data",
        projectPath,
        mcp: [{ name: projectPath === "/old" ? "old" : "next" } as any],
      }) as any,
      beginTransition: () => { transition = true; },
      endTransition: () => { transition = false; },
      quiesce: async () => {},
      saveCurrentSession: vi.fn(),
      reloadMcp: async (servers) => { state.mcp = servers[0]?.name ?? ""; },
      updateSessionProject: (_dataDir, path) => { state.session = path; },
      updateMemoryProject: (_dataDir, path) => { state.memory = path; },
      updateProcessProject: (path) => { state.process = path; },
      updateApplications: async (path) => { state.applications = path; },
      rebindMainSession: async (path) => {
        state.main = path;
        if (path === "/next") throw new Error("rebind failed");
      },
      replaceRuntime: vi.fn(async () => {}),
      reportError: vi.fn(),
    });

    await expect(coordinator.switchProject("/next")).resolves.toMatchObject({
      success: false,
      error: expect.stringContaining("rebind failed"),
    });
    expect(state).toEqual({
      mcp: "old",
      session: "/old",
      memory: "/old",
      process: "/old",
      applications: "/old",
      main: "/old",
    });
    expect(transition).toBe(false);
  });

  it("keeps Harness headless and leaves UI selection to CLI bootstrap", () => {
    const harnessSource = readFileSync("src/application/harness.ts", "utf8");
    const hostSource = readFileSync(
      "src/bootstrap/create-standard-agent-host.ts",
      "utf8",
    );
    const cliSource = readFileSync("src/bootstrap/cli-main.ts", "utf8");

    expect(harnessSource).not.toMatch(/from ["'][^"']*\/ui\//);
    expect(hostSource).not.toMatch(/from ["'][^"']*\/ui\//);
    expect(hostSource).not.toMatch(/process\.(?:on|exit|chdir|env)/);
    expect(cliSource).toContain("TuiBackend");
    expect(cliSource).toContain("WebUiBackend");
    expect(cliSource).toContain("createStandardAgentHost");
  });
});
