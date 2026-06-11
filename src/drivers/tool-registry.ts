import type { AgentTool } from "@mariozechner/pi-agent-core";

import type { DriverRegistry } from "./registry.js";

export interface ToolSearchEntry {
  name: string;
  description: string;
  searchHint: string;
  tool: AgentTool<any>;
}

export class ToolRegistry {
  private driverRegistry: DriverRegistry;
  private allTools = new Map<string, ToolSearchEntry>();
  private deferredToolNames = new Set<string>();
  private discoveredToolNames = new Set<string>();
  private baseToolNames = new Set<string>();
  private initialized = false;

  constructor(driverRegistry: DriverRegistry) {
    this.driverRegistry = driverRegistry;
  }

  /** Scan all drivers and classify tools as base/deferred. Supports re-entry. */
  initialize(
    skillTool: AgentTool<any>,
    alwaysLoadNames?: Set<string>,
    appOnlyNames?: Set<string>,
  ): void {
    this.clearMcpEntries();

    // 1. Builtin driver tools — always sent (non-deferred)
    for (const driver of this.driverRegistry.getDriversBySource("builtin")) {
      for (const tool of driver.tools) {
        this.allTools.set(tool.name, {
          name: tool.name,
          description: tool.description ?? "",
          searchHint: driver.name,
          tool,
        });
      }
    }

    // 2. MCP driver tools — deferred unless alwaysLoad; skip app-only
    for (const driver of this.driverRegistry.getDriversBySource("mcp")) {
      for (const tool of driver.tools) {
        if (appOnlyNames?.has(tool.name)) continue;
        this.allTools.set(tool.name, {
          name: tool.name,
          description: tool.description ?? "",
          searchHint: driver.name,
          tool,
        });
        if (alwaysLoadNames?.has(tool.name)) {
          // alwaysLoad: treat like builtin, never deferred
        } else {
          this.deferredToolNames.add(tool.name);
        }
      }
    }

    // 3. search_tools is always a base tool
    this.baseToolNames.add("search_tools");

    // 4. skill tool is always a base tool
    this.baseToolNames.add("skill");
    this.allTools.set(skillTool.name, {
      name: skillTool.name,
      description: skillTool.description ?? "",
      searchHint: "skill",
      tool: skillTool,
    });

    this.initialized = true;
  }

  private clearMcpEntries(): void {
    // Remove MCP-sourced tool entries from allTools
    for (const driver of this.driverRegistry.getDriversBySource("mcp")) {
      for (const tool of driver.tools) {
        this.allTools.delete(tool.name);
      }
    }
    this.deferredToolNames.clear();
    this.discoveredToolNames.clear();
  }

  isDeferred(name: string): boolean {
    return this.deferredToolNames.has(name);
  }

  getDeferredToolNames(): string[] {
    return [...this.deferredToolNames];
  }

  getDiscoveredToolNames(): Set<string> {
    return this.discoveredToolNames;
  }

  /** Mark tools as discovered so they are included in subsequent requests. */
  markAsDiscovered(names: string[]): void {
    for (const name of names) {
      if (this.deferredToolNames.has(name)) {
        this.discoveredToolNames.add(name);
      }
    }
  }

  /** Build the tools array for the next API request. */
  buildToolsForRequest(): AgentTool<any>[] {
    const tools: AgentTool<any>[] = [];
    for (const [name, entry] of this.allTools) {
      if (this.baseToolNames.has(name)) {
        tools.push(entry.tool);
      } else if (!this.deferredToolNames.has(name)) {
        tools.push(entry.tool);
      } else if (this.discoveredToolNames.has(name)) {
        tools.push(entry.tool);
      }
    }
    return tools;
  }

  /** Build the system prompt hint listing the stable deferred catalog. */
  buildDeferredToolsHint(): string {
    if (this.deferredToolNames.size === 0) return "";

    const grouped = new Map<string, string[]>();
    for (const name of this.deferredToolNames) {
      const prefix = name.startsWith("mcp__")
        ? name.split("__").slice(0, 2).join("__")
        : "other";
      if (!grouped.has(prefix)) grouped.set(prefix, []);
      grouped.get(prefix)!.push(name);
    }

    const lines: string[] = [];
    lines.push("");
    lines.push("## Discoverable Tools");
    lines.push("");
    lines.push(
      "The following tools belong to the deferred catalog. Call `search_tools` to search and load them by keyword or exact name.",
    );
    lines.push(
      "Some of them may already be loaded in this session.",
    );
    lines.push("");

    for (const [group, names] of grouped) {
      if (grouped.size > 1) {
        lines.push(`**${group}** (${names.length} tools)`);
      }
      for (const name of names) {
        const entry = this.allTools.get(name);
        const desc = entry?.description
          ? ` — ${entry.description.slice(0, 80)}`
          : "";
        lines.push(`  - ${name}${desc}`);
      }
    }

    return lines.join("\n");
  }

  /** Search deferred tools by query. Only searches undiscovered tools. */
  search(query: string, maxResults: number = 5): ToolSearchEntry[] {
    const deferred = [...this.deferredToolNames]
      .filter((n) => !this.discoveredToolNames.has(n))
      .map((name) => this.allTools.get(name)!)
      .filter(Boolean);

    // Exact selection: "select:ToolA,ToolB"
    const selectMatch = query.match(/^select:(.+)$/i);
    if (selectMatch) {
      const requested = selectMatch[1].split(",").map((s) => s.trim());
      return requested
        .map((name) => deferred.find((t) => t.name === name))
        .filter(Boolean) as ToolSearchEntry[];
    }

    // Keyword search
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (terms.length === 0) return [];

    const scored = deferred.map((entry) => ({
      entry,
      score: this.calculateScore(entry, terms),
    }));

    return scored
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, maxResults)
      .map((s) => s.entry);
  }

  private calculateScore(entry: ToolSearchEntry, terms: string[]): number {
    const nameParts = entry.name.toLowerCase().split(/[_\-\s]+/);
    const desc = entry.description.toLowerCase();
    const hint = entry.searchHint.toLowerCase();

    let score = 0;
    for (const term of terms) {
      if (nameParts.includes(term)) {
        score += 10;
      } else if (nameParts.some((p) => p.includes(term))) {
        score += 5;
      }
      if (hint.includes(term)) {
        score += 4;
      }
      if (desc.includes(term)) {
        score += 2;
      }
    }
    return score;
  }

  /** Serialize discovered set for session persistence. */
  serializeDiscovered(): string[] {
    return [...this.discoveredToolNames];
  }

  /** Restore discovered set from saved session. */
  restoreDiscovered(names: string[]): void {
    this.discoveredToolNames = new Set(
      names.filter((n) => this.deferredToolNames.has(n)),
    );
  }
}
