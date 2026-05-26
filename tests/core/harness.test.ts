import { describe, it, expect } from "vitest";
import { Type } from "@mariozechner/pi-ai";
import { DriverRegistry } from "../../src/drivers/registry.js";
import { ToolRegistry } from "../../src/drivers/tool-registry.js";
import { makeDiscoveryDriver } from "../../src/drivers/discovery.js";

function makeSkillTool() {
  return {
    name: "skill",
    label: "Skill",
    description: "Load a skill",
    parameters: Type.Object({ name: Type.String() }),
    execute: async () => ({ content: [{ type: "text", text: "ok" }] }),
  };
}

/**
 * Critical regression test: agent tool list should not have duplicate tool names.
 * This was the root cause of the "400 Tool names must be unique" error from DeepSeek API.
 *
 * The fix: only use driverRegistry.getAllTools() for the agent's tool list,
 * instead of combining driver tools + skill tools (which are references to the same driver tools).
 */
describe("Harness tool list regression", () => {
  it("should not have duplicate tool names when skills are active", () => {
    const registry = new DriverRegistry();
    const allDriverTools = registry.getAllTools();

    // Simulate what SkillManager.activate does: filter driver tools by whitelist
    const skillToolNames = ["read_file", "bash"];
    const skillTools = allDriverTools.filter((t) => skillToolNames.includes(t.name));

    // The BUG was: const allTools = [...allDriverTools, ...skillTools];
    // This creates duplicates because skillTools are references to the same objects
    const buggyAllTools = [...allDriverTools, ...skillTools];
    const buggyNames = buggyAllTools.map((t) => t.name);
    const buggyUnique = new Set(buggyNames);
    expect(buggyNames.length).toBeGreaterThan(buggyUnique.size);

    // The FIX: only use driver tools
    const fixedAllTools = allDriverTools;
    const fixedNames = fixedAllTools.map((t) => t.name);
    const fixedUnique = new Set(fixedNames);
    expect(fixedNames.length).toBe(fixedUnique.size);
  });

  it("should not have duplicate tool names with multiple active skills", () => {
    const registry = new DriverRegistry();
    const allDriverTools = registry.getAllTools();

    // Simulate two skills with overlapping tool whitelists
    const skill1Tools = allDriverTools.filter((t) => ["read_file", "bash"].includes(t.name));
    const skill2Tools = allDriverTools.filter((t) => ["read_file", "list_files"].includes(t.name));

    // BUG: combining all
    const buggyAllTools = [...allDriverTools, ...skill1Tools, ...skill2Tools];
    const buggyNames = buggyAllTools.map((t) => t.name);
    const buggyUnique = new Set(buggyNames);
    expect(buggyNames.length).toBeGreaterThan(buggyUnique.size);

    // FIX: only driver tools
    const fixedNames = allDriverTools.map((t) => t.name);
    const fixedUnique = new Set(fixedNames);
    expect(fixedNames.length).toBe(fixedUnique.size);
  });

  it("should have exactly 7 unique tool names from builtin drivers", () => {
    const registry = new DriverRegistry();
    const allTools = registry.getAllTools();
    const names = allTools.map((t) => t.name).sort();
    expect(names).toEqual([
      "bash",
      "edit",      "glob",
      "grep",
      "list_files",
      "read_file",
      "write_file",
    ]);
  });

  it("should maintain unique tool names when MCP drivers are registered", () => {
    const registry = new DriverRegistry();

    // Register an MCP driver with unique tools
    registry.register({
      name: "mcp_server1",
      description: "MCP server 1",
      source: "mcp",
      tools: [
        {
          name: "mcp_search",
          label: "MCP Search",
          description: "Search via MCP",
          parameters: {},
          execute: async () => ({ content: [] }),
        },
      ],
    });

    const allTools = registry.getAllTools();
    const names = allTools.map((t) => t.name);
    const uniqueNames = new Set(names);
    expect(names.length).toBe(uniqueNames.size);
    expect(names).toContain("mcp_search");
  });

  it("should not have duplicate tool names when SkillManager.getTools returns overlapping tools", () => {
    const registry = new DriverRegistry();
    const allDriverTools = registry.getAllTools();

    // Simulate SkillManager.getTools() returning tools from multiple active skills
    // with overlapping whitelists
    const skill1Tools = allDriverTools.filter((t) => ["read_file", "bash", "grep"].includes(t.name));
    const skill2Tools = allDriverTools.filter((t) => ["read_file", "list_files", "glob"].includes(t.name));

    // This is what SkillManager.getTools() returns
    const skillTools = [...skill1Tools, ...skill2Tools];

    // BUG: combining driver tools + skill tools
    const buggyAllTools = [...allDriverTools, ...skillTools];
    const buggyNames = buggyAllTools.map((t) => t.name);
    const buggyUnique = new Set(buggyNames);
    expect(buggyNames.length).toBeGreaterThan(buggyUnique.size);

    // FIX: only driver tools
    const fixedAllTools = allDriverTools;
    const fixedNames = fixedAllTools.map((t) => t.name);
    const fixedUnique = new Set(fixedNames);
    expect(fixedNames.length).toBe(fixedUnique.size);
  });

  it("should keep undiscovered deferred tools out of the refreshed tool list", () => {
    const registry = new DriverRegistry();
    registry.register({
      name: "mcp_github",
      description: "GitHub MCP server",
      source: "mcp",
      tools: [
        {
          name: "mcp_github_list_issues",
          label: "List issues",
          description: "List GitHub issues",
          parameters: Type.Object({}),
          execute: async () => ({ content: [] }),
        },
      ],
    });

    const toolRegistry = new ToolRegistry(registry);
    registry.register(makeDiscoveryDriver(toolRegistry));
    toolRegistry.initialize(makeSkillTool());

    const rawNames = registry.getAllTools().map((t) => t.name);
    const refreshedNames = toolRegistry.buildToolsForRequest().map((t) => t.name);

    expect(rawNames).toContain("mcp_github_list_issues");
    expect(refreshedNames).not.toContain("mcp_github_list_issues");
    expect(refreshedNames.length).toBe(new Set(refreshedNames).size);
  });
});
