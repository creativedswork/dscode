import { afterEach, beforeEach, describe, it, expect } from "vitest";
import { readFileSync, writeFileSync, unlinkSync, existsSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  computeLineHash,
  computeResolutionHash,
  computeFileVersion,
  hashLines,
  formatHashedLine,
  ANCHOR_FORMAT_VERSION,
} from "../../src/drivers/edit/hash.js";
import { editTool } from "../../src/drivers/edit/index.js";
import {
  bindExecutionContext,
} from "../../src/kernel/execution-context.js";
import { HostFacilityRegistry } from "../../src/kernel/host-facilities.js";
import {
  UNDO_STORE_FACILITY,
  UndoSnapshotStore,
} from "../../src/drivers/edit/undo-store.js";
import {
  ANCHOR_INVALIDATION_FACILITY,
  AnchorInvalidationStore,
} from "../../src/context/anchor-invalidation.js";

let releaseExecutionContext: (() => void) | undefined;

beforeEach(() => {
  const facilities = new HostFacilityRegistry()
    .register(UNDO_STORE_FACILITY, new UndoSnapshotStore())
    .register(
      ANCHOR_INVALIDATION_FACILITY,
      new AnchorInvalidationStore(),
    );
  releaseExecutionContext = bindExecutionContext({
    hostId: "edit-test-host",
    processId: "edit-test-process",
    sessionId: "edit-test-session",
    application: "edit-test",
    cwd: tmpdir(),
    facilities,
  });
});

afterEach(() => {
  releaseExecutionContext?.();
  releaseExecutionContext = undefined;
});

// --- computeLineHash ---

describe("computeLineHash", () => {
  it("should produce deterministic output for same input", () => {
    const h1 = computeLineHash("function hello() {");
    const h2 = computeLineHash("function hello() {");
    expect(h1).toBe(h2);
  });

  it("should produce 6-character hex string", () => {
    const hash = computeLineHash("some line content");
    expect(hash).toMatch(/^[0-9a-f]{6}$/);
  });

  it("should produce same hash for same content regardless of position", () => {
    const h1 = computeLineHash("}");
    const h2 = computeLineHash("}");
    expect(h1).toBe(h2);
  });

  it("should trim whitespace before hashing", () => {
    const h1 = computeLineHash("  return x;  ");
    const h2 = computeLineHash("return x;");
    expect(h1).toBe(h2);
  });

  it("should produce different hashes for different content", () => {
    const h1 = computeLineHash("const x = 1;");
    const h2 = computeLineHash("const x = 2;");
    expect(h1).not.toBe(h2);
  });
});

// --- computeFileVersion ---

describe("computeFileVersion", () => {
  it("should produce deterministic output for same content", () => {
    const v1 = computeFileVersion("hello\nworld");
    const v2 = computeFileVersion("hello\nworld");
    expect(v1).toBe(v2);
  });

  it("should produce different versions for different content", () => {
    const v1 = computeFileVersion("hello\nworld");
    const v2 = computeFileVersion("hello\nworld!");
    expect(v1).not.toBe(v2);
  });

  it("should prefix with fv_", () => {
    const v = computeFileVersion("test");
    expect(v).toMatch(/^fv_[0-9a-f]{8}$/);
  });
});

// --- hashLines (v3: returns {resolutionMap, displayIndex}) ---

describe("hashLines", () => {
  it("should build resolutionMap with 8-char hashes", () => {
    const lines = ["line one", "line two", "line three"];
    const { resolutionMap } = hashLines(lines);
    expect(resolutionMap.size).toBe(3);
  });

  it("should group duplicate content under same hash", () => {
    const lines = ["a", "b", "a"];
    const { resolutionMap } = hashLines(lines);
    expect(resolutionMap.size).toBe(2);
    const aHash = computeResolutionHash("a");
    const aNums = resolutionMap.get(aHash);
    expect(aNums).toEqual([1, 3]);
  });

  it("should handle empty array", () => {
    const { resolutionMap } = hashLines([]);
    expect(resolutionMap.size).toBe(0);
  });

  it("should handle single line", () => {
    const { resolutionMap } = hashLines(["only line"]);
    expect(resolutionMap.size).toBe(1);
    const hash = computeResolutionHash("only line");
    expect(resolutionMap.get(hash)).toEqual([1]);
  });

  it("should return displayIndex", () => {
    const { displayIndex } = hashLines(["a", "b"]);
    expect(displayIndex.size).toBeGreaterThan(0);
  });
});

// --- formatHashedLine (v3: includes quality) ---

describe("formatHashedLine", () => {
  it("should format line with # anchor prefix and quality", () => {
    const result = formatHashedLine(1, "a1b2c3", "function hello() {", "high");
    expect(result).toBe("1#a1b2c3 [high]|function hello() {");
  });

  it("should handle empty content with quality", () => {
    const result = formatHashedLine(3, "c3d4e5", "", "low");
    expect(result).toBe("3#c3d4e5 [low]|");
  });
});

// --- anchor_format_version ---

describe("ANCHOR_FORMAT_VERSION", () => {
  it("should be v3", () => {
    expect(ANCHOR_FORMAT_VERSION).toBe("v3");
  });
});

// --- editTool ---

describe("editTool", () => {
  let tmpDir: string;

  function createTempFile(content: string): string {
    const filePath = join(tmpDir, "test-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8) + ".txt");
    writeFileSync(filePath, content);
    return filePath;
  }

  function readFile(path: string): string {
    return readFileSync(path, "utf8");
  }

  function getHash(filePath: string, lineNumber: number): string {
    const lines = readFile(filePath).split("\n");
    return computeLineHash(lines[lineNumber - 1]);
  }

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "dscode-edit-test-"));
  });

  it("should replace a single line by hash", async () => {
    const filePath = createTempFile("line 1\nline 2\nline 3");
    const hash = getHash(filePath, 2);
    const result = await editTool.execute("test-id", {
      file_path: filePath,
      operations: [{ op: "replace_line", hash, content: "line 2 replaced" }],
    });
    expect(result.details?.error).toBeUndefined();
    expect(readFile(filePath)).toBe("line 1\nline 2 replaced\nline 3");
  });

  it("should replace a range of lines", async () => {
    const filePath = createTempFile("line 1\nline 2\nline 3\nline 4\nline 5");
    const startHash = getHash(filePath, 2);
    const endHash = getHash(filePath, 4);
    const result = await editTool.execute("test-id", {
      file_path: filePath,
      operations: [{ op: "replace_range", start_hash: startHash, end_hash: endHash, content: "A\nB\nC" }],
    });
    expect(result.details?.error).toBeUndefined();
    expect(readFile(filePath)).toBe("line 1\nA\nB\nC\nline 5");
  });

  it("should insert content after a line", async () => {
    const filePath = createTempFile("line 1\nline 2\nline 3");
    const hash = getHash(filePath, 1);
    const result = await editTool.execute("test-id", {
      file_path: filePath,
      operations: [{ op: "insert_after", hash, content: "inserted A\ninserted B" }],
    });
    expect(result.details?.error).toBeUndefined();
    expect(readFile(filePath)).toBe("line 1\ninserted A\ninserted B\nline 2\nline 3");
  });

  it("should insert after last line", async () => {
    const filePath = createTempFile("line 1\nline 2");
    const hash = getHash(filePath, 2);
    const result = await editTool.execute("test-id", {
      file_path: filePath,
      operations: [{ op: "insert_after", hash, content: "line 3" }],
    });
    expect(result.details?.error).toBeUndefined();
    expect(readFile(filePath)).toBe("line 1\nline 2\nline 3");
  });

  it("should insert content before a line", async () => {
    const filePath = createTempFile("line 1\nline 2\nline 3");
    const hash = getHash(filePath, 3);
    const result = await editTool.execute("test-id", {
      file_path: filePath,
      operations: [{ op: "insert_before", hash, content: "inserted" }],
    });
    expect(result.details?.error).toBeUndefined();
    expect(readFile(filePath)).toBe("line 1\nline 2\ninserted\nline 3");
  });

  it("should insert before first line", async () => {
    const filePath = createTempFile("line 1\nline 2");
    const hash = getHash(filePath, 1);
    const result = await editTool.execute("test-id", {
      file_path: filePath,
      operations: [{ op: "insert_before", hash, content: "line 0" }],
    });
    expect(result.details?.error).toBeUndefined();
    expect(readFile(filePath)).toBe("line 0\nline 1\nline 2");
  });

  it("should delete a single line by hash", async () => {
    const filePath = createTempFile("line 1\nline 2\nline 3");
    const hash = getHash(filePath, 2);
    const result = await editTool.execute("test-id", {
      file_path: filePath,
      operations: [{ op: "delete_line", hash }],
    });
    expect(result.details?.error).toBeUndefined();
    expect(readFile(filePath)).toBe("line 1\nline 3");
  });

  it("should delete range of lines", async () => {
    const filePath = createTempFile("line 1\nline 2\nline 3\nline 4");
    const startHash = getHash(filePath, 2);
    const endHash = getHash(filePath, 3);
    const result = await editTool.execute("test-id", {
      file_path: filePath,
      operations: [{ op: "delete_range", start_hash: startHash, end_hash: endHash }],
    });
    expect(result.details?.error).toBeUndefined();
    expect(readFile(filePath)).toBe("line 1\nline 4");
  });

  it("should apply multiple operations in batch", async () => {
    const filePath = createTempFile("line 1\nline 2\nline 3");
    const hash1 = getHash(filePath, 1);
    const hash3 = getHash(filePath, 3);
    const result = await editTool.execute("test-id", {
      file_path: filePath,
      operations: [
        { op: "replace_line", hash: hash1, content: "first" },
        { op: "replace_line", hash: hash3, content: "third" },
      ],
    });
    expect(result.details?.error).toBeUndefined();
    expect(readFile(filePath)).toBe("first\nline 2\nthird");
  });

  it("should reject batch if any hash is invalid", async () => {
    const filePath = createTempFile("line 1\nline 2\nline 3");
    const hash1 = getHash(filePath, 1);
    const result = await editTool.execute("test-id", {
      file_path: filePath,
      operations: [
        { op: "replace_line", hash: hash1, content: "first" },
        { op: "replace_line", hash: "deadbe", content: "nope" },
      ],
    });
    expect(result.details?.error).toBeTruthy();
    expect(readFile(filePath)).toBe("line 1\nline 2\nline 3");
  });

  it("should reject if file does not exist", async () => {
    const result = await editTool.execute("test-id", {
      file_path: "/nonexistent/file.txt",
      operations: [{ op: "replace_line", hash: "a1b2c3", content: "x" }],
    });
    expect(result.details?.error).toBe("not_found");
  });

  it("should reject if no operations provided", async () => {
    const filePath = createTempFile("content");
    const result = await editTool.execute("test-id", {
      file_path: filePath,
      operations: [],
    });
    expect(result.details?.error).toBe("empty_operations");
  });

  it("should return details with ok on success", async () => {
    const filePath = createTempFile("line 1\nline 2\nline 3");
    const hash = getHash(filePath, 2);
    const result = await editTool.execute("test-id", {
      file_path: filePath,
      operations: [{ op: "replace_line", hash, content: "line 2 replaced" }],
    });
    expect(result.details?.ok).toBe(true);
    expect(result.details?.operations).toBe(1);
    expect(result.details?.file_version).toBeTruthy();
  });

  it("should reject unknown hash", async () => {
    const filePath = createTempFile("line 1\nline 2\nline 3");
    const result = await editTool.execute("test-id", {
      file_path: filePath,
      operations: [{ op: "replace_line", hash: "abcdef", content: "x" }],
    });
    expect(result.details?.error).toBe("anchor_stale");
  });

  it("should reject overlapping operations", async () => {
    const filePath = createTempFile("line 1\nline 2\nline 3\nline 4\nline 5");
    const line2 = getHash(filePath, 2);
    const line3 = getHash(filePath, 3);
    const line4 = getHash(filePath, 4);
    const result = await editTool.execute("test-id", {
      file_path: filePath,
      operations: [
        { op: "replace_line", hash: line2, content: "A" },
        { op: "replace_range", start_hash: line2, end_hash: line4, content: "B\nC" },
      ],
    });
    expect(result.details?.error).toBe("overlapping_operations");
    expect(readFile(filePath)).toBe("line 1\nline 2\nline 3\nline 4\nline 5");
  });

  it("should auto-resolve sequence of operations with same hash", async () => {
    const filePath = createTempFile("a\nb\na\nc");
    const bHash = getHash(filePath, 2);
    const aHash = computeLineHash("a");
    const result = await editTool.execute("test-id", {
      file_path: filePath,
      operations: [
        { op: "replace_line", hash: bHash, content: "B" },
        { op: "replace_line", hash: aHash, content: "A" },
      ],
    });
    expect(result.details?.error).toBeUndefined();
    expect(readFile(filePath)).toBe("A\nB\na\nc");

});
  // --- Dry-Run Mode Tests ---

  it("should dry-run validate without writing (valid operation)", async () => {
    const filePath = createTempFile("line 1\nline 2\nline 3");
    const hash = getHash(filePath, 2);
    const result = await editTool.execute("test-id", {
      file_path: filePath,
      dry_run: true,
      operations: [{ op: "replace_line", hash, content: "line 2 replaced" }],
    });
    expect(result.details?.dry_run).toBe(true);
    expect(result.details?.valid).toBe(true);
    expect(result.details?.validated_at_file_version).toBeDefined();
    expect(readFile(filePath)).toBe("line 1\nline 2\nline 3");
  });

  it("should dry-run detect stale anchor without writing", async () => {
    const filePath = createTempFile("line 1\nline 2\nline 3");
    const result = await editTool.execute("test-id", {
      file_path: filePath,
      dry_run: true,
      operations: [{ op: "replace_line", hash: "deadbe", content: "x" }],
    });
    expect(result.details?.dry_run).toBe(true);
    expect(result.details?.valid).toBe(false);
    expect(result.details?.error).toBe("anchor_stale");
    expect(readFile(filePath)).toBe("line 1\nline 2\nline 3");
  });

  it("should dry-run reject empty operations", async () => {
    const filePath = createTempFile("content");
    const result = await editTool.execute("test-id", {
      file_path: filePath,
      dry_run: true,
      operations: [],
    });
    expect(result.details?.error).toBe("empty_operations");
  });

  it("should dry-run return validated_at_file_version not file_version", async () => {
    const filePath = createTempFile("line 1\nline 2\nline 3");
    const hash = getHash(filePath, 2);
    const result = await editTool.execute("test-id", {
      file_path: filePath,
      dry_run: true,
      operations: [{ op: "replace_line", hash, content: "line 2 replaced" }],
    });
    expect(result.details?.validated_at_file_version).toBeDefined();
    expect(result.details?.file_version).toBeUndefined();
    expect(result.details?.snapshot_id).toBeUndefined();
    expect(result.details?.syntax_check).toBeUndefined();
  });

  it("should dry-run return invalidation scope", async () => {
    const filePath = createTempFile("line 1\nline 2\nline 3\nline 4\nline 5");
    const hash = getHash(filePath, 3);
    const result = await editTool.execute("test-id", {
      file_path: filePath,
      dry_run: true,
      operations: [{ op: "replace_line", hash, content: "line 3 modified" }],
    });
    expect(result.details?.invalidation_scope).toBeDefined();
  });

  // --- Snapshot & Rollback Tests ---

  it("should include snapshot_id on successful edit", async () => {
    const filePath = createTempFile("line 1\nline 2\nline 3");
    const hash = getHash(filePath, 2);
    const result = await editTool.execute("test-id", {
      file_path: filePath,
      operations: [{ op: "replace_line", hash, content: "line 2 replaced" }],
    });
    expect(result.details?.ok).toBe(true);
    expect(result.details?.snapshot_id).toBeDefined();
  });

  it("should NOT include snapshot_id on rejected edit", async () => {
    const filePath = createTempFile("line 1\nline 2\nline 3");
    const result = await editTool.execute("test-id", {
      file_path: filePath,
      operations: [{ op: "replace_line", hash: "deadbe", content: "x" }],
    });
    expect(result.details?.error).toBe("anchor_stale");
    expect(result.details?.snapshot_id).toBeUndefined();
  });

  it("should NOT capture snapshot on dry-run", async () => {
    const filePath = createTempFile("line 1\nline 2\nline 3");
    const hash = getHash(filePath, 2);
    const result = await editTool.execute("test-id", {
      file_path: filePath,
      dry_run: true,
      operations: [{ op: "replace_line", hash, content: "line 2 replaced" }],
    });
    expect(result.details?.snapshot_id).toBeUndefined();
  });

  // --- edit_undo Tests ---

  describe("edit_undo", () => {
    it("should restore file correctly and clear snapshot", async () => {
      const filePath = createTempFile("line 1\nline 2\nline 3");
      const hash = getHash(filePath, 2);
      await editTool.execute("test-id", {
        file_path: filePath,
        operations: [{ op: "replace_line", hash, content: "line 2 replaced" }],
      });
      expect(readFile(filePath)).toBe("line 1\nline 2 replaced\nline 3");
      const { editUndoTool } = await import("../../src/drivers/edit/edit-undo.js");
      const undoResult = await editUndoTool.execute("test-id", { path: filePath });
      expect(undoResult.details?.restored).toBe(true);
      expect(readFile(filePath)).toBe("line 1\nline 2\nline 3");
    });

    it("should return error when no snapshot exists", async () => {
      const filePath = createTempFile("content");
      const { editUndoTool } = await import("../../src/drivers/edit/edit-undo.js");
      const result = await editUndoTool.execute("test-id", { path: filePath });
      expect(result.details?.restored).toBe(false);
      expect(result.details?.error).toBe("no_snapshot");
    });

    it("should include stale-anchor warning in undo response", async () => {
      const filePath = createTempFile("line 1\nline 2\nline 3");
      const hash = getHash(filePath, 2);
      await editTool.execute("test-id", {
        file_path: filePath,
        operations: [{ op: "replace_line", hash, content: "line 2 replaced" }],
      });
      const { editUndoTool } = await import("../../src/drivers/edit/edit-undo.js");
      const result = await editUndoTool.execute("test-id", { path: filePath });
      expect(result.details?.stale_anchor_warning).toBe(true);
    });

    it("should return file_version after undo", async () => {
      const filePath = createTempFile("line 1\nline 2\nline 3");
      const hash = getHash(filePath, 2);
      await editTool.execute("test-id", {
        file_path: filePath,
        operations: [{ op: "replace_line", hash, content: "line 2 replaced" }],
      });
      const { editUndoTool } = await import("../../src/drivers/edit/edit-undo.js");
      const result = await editUndoTool.execute("test-id", { path: filePath });
      expect(result.details?.file_version).toBeDefined();
    });
  });

  // --- Syntax Validation Tests ---

  it("should include syntax_check on successful JavaScript edit", async () => {
    const filePath = join(tmpDir, "test-syntax.js");
    writeFileSync(filePath, "const x = 1;\nconsole.log(x);\n");
    const hash = getHash(filePath, 1);
    const result = await editTool.execute("test-id", {
      file_path: filePath,
      operations: [{ op: "replace_line", hash, content: "const x = 2;" }],
    });
    expect(result.details?.ok).toBe(true);
    expect(result.details?.syntax_check).toBeDefined();
  });

  it("should syntax_check fail but edit still succeeds (non-blocking)", async () => {
    const filePath = join(tmpDir, "test-syntax-bad.js");
    writeFileSync(filePath, "const x = 1;\n");
    const hash = getHash(filePath, 1);
    const result = await editTool.execute("test-id", {
      file_path: filePath,
      operations: [{ op: "replace_line", hash, content: "const x = ;" }],
    });
    expect(result.details?.ok).toBe(true);
    expect(result.details?.syntax_check).toBeDefined();
    expect(readFile(filePath)).toBe("const x = ;\n");
  });

  it("should skip syntax_check for .txt files", async () => {
    const filePath = join(tmpDir, "test-syntax.txt");
    writeFileSync(filePath, "just some text\n");
    const hash = getHash(filePath, 1);
    const result = await editTool.execute("test-id", {
      file_path: filePath,
      operations: [{ op: "replace_line", hash, content: "modified text" }],
    });
    expect(result.details?.ok).toBe(true);
    expect(result.details?.syntax_check).toBeUndefined();
  });

  // --- Integration Test ---

  it("should support full dry-run to apply to undo cycle", async () => {
    const filePath = createTempFile("line 1\nline 2\nline 3");
    const hash = getHash(filePath, 2);

    // Step 1: Dry-run
    const dryResult = await editTool.execute("test-id", {
      file_path: filePath,
      dry_run: true,
      operations: [{ op: "replace_line", hash, content: "line 2 replaced" }],
    });
    expect(dryResult.details?.dry_run).toBe(true);
    expect(dryResult.details?.valid).toBe(true);
    expect(readFile(filePath)).toBe("line 1\nline 2\nline 3");

    // Step 2: Apply
    const applyResult = await editTool.execute("test-id", {
      file_path: filePath,
      operations: [{ op: "replace_line", hash, content: "line 2 replaced" }],
    });
    expect(applyResult.details?.ok).toBe(true);
    expect(readFile(filePath)).toBe("line 1\nline 2 replaced\nline 3");

    // Step 3: Undo
    const { editUndoTool } = await import("../../src/drivers/edit/edit-undo.js");
    const undoResult = await editUndoTool.execute("test-id", { path: filePath });
    expect(undoResult.details?.restored).toBe(true);
    expect(readFile(filePath)).toBe("line 1\nline 2\nline 3");
  });
});
