import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";

import type { MemoryEntry } from "./types.js";

export class MemoryStore {
  private dataDir: string;
  private projectHash: string;

  constructor(dataDir: string, projectPath: string) {
    this.dataDir = join(dataDir, "memory");
    this.projectHash = createHash("sha256").update(projectPath).digest("hex").slice(0, 12);
    if (!existsSync(this.dataDir)) {
      mkdirSync(this.dataDir, { recursive: true });
    }
    const projectsDir = join(this.dataDir, "projects");
    if (!existsSync(projectsDir)) {
      mkdirSync(projectsDir, { recursive: true });
    }
  }

  getGlobal(): MemoryEntry[] {
    return this.readFile(join(this.dataDir, "global.json"));
  }

  getProject(): MemoryEntry[] {
    return this.readFile(join(this.dataDir, "projects", `${this.projectHash}.json`));
  }

  saveGlobal(entries: MemoryEntry[]): void {
    writeFileSync(join(this.dataDir, "global.json"), JSON.stringify(entries, null, 2));
  }

  saveProject(entries: MemoryEntry[]): void {
    writeFileSync(
      join(this.dataDir, "projects", `${this.projectHash}.json`),
      JSON.stringify(entries, null, 2),
    );
  }

  private readFile(path: string): MemoryEntry[] {
    if (!existsSync(path)) return [];
    try {
      return JSON.parse(readFileSync(path, "utf8"));
    } catch {
      return [];
    }
  }
}
