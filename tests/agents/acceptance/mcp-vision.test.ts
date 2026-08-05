import { describe, expect, it, vi } from "vitest";

import { MCPManager } from "../../../src/mcp/manager.js";

describe("MCP image Vision Agent routing", () => {
  it("uses the shared processImages entrypoint instead of a private Pipeline", async () => {
    const manager = new MCPManager([]);
    const processImages = vi.fn(async () => ({
      source: "vision" as const,
      enrichedText: "<image_description>\nA diagram\n</image_description>",
      cachedRefs: [],
    }));
    manager.processImages = processImages;
    const client = {
      callTool: vi.fn(async () => ({
        content: [{
          type: "image",
          data: "aW1hZ2U=",
          mimeType: "image/png",
        }],
      })),
    };
    const tool = (manager as any).buildAgentTool(
      "demo",
      {
        name: "screenshot",
        title: "Screenshot",
        description: "Capture",
        inputSchema: { type: "object", properties: {} },
      },
      client,
    );

    const result = await tool.execute("call-1", {});

    expect(processImages).toHaveBeenCalledTimes(1);
    const firstCall = processImages.mock.calls[0] as unknown as [unknown[]];
    expect(firstCall[0]).toEqual([
      expect.objectContaining({ type: "image", mimeType: "image/png" }),
    ]);
    expect(result.content).toEqual([
      { type: "text", text: "\n[Description:\nA diagram\n]" },
    ]);
  });
});
