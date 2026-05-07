import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { MemoryManager } from "../../src/memory/manager.js";

describe("MemoryManager", () => {
  let dataDir: string;
  let projectPath: string;
  let config: Parameters<typeof MemoryManager.prototype.constructor>[2];

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), "memory-test-"));
    projectPath = "/test/project";
    config = {
      enabled: true,
      autoExtract: false,
      maxGlobalEntries: 50,
      maxProjectEntries: 100,
    };
  });

  it("should return empty memories when disabled", () => {
    const mm = new MemoryManager(dataDir, projectPath, { ...config, enabled: false });
    expect(mm.getRelevantMemories()).toBe("");
  });

  it("should return empty memories when no entries exist", () => {
    const mm = new MemoryManager(dataDir, projectPath, config);
    expect(mm.getRelevantMemories()).toBe("");
  });

  it("should add and retrieve global memories", () => {
    const mm = new MemoryManager(dataDir, projectPath, config);
    mm.addMemory("User prefers TypeScript", "global", "session-1");

    const memories = mm.listMemories("global");
    expect(memories.length).toBe(1);
    expect(memories[0].content).toBe("User prefers TypeScript");
    expect(memories[0].scope).toBe("global");
    expect(memories[0].source.sessionId).toBe("session-1");
  });

  it("should add and retrieve project memories", () => {
    const mm = new MemoryManager(dataDir, projectPath, config);
    mm.addMemory("Project uses vitest", "project", "session-1");

    const memories = mm.listMemories("project");
    expect(memories.length).toBe(1);
    expect(memories[0].content).toBe("Project uses vitest");
    expect(memories[0].scope).toBe("project");
  });

  it("should list all memories when no scope specified", () => {
    const mm = new MemoryManager(dataDir, projectPath, config);
    mm.addMemory("Global memory", "global", "s1");
    mm.addMemory("Project memory", "project", "s1");

    const all = mm.listMemories();
    expect(all.length).toBe(2);
  });

  it("should format memories in getRelevantMemories", () => {
    const mm = new MemoryManager(dataDir, projectPath, config);
    mm.addMemory("User prefers TypeScript", "global", "s1");
    mm.addMemory("Project uses vitest", "project", "s1");

    const section = mm.getRelevantMemories();
    expect(section).toContain("Memories");
    expect(section).toContain("User Preferences");
    expect(section).toContain("User prefers TypeScript");
    expect(section).toContain("Project Context");
    expect(section).toContain("Project uses vitest");
  });

  it("should remove a memory by id", () => {
    const mm = new MemoryManager(dataDir, projectPath, config);
    mm.addMemory("Memory to remove", "global", "s1");
    const memories = mm.listMemories("global");
    const id = memories[0].id;

    mm.removeMemory(id);
    expect(mm.listMemories("global").length).toBe(0);
  });

  it("should not throw when removing non-existent memory", () => {
    const mm = new MemoryManager(dataDir, projectPath, config);
    expect(() => mm.removeMemory("nonexistent")).not.toThrow();
  });

  it("should clear global memories", () => {
    const mm = new MemoryManager(dataDir, projectPath, config);
    mm.addMemory("Global 1", "global", "s1");
    mm.addMemory("Global 2", "global", "s1");
    mm.clearMemories("global");
    expect(mm.listMemories("global").length).toBe(0);
  });

  it("should clear project memories", () => {
    const mm = new MemoryManager(dataDir, projectPath, config);
    mm.addMemory("Project 1", "project", "s1");
    mm.clearMemories("project");
    expect(mm.listMemories("project").length).toBe(0);
  });

  it("should clear all memories when no scope specified", () => {
    const mm = new MemoryManager(dataDir, projectPath, config);
    mm.addMemory("Global", "global", "s1");
    mm.addMemory("Project", "project", "s1");
    mm.clearMemories();
    expect(mm.listMemories().length).toBe(0);
  });

  it("should respect maxGlobalEntries", () => {
    const mm = new MemoryManager(dataDir, projectPath, {
      ...config,
      maxGlobalEntries: 3,
    });
    mm.addMemory("M1", "global", "s1");
    mm.addMemory("M2", "global", "s1");
    mm.addMemory("M3", "global", "s1");
    mm.addMemory("M4", "global", "s1"); // should push out M1

    const memories = mm.listMemories("global");
    expect(memories.length).toBe(3);
    expect(memories[0].content).toBe("M4"); // newest first
  });

  it("should respect maxProjectEntries", () => {
    const mm = new MemoryManager(dataDir, projectPath, {
      ...config,
      maxProjectEntries: 2,
    });
    mm.addMemory("P1", "project", "s1");
    mm.addMemory("P2", "project", "s1");
    mm.addMemory("P3", "project", "s1"); // should push out P1

    const memories = mm.listMemories("project");
    expect(memories.length).toBe(2);
    expect(memories[0].content).toBe("P3");
  });

  it("should generate unique memory IDs", () => {
    const mm = new MemoryManager(dataDir, projectPath, config);
    mm.addMemory("M1", "global", "s1");
    mm.addMemory("M2", "global", "s1");
    const memories = mm.listMemories("global");
    expect(memories[0].id).not.toBe(memories[1].id);
  });
});
