import { describe, expect, it } from "vitest";

import type { MCPClientEvent } from "../../src/mcp/types.js";

function collectEventTypes(events: MCPClientEvent[]): string[] {
  return events.map((event) => event.type);
}

describe("MCP event shapes", () => {
  it("supports refresh lifecycle events", () => {
    const events: MCPClientEvent[] = [
      { type: "tools_list_changed", serverName: "demo" },
      { type: "tools_refreshed", serverName: "demo", toolCount: 2 },
      { type: "tools_refresh_failed", serverName: "demo", error: "boom" },
    ];

    expect(collectEventTypes(events)).toEqual([
      "tools_list_changed",
      "tools_refreshed",
      "tools_refresh_failed",
    ]);
  });
});
