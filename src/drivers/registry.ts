import type { AgentTool } from "@mariozechner/pi-agent-core";

import type { Driver } from "../core/types.js";
import { readFileTool, writeFileTool, overwriteFileTool, listFilesTool } from "./fs.js";
import { bashTool } from "./shell.js";
import { grepTool, globTool } from "./search.js";
import { editTool } from "./edit.js";

const BUILTIN_DRIVERS: Driver[] = [
  {
    name: "fs",
    description: "File read/write/list operations with anchor-based editing and version protection",
    tools: [readFileTool, writeFileTool, overwriteFileTool, listFilesTool],
    source: "builtin",
  },
  {
    name: "shell",
    description: "Shell command execution",
    tools: [bashTool],
    source: "builtin",
  },
  {
    name: "search",
    description: "File content search and glob",
    tools: [grepTool, globTool],
    source: "builtin",
  },
  {
    name: "edit",
    description: "Anchor-based file editing (replace, insert, delete by content hash)",
    tools: [editTool],
    source: "builtin",
  },
];

export class DriverRegistry {
  private drivers = new Map<string, Driver>();

  constructor() {
    for (const d of BUILTIN_DRIVERS) {
      this.drivers.set(d.name, d);
    }
  }

  register(driver: Driver): void {
    this.drivers.set(driver.name, driver);
  }

  get(name: string): Driver | undefined {
    return this.drivers.get(name);
  }

  listAll(): Driver[] {
    return Array.from(this.drivers.values());
  }

  getAllTools(): AgentTool<any>[] {
    const tools: AgentTool<any>[] = [];
    for (const d of this.drivers.values()) {
      tools.push(...d.tools);
    }
    return tools;
  }

  getDriversBySource(source: "builtin" | "mcp"): Driver[] {
    return [...this.drivers.values()].filter((d) => d.source === source);
  }

  unregister(name: string): boolean {
    return this.drivers.delete(name);
  }
}
