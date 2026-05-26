import { describe, it, expect } from "vitest";
import { DriverRegistry } from "../../src/drivers/registry.js";

describe("DriverRegistry", () => {
  it("should have builtin drivers registered on construction", () => {
    const registry = new DriverRegistry();
    const drivers = registry.listAll();
    expect(drivers.length).toBe(4);
    expect(drivers.map((d) => d.name).sort()).toEqual(["edit", "fs", "search", "shell"]);
  });

  it("should get a driver by name", () => {
    const registry = new DriverRegistry();
    const fsDriver = registry.get("fs");
    expect(fsDriver).toBeDefined();
    expect(fsDriver!.name).toBe("fs");
    expect(fsDriver!.source).toBe("builtin");
  });

  it("should return undefined for unknown driver", () => {
    const registry = new DriverRegistry();
    expect(registry.get("nonexistent")).toBeUndefined();
  });

  it("should register a new driver", () => {
    const registry = new DriverRegistry();
    registry.register({
      name: "test",
      description: "Test driver",
      tools: [],
      source: "mcp",
    });
    expect(registry.get("test")).toBeDefined();
    expect(registry.listAll().length).toBe(5);
  });

  it("should overwrite existing driver on register", () => {
    const registry = new DriverRegistry();
    registry.register({
      name: "fs",
      description: "Overridden fs driver",
      tools: [],
      source: "mcp",
    });
    const fsDriver = registry.get("fs");
    expect(fsDriver!.description).toBe("Overridden fs driver");
    expect(fsDriver!.source).toBe("mcp");
  });

  it("should collect all tools from all drivers", () => {
    const registry = new DriverRegistry();
    const allTools = registry.getAllTools();
    const toolNames = allTools.map((t) => t.name).sort();
    expect(toolNames).toEqual([
      "bash",
      "edit",
      "glob",
      "grep",
      "list_files",
      "read_file",
      "write_file",
    ]);
  });

  it("should not have duplicate tool names across builtin drivers", () => {
    const registry = new DriverRegistry();
    const allTools = registry.getAllTools();
    const names = allTools.map((t) => t.name);
    const uniqueNames = new Set(names);
    expect(names.length).toBe(uniqueNames.size);
  });

  it("should include tools from registered MCP drivers", () => {
    const registry = new DriverRegistry();
    const mcpTool = {
      name: "mcp_tool_1",
      label: "MCP Tool",
      description: "A tool from MCP",
      parameters: {},
      execute: async () => ({ content: [] }),
    };
    registry.register({
      name: "mcp_test",
      description: "MCP test driver",
      tools: [mcpTool],
      source: "mcp",
    });
    const allTools = registry.getAllTools();
    expect(allTools.find((t) => t.name === "mcp_tool_1")).toBeDefined();
  });
});
