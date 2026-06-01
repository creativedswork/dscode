import { describe, it, expect } from "vitest";
import { readFileSync, writeFileSync, unlinkSync, existsSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  computeLineHash,
  computeResolutionHash,
  computeFileVersion,
  hashLines,
  formatHashedLine,
  editTool,
  ANCHOR_FORMAT_VERSION,
} from "../../src/drivers/edit.js";

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

  it("should use occurrence for delete_line on duplicate line", async () => {
    const filePath = createTempFile("a\nb\na\nc");
    const aHash = computeLineHash("a");
    const result = await editTool.execute("test-id", {
      file_path: filePath,
      operations: [{ op: "delete_line", hash: aHash, occurrence: 1 }],
    });
    expect(result.details?.error).toBeUndefined();
    expect(readFile(filePath)).toBe("b\na\nc");
  });

  it("should use occurrence for insert_after on duplicate line", async () => {
    const filePath = createTempFile("a\nb\na\nc");
    const aHash = computeLineHash("a");
    const result = await editTool.execute("test-id", {
      file_path: filePath,
      operations: [{ op: "insert_after", hash: aHash, occurrence: 2, content: "INSERTED" }],
    });
    expect(result.details?.error).toBeUndefined();
    expect(readFile(filePath)).toBe("a\nb\na\nINSERTED\nc");
  });

  it("should auto-resolve range with both endpoints identical content", async () => {
    const filePath = createTempFile("a\nb\na\nc\na");
    const aHash = computeLineHash("a");
    const bHash = getHash(filePath, 2);
    const result = await editTool.execute("test-id", {
      file_path: filePath,
      operations: [{ op: "delete_range", start_hash: aHash, end_hash: aHash }],
    });
    expect(result.details?.error).toBeUndefined();
    expect(readFile(filePath)).toBe("b\na\nc\na");
  });

  it("should resolve to first occurrence for ambiguous batch", async () => {
    const filePath = createTempFile("a\nb\na\nc");
    const aHash = computeLineHash("a");
    const result = await editTool.execute("test-id", {
      file_path: filePath,
      operations: [{ op: "replace_line", hash: aHash, content: "X" }],
    });
    expect(result.details?.error).toBeUndefined();
  });

  it("should return invalidation scope after edit", async () => {
    const filePath = createTempFile("line 1\nline 2\nline 3\nline 4\nline 5");
    const hash = getHash(filePath, 3);
    const result = await editTool.execute("test-id", {
      file_path: filePath,
      operations: [{ op: "replace_line", hash, content: "line 3 modified" }],
    });
    expect(result.details?.anchors_valid_through).toBe(2);
    expect(result.details?.must_refresh_from_line).toBe(3);
  });

  it("should reject low-entropy single-line anchor", async () => {
    const filePath = createTempFile("line 1\n,\nline 3\n,\nline 5");
    const commaHash = computeLineHash(",");
    expect(commaHash).toBeTruthy();
    const result = await editTool.execute("test-id", {
      file_path: filePath,
      operations: [{ op: "replace_line", hash: commaHash, content: ";" }],
    });
    expect(result.details?.error).toBeTruthy();
  });

  it("should return invalid_range_order for reversed range", async () => {
    const filePath = createTempFile("line 1\nline 2\nline 3\nline 4\nline 5");
    const endHash = getHash(filePath, 2);
    const startHash = getHash(filePath, 4);
    const result = await editTool.execute("test-id", {
      file_path: filePath,
      operations: [{ op: "replace_range", start_hash: startHash, end_hash: endHash, content: "X" }],
    });
    expect(result.details?.error).toBe("invalid_range_order");
  });

  it("should return baseline_continuity and writer_type on success", async () => {
    const filePath = createTempFile("line 1\nline 2\nline 3");
    const hash = getHash(filePath, 2);
    const result = await editTool.execute("test-id", {
      file_path: filePath,
      operations: [{ op: "replace_line", hash, content: "line 2 replaced" }],
    });
    expect(result.details?.baseline_continuity).toBeDefined();
    expect(result.details?.writer_type).toBe("edit");
  });

  describe("line-hint disambiguation", () => {
    it("should resolve ambiguous hash with line hint", async () => {
      const filePath = createTempFile("a\nb\na\nd\na\ne\na\nf");
      const aHash = computeLineHash("a");
      const result = await editTool.execute("test-id", {
        file_path: filePath,
        operations: [{ op: "replace_line", hash: aHash, line: 5, content: "X" }],
      });
      expect(result.details?.error).toBeUndefined();
      expect(readFile(filePath)).toBe("a\nb\na\nd\nX\ne\na\nf");
    });

    it("should resolve ambiguous hash with line hint for delete", async () => {
      const filePath = createTempFile("a\nb\na\nd");
      const aHash = computeLineHash("a");
      const result = await editTool.execute("test-id", {
        file_path: filePath,
        operations: [{ op: "delete_line", hash: aHash, line: 3 }],
      });
      expect(result.details?.error).toBeUndefined();
      expect(readFile(filePath)).toBe("a\nb\nd");
    });

    it("should reject when line hint is equidistant to two candidates", async () => {
      const filePath = createTempFile("a\nb\na");
      const aHash = computeLineHash("a");
      const result = await editTool.execute("test-id", {
        file_path: filePath,
        operations: [{ op: "replace_line", hash: aHash, line: 2, content: "X" }],
      });
      expect(result.details?.error).toBeTruthy();
    });

    it("should resolve to first occurrence for ambiguous hash without line hint", async () => {
      const filePath = createTempFile("a\nb\na");
      const aHash = computeLineHash("a");
      const result = await editTool.execute("test-id", {
        file_path: filePath,
        operations: [{ op: "replace_line", hash: aHash, content: "X" }],
      });
      expect(result.details?.error).toBeUndefined();
    });
  });

  it("should return suggested_action on empty_operations", async () => {
    const filePath = createTempFile("content");
    const result = await editTool.execute("test-id", {
      file_path: filePath,
      operations: [],
    });
    expect(result.details?.error).toBe("empty_operations");
    expect(result.details?.suggested_action).toBe("provide_at_least_one_operation");
  });

  it("should auto-resolve batch with duplicate-content hashes", async () => {
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
});
