import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "@earendil-works/pi-ai";

import type { Driver } from "./types.js";
import type { ToolRegistry } from "./tool-registry.js";

const searchParams = Type.Object({
  query: Type.String({
    description:
      'Search query. Use "select:ToolA,ToolB" for exact name matching, or keywords for fuzzy search across tool names and descriptions.',
  }),
  max_results: Type.Optional(
    Type.Number({
      description: "Maximum number of results to return (default: 5)",
    }),
  ),
});

export function makeSearchToolsTool(
  registry: ToolRegistry,
): AgentTool<typeof searchParams> {
  return {
    name: "search_tools",
    label: "Search Tools",
    description:
      "Search and load deferred tools by name or keyword. Loaded tools become available for direct use in subsequent turns. Use this when you need a tool that is listed in the Discoverable Tools section but not yet available.",
    parameters: searchParams,
    execute: async (_id, params) => {
      const maxResults = params.max_results ?? 5;
      const matches = registry.search(params.query, maxResults);

      if (matches.length > 0) {
        registry.markAsDiscovered(matches.map((m) => m.name));
      }

      const result = {
        matches: matches.map((m) => ({
          name: m.name,
          description: m.description,
        })),
        query: params.query,
        total_deferred_tools: registry.getDeferredToolNames().length,
      };

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        details: { matchCount: matches.length },
      };
    },
  };
}

export function makeDiscoveryDriver(registry: ToolRegistry): Driver {
  return {
    name: "discovery",
    description: "Tool discovery and deferred loading",
    tools: [makeSearchToolsTool(registry)],
    source: "builtin",
  };
}
