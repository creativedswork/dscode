import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execSync } from "node:child_process";

import {
  CheckpointManager,
  FileWriteTracker,
  FileSystemCheckpointStore,
  initCheckpointSystem,
  getCheckpointManager,
  getFileWriteTracker,
  shutdownCheckpointSystem,
} from "../../src/checkpoint/index.js";

describe("CheckpointManager", () => {
  let tmpDir: string;

  function createFile(relPath: string, content: string): string {
    const fullPath = join(tmpDir, relPath);
    const dir = join(fullPath, "..");
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(fullPath, content);
    return fullPath;
  }

  function makeCpm(sessionId = "test-session"): CheckpointManager {
    const store = new FileSystemCheckpointStore(join(tmpDir, sessionId));
    return new CheckpointManager(store, tmpDir);
  }

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "dscode-checkpoint-test-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("save", () => {
    it("should mark file as dirty after save", () => {
      const filePath = createFile("test.ts", "line1\nline2\nline3");
      const cpm = makeCpm();

      expect(cpm.isDirty(filePath)).toBe(false);
      cpm.save(filePath, "edit");
      expect(cpm.isDirty(filePath)).toBe(true);
    });

    it("should save checkpoint that can be rolled back", () => {
      const filePath = createFile("test.ts", "original");
      const cpm = makeCpm();

      cpm.save(filePath, "edit");
      writeFileSync(filePath, "modified");
      cpm.rollback(filePath);

      expect(readFileSync(filePath, "utf8")).toBe("original");
    });

    it("should overwrite previous checkpoint for same file (latest wins)", () => {
      const filePath = createFile("test.ts", "v1");
      const cpm = makeCpm();

      cpm.save(filePath, "edit");
      writeFileSync(filePath, "v2");
      cpm.save(filePath, "edit");
      cpm.rollback(filePath);

      expect(readFileSync(filePath, "utf8")).toBe("v2");
    });

    it("should handle saving a file that does not exist", () => {
      const filePath = join(tmpDir, "nonexistent.ts");
      const cpm = makeCpm();

      cpm.save(filePath, "write_file");
      // File didn't exist, now create it and rollback should delete it
      writeFileSync(filePath, "created after save");
      cpm.rollback(filePath);

      expect(existsSync(filePath)).toBe(false);
    });
  });

  describe("rollback", () => {
    it("should restore file from checkpoint", () => {
      const filePath = createFile("test.ts", "original content");
      const cpm = makeCpm();

      cpm.save(filePath, "edit");
      writeFileSync(filePath, "modified content");
      cpm.rollback(filePath);

      expect(readFileSync(filePath, "utf8")).toBe("original content");
      expect(cpm.isDirty(filePath)).toBe(false);
    });

    it("should delete file that did not exist at checkpoint", () => {
      const filePath = join(tmpDir, "newfile.ts");
      const cpm = makeCpm();

      cpm.save(filePath, "write_file"); // file doesn't exist yet
      writeFileSync(filePath, "created after checkpoint");
      cpm.rollback(filePath);

      expect(existsSync(filePath)).toBe(false);
    });

    it("should throw if no checkpoint exists", () => {
      const filePath = createFile("test.ts", "content");
      const cpm = makeCpm();

      expect(() => cpm.rollback(filePath)).toThrow("No checkpoint found");
    });

    it("should clean up after rollback (no longer dirty)", () => {
      const filePath = createFile("test.ts", "original");
      const cpm = makeCpm();

      cpm.save(filePath, "edit");
      cpm.rollback(filePath);

      expect(cpm.isDirty(filePath)).toBe(false);
    });
  });

  describe("commit", () => {
    it("should mark file as clean after commit", () => {
      const filePath = createFile("test.ts", "content");
      const cpm = makeCpm();

      cpm.save(filePath, "edit");
      cpm.commit(filePath);

      expect(cpm.isDirty(filePath)).toBe(false);
    });

    it("should be a no-op if no checkpoint exists", () => {
      const filePath = createFile("test.ts", "content");
      const cpm = makeCpm();

      expect(() => cpm.commit(filePath)).not.toThrow();
    });
  });

  describe("listDirty", () => {
    it("should return all files with uncommitted checkpoints", () => {
      const fileA = createFile("a.ts", "a");
      const fileB = createFile("b.ts", "b");
      const cpm = makeCpm();

      cpm.save(fileA, "edit");
      cpm.save(fileB, "write_file");

      const dirty = cpm.listDirty();
      expect(dirty).toHaveLength(2);
      expect(dirty).toContain(fileA);
      expect(dirty).toContain(fileB);

      cpm.commit(fileA);
      expect(cpm.listDirty()).toEqual([fileB]);
    });

    it("should return empty array when no checkpoints", () => {
      const cpm = makeCpm();
      expect(cpm.listDirty()).toEqual([]);
    });
  });

  describe("getBaseCommit", () => {
    it("should return unknown when not in a git repo", () => {
      const cpm = makeCpm();
      expect(cpm.getBaseCommit()).toBe("unknown");
    });

    it("should capture git commit when in a git repo", () => {
      // Initialize a git repo in tmpDir
      execSync("git init", { cwd: tmpDir, stdio: "pipe" });
      execSync("git config user.email test@test.com", { cwd: tmpDir, stdio: "pipe" });
      execSync("git config user.name Test", { cwd: tmpDir, stdio: "pipe" });
      createFile("dummy.txt", "test");
      execSync("git add dummy.txt", { cwd: tmpDir, stdio: "pipe" });
      execSync('git commit -m "init"', { cwd: tmpDir, stdio: "pipe" });

      const expectedHash = execSync("git rev-parse HEAD", { cwd: tmpDir, encoding: "utf8" }).trim();
      // Create new CPM after git init so it captures the commit
      const cpm = makeCpm();

      expect(cpm.getBaseCommit()).toBe(expectedHash);
    });
  });

  describe("cleanup", () => {
    it("should remove all checkpoints for the session", () => {
      const filePath = createFile("test.ts", "content");
      const cpm = makeCpm();

      cpm.save(filePath, "edit");
      expect(cpm.listDirty()).toHaveLength(1);

      cpm.cleanup();
      expect(cpm.listDirty()).toEqual([]);
    });

    it("should be a no-op if nothing to clean", () => {
      const cpm = makeCpm();
      expect(() => cpm.cleanup()).not.toThrow();
    });
  });

  describe("session isolation", () => {
    it("should isolate checkpoints between sessions", () => {
      const filePath = createFile("test.ts", "content");

      const cpm1 = makeCpm("session-1");
      cpm1.save(filePath, "edit");
      expect(cpm1.isDirty(filePath)).toBe(true);

      const cpm2 = makeCpm("session-2");
      expect(cpm2.isDirty(filePath)).toBe(false);

      cpm1.cleanup();
      cpm2.cleanup();
    });
  });
});

describe("FileSystemCheckpointStore", () => {
  let tmpDir: string;

  function createFile(relPath: string, content: string): string {
    const fullPath = join(tmpDir, relPath);
    const dir = join(fullPath, "..");
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(fullPath, content);
    return fullPath;
  }

  function makeStore(sessionId = "test-session"): FileSystemCheckpointStore {
    return new FileSystemCheckpointStore(join(tmpDir, sessionId));
  }

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "dscode-fsstore-test-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should persist and retrieve metadata", () => {
    const store = makeStore();
    const meta = {
      filePath: "/a/b/test.ts",
      baseCommit: "abc1234",
      writerType: "edit" as const,
      timestamp: Date.now(),
      fileVersion: "fv_00000000",
    };

    store.save(meta, Buffer.from("hello"));
    const loaded = store.load("/a/b/test.ts");

    expect(loaded).not.toBeNull();
    expect(loaded!.meta.filePath).toBe("/a/b/test.ts");
    expect(loaded!.meta.baseCommit).toBe("abc1234");
    expect(loaded!.meta.writerType).toBe("edit");
    expect(loaded!.content!.toString()).toBe("hello");
  });

  it("should return null for non-existent checkpoint", () => {
    const store = makeStore();
    expect(store.load("/nonexistent")).toBeNull();
  });

  it("should list all checkpoints", () => {
    const store = makeStore();
    store.save(
      { filePath: "/a.ts", baseCommit: "x", writerType: "edit", timestamp: 1, fileVersion: "" },
      Buffer.from("a"),
    );
    store.save(
      { filePath: "/b.ts", baseCommit: "x", writerType: "write_file", timestamp: 2, fileVersion: "" },
      Buffer.from("b"),
    );

    const list = store.list();
    expect(list).toHaveLength(2);
    const paths = list.map(m => m.filePath);
    expect(paths).toContain("/a.ts");
    expect(paths).toContain("/b.ts");
  });

  it("should delete individual checkpoints", () => {
    const store = makeStore();
    store.save(
      { filePath: "/a.ts", baseCommit: "x", writerType: "edit", timestamp: 1, fileVersion: "" },
      Buffer.from("a"),
    );

    store.delete("/a.ts");
    expect(store.load("/a.ts")).toBeNull();
    expect(store.list()).toEqual([]);
  });

  it("should clear all checkpoints", () => {
    const store = makeStore();
    store.save(
      { filePath: "/a.ts", baseCommit: "x", writerType: "edit", timestamp: 1, fileVersion: "" },
      Buffer.from("a"),
    );
    store.clear();
    expect(store.list()).toEqual([]);
  });
});

describe("FileWriteTracker", () => {
  describe("recordWrite and getWriter", () => {
    it("should record and retrieve writer type", () => {
      const fwt = new FileWriteTracker();
      fwt.recordWrite("/path/to/file.ts", "edit");
      expect(fwt.getWriter("/path/to/file.ts")).toBe("edit");
    });

    it("should overwrite previous writer", () => {
      const fwt = new FileWriteTracker();
      fwt.recordWrite("/path/to/file.ts", "write_file");
      fwt.recordWrite("/path/to/file.ts", "edit");
      expect(fwt.getWriter("/path/to/file.ts")).toBe("edit");
    });

    it("should return null for unknown files", () => {
      const fwt = new FileWriteTracker();
      expect(fwt.getWriter("/unknown.ts")).toBeNull();
    });
  });

  describe("getContinuity", () => {
    it("should return clean for first write", () => {
      const fwt = new FileWriteTracker();
      expect(fwt.getContinuity("/path/to/file.ts", "edit")).toBe("clean");
    });

    it("should return clean for same writer", () => {
      const fwt = new FileWriteTracker();
      fwt.recordWrite("/path/to/file.ts", "edit");
      expect(fwt.getContinuity("/path/to/file.ts", "edit")).toBe("clean");
    });

    it("should return mixed for different writer", () => {
      const fwt = new FileWriteTracker();
      fwt.recordWrite("/path/to/file.ts", "bash");
      expect(fwt.getContinuity("/path/to/file.ts", "edit")).toBe("mixed");
    });
  });

  describe("markExternalWrite", () => {
    it("should mark file as bash writer", () => {
      const fwt = new FileWriteTracker();
      const result = fwt.markExternalWrite("/path/to/file.ts");

      expect(fwt.getWriter("/path/to/file.ts")).toBe("bash");
      expect(result.anchorInvalidated).toBe(true);
    });
  });
});

describe("singleton lifecycle", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "dscode-singleton-test-"));
  });

  afterEach(() => {
    shutdownCheckpointSystem();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should return null before initialization", () => {
    shutdownCheckpointSystem();
    expect(getCheckpointManager()).toBeNull();
    expect(getFileWriteTracker()).toBeNull();
  });

  it("should return instances after initialization", () => {
    const { checkpointManager, fileWriteTracker } = initCheckpointSystem(tmpDir, "test-session");

    expect(getCheckpointManager()).toBe(checkpointManager);
    expect(getFileWriteTracker()).toBe(fileWriteTracker);
  });

  it("should clean up on shutdown", () => {
    initCheckpointSystem(tmpDir, "test-session");
    expect(getCheckpointManager()).not.toBeNull();

    shutdownCheckpointSystem();
    expect(getCheckpointManager()).toBeNull();
    expect(getFileWriteTracker()).toBeNull();
  });
});
