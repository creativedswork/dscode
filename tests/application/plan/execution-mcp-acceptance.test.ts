import { rm } from "node:fs/promises";

import { afterEach, describe, expect, it, vi } from "vitest";

import { DriverRegistry } from "../../../src/drivers/registry.js";
import type { MCPClient } from "../../../src/mcp/client.js";
import { MCPManager } from "../../../src/mcp/manager.js";
import { mcpDriverName } from "../../../src/mcp/names.js";
import type { MCPToolResult } from "../../../src/mcp/types.js";
import { bindMain, createExecutionFixture } from "./execution-helpers.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) =>
    rm(root, { recursive: true, force: true })
  ));
});

describe("Plan MCP observable acceptance", () => {
  it("uses explicit structured success and gives protocol errors precedence", async () => {
    const fixture = await createExecutionFixture({
      verifications: [{
        kind: "observable",
        verificationId: "observable",
        description: "MCP operation succeeded",
        toolName: "mcp__demo__observe",
      }],
    });
    roots.push(fixture.root);
    const approved = await fixture.approve();
    const { binding, plan } = await bindMain(fixture, approved.version);
    const responses: MCPToolResult[] = [
      { content: [{ type: "text", text: "finished" }], isError: false },
      { structuredContent: { success: true }, isError: true },
      { structuredContent: { success: true }, isError: false },
    ];
    const client = {
      listTools: async () => [{
        name: "observe",
        effect: "workspace_write",
        inputSchema: {},
      }],
      callTool: vi.fn(async () => responses.shift()),
      getAllToolDefs: () => [],
    } as unknown as MCPClient;
    const manager = new MCPManager([{
      name: "demo",
      transport: "streamable-http",
      url: "https://example.com/mcp",
    }]);
    manager["clients"].set("demo", client);
    const registry = new DriverRegistry();
    await manager.registerDrivers(registry);
    const tool = registry.get(mcpDriverName("demo"))?.tools[0];
    if (!tool) throw new Error("MCP tool missing");
    const scope = plan.executionSteps[0].effectGrants[0].resourceScopes[0];
    if (scope.kind !== "workspace_path") throw new Error("Workspace scope missing");

    for (const id of ["unknown", "error", "success"]) {
      await fixture.execution.authorizeTool({
        binding,
        toolCallId: id,
        toolName: tool.name,
        effect: "workspace_write",
        resourceScopes: [{
          kind: "workspace_path",
          pattern: scope.pattern.replace(/\*\*$/, "file.ts"),
        }],
      });
      const result = await tool.execute(id, {});
      if (id === "error") {
        expect(result.details).toMatchObject({
          error: true,
          structuredContent: { success: true },
          mcpResult: { isError: true },
        });
      }
      await fixture.execution.recordToolResult(
        binding,
        id,
        tool.name,
        {},
        result,
        false,
      );
    }

    const current = await fixture.execution.load("plan-1");
    if (!current.ok || !current.plan) throw new Error("Plan missing");
    expect(current.plan.schemaVersion === 2
      && current.plan.execution.steps[0].evidence).toEqual([
      expect.objectContaining({
        evidenceId: "tool-success",
        structuredOutcome: "success",
      }),
    ]);
    expect(current.plan).toMatchObject({
      status: "completed",
      execution: { steps: [{ status: "completed" }] },
    });
  });
});
