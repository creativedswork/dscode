import { describe, it, expect, beforeEach } from "vitest";
import { Type } from "@mariozechner/pi-ai";

import { DriverRegistry } from "../../src/drivers/registry.js";
import { ToolRegistry } from "../../src/drivers/tool-registry.js";
import { makeDiscoveryDriver } from "../../src/drivers/discovery.js";
import type { AgentTool } from "@mariozechner/pi-agent-core";

function makeSkillTool(): AgentTool<any> {
  return {
    name: "skill",
    label: "Skill",
    description: "Load a skill",
    parameters: Type.Object({ name: Type.String() }),
    execute: async () => ({ content: [{ type: "text", text: "ok" }] }),
  };
}

function makeMockMcpTool(
  name: string,
  description: string,
  alwaysLoad?: boolean,
): AgentTool<any> {
  return {
    name,
    label: name,
    description,
    parameters: Type.Object({}),
    execute: async () => ({ content: [{ type: "text", text: "ok" }] }),
  };
}

describe("ToolRegistry", () => {
  let registry: DriverRegistry;
  let toolRegistry: ToolRegistry;

  beforeEach(() => {
    registry = new DriverRegistry();
    toolRegistry = new ToolRegistry(registry);
  });

  describe("initialize without MCP", () => {
    beforeEach(() => {
      registry.register(makeDiscoveryDriver(toolRegistry));
      toolRegistry.initialize(makeSkillTool());
    });

    it("should include all builtin tools in buildToolsForRequest", () => {
      const tools = toolRegistry.buildToolsForRequest();
      const names = tools.map((t) => t.name).sort();
      expect(names).toContain("read_file");
      expect(names).toContain("write_file");
      expect(names).toContain("list_files");
      expect(names).toContain("bash");
      expect(names).toContain("grep");
      expect(names).toContain("glob");
      expect(names).toContain("search_tools");
      expect(names).toContain("skill");
    });

    it("should have no deferred tools when no MCP is connected", () => {
      expect(toolRegistry.getDeferredToolNames()).toEqual([]);
    });

    it("should return empty hint when no deferred tools", () => {
      expect(toolRegistry.buildDeferredToolsHint()).toBe("");
    });

    it("should have no duplicate tool names in buildToolsForRequest", () => {
      const tools = toolRegistry.buildToolsForRequest();
      const names = tools.map((t) => t.name);
      expect(names.length).toBe(new Set(names).size);
    });
  });

  describe("initialize with MCP tools", () => {
    beforeEach(() => {
      registry.register({
        name: "mcp_github",
        description: "GitHub MCP server",
        source: "mcp",
        tools: [
          makeMockMcpTool("mcp_github_list_issues", "List GitHub issues"),
          makeMockMcpTool("mcp_github_create_pr", "Create a pull request"),
          makeMockMcpTool("mcp_github_get_issue", "Get issue details"),
        ],
      });
      registry.register({
        name: "mcp_slack",
        description: "Slack MCP server",
        source: "mcp",
        tools: [
          makeMockMcpTool("mcp_slack_send_message", "Send a Slack message"),
          makeMockMcpTool("mcp_slack_list_channels", "List Slack channels"),
        ],
      });
      registry.register(makeDiscoveryDriver(toolRegistry));
      toolRegistry.initialize(makeSkillTool());
    });

    it("should mark MCP tools as deferred", () => {
      const deferred = toolRegistry.getDeferredToolNames().sort();
      expect(deferred).toEqual([
        "mcp_github_create_pr",
        "mcp_github_get_issue",
        "mcp_github_list_issues",
        "mcp_slack_list_channels",
        "mcp_slack_send_message",
      ]);
    });

    it("should not include undiscovered MCP tools in buildToolsForRequest", () => {
      const tools = toolRegistry.buildToolsForRequest();
      const names = tools.map((t) => t.name);
      expect(names).not.toContain("mcp_github_list_issues");
      expect(names).not.toContain("mcp_slack_send_message");
    });

    it("should include discovered MCP tools in buildToolsForRequest", () => {
      toolRegistry.markAsDiscovered(["mcp_github_list_issues", "mcp_github_create_pr"]);

      const tools = toolRegistry.buildToolsForRequest();
      const names = tools.map((t) => t.name);
      expect(names).toContain("mcp_github_list_issues");
      expect(names).toContain("mcp_github_create_pr");
      expect(names).not.toContain("mcp_github_get_issue");
      expect(names).not.toContain("mcp_slack_send_message");
    });

    it("should build deferred tools hint with undiscovered tools", () => {
      toolRegistry.markAsDiscovered(["mcp_github_list_issues"]);

      const hint = toolRegistry.buildDeferredToolsHint();
      expect(hint).toContain("Discoverable Tools");
      expect(hint).toContain("mcp_github_create_pr");
      expect(hint).toContain("mcp_github_get_issue");
      expect(hint).not.toContain("mcp_github_list_issues"); // already discovered
      expect(hint).toContain("mcp_slack_");
    });

    it("should return empty hint when all tools discovered", () => {
      toolRegistry.markAsDiscovered([
        "mcp_github_list_issues",
        "mcp_github_create_pr",
        "mcp_github_get_issue",
        "mcp_slack_send_message",
        "mcp_slack_list_channels",
      ]);
      expect(toolRegistry.buildDeferredToolsHint()).toBe("");
    });
  });

  describe("alwaysLoad MCP tools", () => {
    it("should not defer tools in alwaysLoadNames", () => {
      registry.register({
        name: "mcp_github",
        description: "GitHub MCP server",
        source: "mcp",
        tools: [
          makeMockMcpTool("mcp_github_search", "Search GitHub"),
          makeMockMcpTool("mcp_github_create_pr", "Create PR"),
        ],
      });
      registry.register(makeDiscoveryDriver(toolRegistry));

      const alwaysLoad = new Set(["mcp_github_search"]);
      toolRegistry.initialize(makeSkillTool(), alwaysLoad);

      const deferred = toolRegistry.getDeferredToolNames();
      expect(deferred).not.toContain("mcp_github_search");
      expect(deferred).toContain("mcp_github_create_pr");

      // alwaysLoad tool should be in buildToolsForRequest immediately
      const tools = toolRegistry.buildToolsForRequest();
      const names = tools.map((t) => t.name);
      expect(names).toContain("mcp_github_search");
      expect(names).not.toContain("mcp_github_create_pr");
    });

    it("should not show alwaysLoad tools in deferred hint", () => {
      registry.register({
        name: "mcp_github",
        description: "GitHub MCP server",
        source: "mcp",
        tools: [
          makeMockMcpTool("mcp_github_search", "Search GitHub"),
          makeMockMcpTool("mcp_github_create_pr", "Create PR"),
        ],
      });
      registry.register(makeDiscoveryDriver(toolRegistry));

      const alwaysLoad = new Set(["mcp_github_search"]);
      toolRegistry.initialize(makeSkillTool(), alwaysLoad);

      const hint = toolRegistry.buildDeferredToolsHint();
      expect(hint).not.toContain("mcp_github_search");
      expect(hint).toContain("mcp_github_create_pr");
    });

    it("should not find alwaysLoad tools in search", () => {
      registry.register({
        name: "mcp_github",
        description: "GitHub MCP server",
        source: "mcp",
        tools: [
          makeMockMcpTool("mcp_github_search", "Search GitHub"),
          makeMockMcpTool("mcp_github_create_pr", "Create PR"),
        ],
      });
      registry.register(makeDiscoveryDriver(toolRegistry));

      const alwaysLoad = new Set(["mcp_github_search"]);
      toolRegistry.initialize(makeSkillTool(), alwaysLoad);

      const results = toolRegistry.search("github", 10);
      const names = results.map((r) => r.name);
      expect(names).not.toContain("mcp_github_search");
      expect(names).toContain("mcp_github_create_pr");
    });
  });

  describe("search", () => {
    beforeEach(() => {
      registry.register({
        name: "mcp_github",
        description: "GitHub MCP server",
        source: "mcp",
        tools: [
          makeMockMcpTool("mcp_github_list_issues", "List GitHub issues"),
          makeMockMcpTool("mcp_github_create_pr", "Create a pull request"),
          makeMockMcpTool("mcp_github_get_issue", "Get issue details"),
          makeMockMcpTool("mcp_github_search_code", "Search code on GitHub"),
        ],
      });
      registry.register({
        name: "mcp_slack",
        description: "Slack MCP server",
        source: "mcp",
        tools: [
          makeMockMcpTool("mcp_slack_send_message", "Send a Slack message"),
          makeMockMcpTool("mcp_slack_list_channels", "List Slack channels"),
        ],
      });
      registry.register(makeDiscoveryDriver(toolRegistry));
      toolRegistry.initialize(makeSkillTool());
    });

    it('should support select: for exact name matching', () => {
      const results = toolRegistry.search("select:mcp_github_list_issues,mcp_slack_send_message");
      const names = results.map((r) => r.name);
      expect(names).toEqual(["mcp_github_list_issues", "mcp_slack_send_message"]);
    });

    it("should search by keyword across name and description", () => {
      const results = toolRegistry.search("github issue", 5);
      const names = results.map((r) => r.name);
      // mcp_github_list_issues and mcp_github_get_issue should score highest
      expect(names).toContain("mcp_github_list_issues");
      expect(names).toContain("mcp_github_get_issue");
    });

    it("should search by server name prefix", () => {
      const results = toolRegistry.search("slack", 5);
      const names = results.map((r) => r.name);
      expect(names).toContain("mcp_slack_send_message");
      expect(names).toContain("mcp_slack_list_channels");
      expect(names).not.toContain("mcp_github_list_issues");
    });

    it("should respect maxResults", () => {
      const results = toolRegistry.search("mcp", 2);
      expect(results.length).toBeLessThanOrEqual(2);
    });

    it("should return empty for no match", () => {
      const results = toolRegistry.search("nonexistent_xyz", 5);
      expect(results).toEqual([]);
    });

    it("should not search already discovered tools", () => {
      toolRegistry.markAsDiscovered(["mcp_github_list_issues"]);
      const results = toolRegistry.search("github", 5);
      const names = results.map((r) => r.name);
      expect(names).not.toContain("mcp_github_list_issues");
    });
  });

  describe("serializeDiscovered / restoreDiscovered", () => {
    beforeEach(() => {
      registry.register({
        name: "mcp_test",
        description: "Test MCP",
        source: "mcp",
        tools: [
          makeMockMcpTool("mcp_test_tool_a", "Tool A"),
          makeMockMcpTool("mcp_test_tool_b", "Tool B"),
        ],
      });
      registry.register(makeDiscoveryDriver(toolRegistry));
      toolRegistry.initialize(makeSkillTool());
    });

    it("should serialize and restore discovered tools", () => {
      toolRegistry.markAsDiscovered(["mcp_test_tool_a"]);

      const serialized = toolRegistry.serializeDiscovered();
      expect(serialized).toEqual(["mcp_test_tool_a"]);

      // Simulate fresh ToolRegistry restoring state
      const registry2 = new DriverRegistry();
      registry2.register({
        name: "mcp_test",
        description: "Test MCP",
        source: "mcp",
        tools: [
          makeMockMcpTool("mcp_test_tool_a", "Tool A"),
          makeMockMcpTool("mcp_test_tool_b", "Tool B"),
        ],
      });
      const toolRegistry2 = new ToolRegistry(registry2);
      registry2.register(makeDiscoveryDriver(toolRegistry2));
      toolRegistry2.initialize(makeSkillTool());
      toolRegistry2.restoreDiscovered(serialized);

      const tools = toolRegistry2.buildToolsForRequest();
      const names = tools.map((t) => t.name);
      expect(names).toContain("mcp_test_tool_a");
      expect(names).not.toContain("mcp_test_tool_b");
    });

    it("should ignore unknown tool names on restore", () => {
      toolRegistry.restoreDiscovered(["nonexistent_tool"]);
      expect(toolRegistry.serializeDiscovered()).toEqual([]);
    });
  });

  describe("markAsDiscovered", () => {
    beforeEach(() => {
      registry.register({
        name: "mcp_test",
        description: "Test MCP",
        source: "mcp",
        tools: [makeMockMcpTool("mcp_test_foo", "Foo")],
      });
      registry.register(makeDiscoveryDriver(toolRegistry));
      toolRegistry.initialize(makeSkillTool());
    });

    it("should ignore non-deferred tool names", () => {
      toolRegistry.markAsDiscovered(["bash", "read_file"]);
      // Non-deferred tools are always included, discovered set is unaffected
      expect(toolRegistry.serializeDiscovered()).toEqual([]);
    });

    it("should handle empty array", () => {
      toolRegistry.markAsDiscovered([]);
      expect(toolRegistry.serializeDiscovered()).toEqual([]);
    });
  });
});