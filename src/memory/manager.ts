import type { MemoryConfig, MemoryEntry } from "../core/types.js";
import { MemoryStore } from "./store.js";

function memoryId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export class MemoryManager {
  private store: MemoryStore;
  private config: MemoryConfig;

  constructor(dataDir: string, projectPath: string, config: MemoryConfig) {
    this.store = new MemoryStore(dataDir, projectPath);
    this.config = config;
  }

  updateProjectPath(dataDir: string, projectPath: string): void {
    this.store = new MemoryStore(dataDir, projectPath);
  }

  getRelevantMemories(): string {
    if (!this.config.enabled) return "";

    const global = this.store.getGlobal().slice(0, this.config.maxGlobalEntries);
    const project = this.store.getProject().slice(0, this.config.maxProjectEntries);

    if (global.length === 0 && project.length === 0) return "";

    let section = "\n\n## Memories\n";
    if (global.length > 0) {
      section += "\n### User Preferences\n";
      for (const m of global) {
        section += `- ${m.content}\n`;
      }
    }
    if (project.length > 0) {
      section += "\n### Project Context\n";
      for (const m of project) {
        section += `- ${m.content}\n`;
      }
    }
    return section;
  }

  addMemory(content: string, scope: "global" | "project", sessionId: string): void {
    const entry: MemoryEntry = {
      id: memoryId(),
      scope,
      category: "fact",
      content,
      source: { sessionId, timestamp: Date.now() },
    };

    if (scope === "global") {
      const entries = this.store.getGlobal();
      entries.unshift(entry);
      this.store.saveGlobal(entries.slice(0, this.config.maxGlobalEntries));
    } else {
      const entries = this.store.getProject();
      entries.unshift(entry);
      this.store.saveProject(entries.slice(0, this.config.maxProjectEntries));
    }
  }

  listMemories(scope?: "global" | "project"): MemoryEntry[] {
    if (scope === "global") return this.store.getGlobal();
    if (scope === "project") return this.store.getProject();
    return [...this.store.getGlobal(), ...this.store.getProject()];
  }

  removeMemory(id: string): void {
    let global = this.store.getGlobal();
    let project = this.store.getProject();
    const gLen = global.length;
    const pLen = project.length;

    global = global.filter((m) => m.id !== id);
    project = project.filter((m) => m.id !== id);

    if (global.length !== gLen) this.store.saveGlobal(global);
    if (project.length !== pLen) this.store.saveProject(project);
  }

  clearMemories(scope?: "global" | "project"): void {
    if (!scope || scope === "global") this.store.saveGlobal([]);
    if (!scope || scope === "project") this.store.saveProject([]);
  }
}
