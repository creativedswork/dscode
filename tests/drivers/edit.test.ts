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
      operations: [{ op: "insert_before", hash, content: "inserted before" }],
    });
    expect(result.details?.error).toBeUndefined();
    expect(readFile(filePath)).toBe("line 1\nline 2\ninserted before\nline 3");
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

  it("should delete a single line", async () => {
    const filePath = createTempFile("line 1\nline 2\nline 3");
    const hash = getHash(filePath, 2);
    const result = await editTool.execute("test-id", {
      file_path: filePath,
      operations: [{ op: "delete_line", hash }],
    });
    expect(result.details?.error).toBeUndefined();
    expect(readFile(filePath)).toBe("line 1\nline 3");
  });

  it("should delete a range of lines", async () => {
    const filePath = createTempFile("line 1\nline 2\nline 3\nline 4\nline 5");
    const startHash = getHash(filePath, 2);
    const endHash = getHash(filePath, 4);
    const result = await editTool.execute("test-id", {
      file_path: filePath,
      operations: [{ op: "delete_range", start_hash: startHash, end_hash: endHash }],
    });
    expect(result.details?.error).toBeUndefined();
    expect(readFile(filePath)).toBe("line 1\nline 5");
  });

  it("should reject when hash not found (anchor_stale)", async () => {
    const filePath = createTempFile("line 1\nline 2\nline 3");
    const result = await editTool.execute("test-id", {
      file_path: filePath,
      operations: [{ op: "replace_line", hash: "ffffff", content: "should not apply" }],
    });
    expect(result.details?.error).toBe("anchor_stale");
    expect(result.details?.missingHashes).toContain("ffffff");
    expect(result.details?.suggested_action).toBe("re-read_file");
    expect(readFile(filePath)).toBe("line 1\nline 2\nline 3");
  });

  it("should return error for nonexistent file", async () => {
    const result = await editTool.execute("test-id", {
      file_path: "/nonexistent/path/file.txt",
      operations: [{ op: "replace_line", hash: "a1b2c3", content: "x" }],
    });
    expect(result.details?.error).toBe("not_found");
  });

  it("should return error for empty operations", async () => {
    const filePath = createTempFile("content");
    const result = await editTool.execute("test-id", {
      file_path: filePath,
      operations: [],
    });
    expect(result.details?.error).toBe("empty_operations");
  });

  it("should reject entire batch if any hash is invalid", async () => {
    const filePath = createTempFile("line 1\nline 2\nline 3");
    const validHash = getHash(filePath, 1);
    const result = await editTool.execute("test-id", {
      file_path: filePath,
      operations: [
        { op: "replace_line", hash: validHash, content: "new line 1" },
        { op: "replace_line", hash: "ffffff", content: "should not apply" },
      ],
    });
    expect(result.details?.error).toBe("anchor_stale");
    expect(readFile(filePath)).toBe("line 1\nline 2\nline 3");
  });

  it("should apply multiple valid operations sequentially", async () => {
    const filePath = createTempFile("line 1\nline 2\nline 3\nline 4");
    const hash1 = getHash(filePath, 1);
    const hash3 = getHash(filePath, 3);
    const result = await editTool.execute("test-id", {
      file_path: filePath,
      operations: [
        { op: "replace_line", hash: hash1, content: "LINE ONE" },
        { op: "delete_line", hash: hash3 },
      ],
    });
    expect(result.details?.error).toBeUndefined();
    expect(readFile(filePath)).toBe("LINE ONE\nline 2\nline 4");
  });

  it("should keep downstream anchors valid after upstream edit", async () => {
    const filePath = createTempFile("line 1\nline 2\nline 3\nline 4\nline 5");
    const hash5 = getHash(filePath, 5);
    await editTool.execute("test-id", {
      file_path: filePath,
      operations: [{ op: "insert_before", hash: getHash(filePath, 1), content: "line 0" }],
    });
    const result = await editTool.execute("test-id", {
      file_path: filePath,
      operations: [{ op: "replace_line", hash: hash5, content: "LINE FIVE" }],
    });
    expect(result.details?.error).toBeUndefined();
    expect(readFile(filePath)).toBe("line 0\nline 1\nline 2\nline 3\nline 4\nLINE FIVE");
  });

  it("should return operation summary with file_version, invalidation scope, and local diff", async () => {
    const filePath = createTempFile("line 1\nline 2\nline 3");
    const result = await editTool.execute("test-id", {
      file_path: filePath,
      operations: [{ op: "insert_after", hash: getHash(filePath, 3), content: "line 4\nline 5" }],
    });
    expect(result.details?.operations).toBe(1);
    expect(result.details?.linesBefore).toBe(3);
    expect(result.details?.linesAfter).toBe(5);
    expect(result.details?.addedLines).toBe(2);
    expect(result.details?.removedLines).toBe(0);
    expect(result.details?.file_version).toMatch(/^fv_[0-9a-f]{8}$/);
    expect(result.details?.anchors_valid_through).toBeDefined();
    expect(result.details?.must_refresh_from_line).toBeDefined();
    const text = result.content?.[0]?.text ?? "";
    expect(text).toContain("New file version");
    expect(text).toContain("Local diff");
  });

  it("should return ok: true on success", async () => {
    const filePath = createTempFile("line 1\nline 2\nline 3");
    const hash = getHash(filePath, 2);
    const result = await editTool.execute("test-id", {
      file_path: filePath,
      operations: [{ op: "replace_line", hash, content: "LINE TWO" }],
    });
    expect(result.details?.ok).toBe(true);
  });

  it("should return new_anchors array with 6-char lineNum#hash strings", async () => {
    const filePath = createTempFile("line 1\nline 2\nline 3\nline 4\nline 5");
    const hash = getHash(filePath, 3);
    const result = await editTool.execute("test-id", {
      file_path: filePath,
      operations: [{ op: "replace_line", hash, content: "LINE THREE" }],
    });
    expect(result.details?.ok).toBe(true);
    expect(Array.isArray(result.details?.new_anchors)).toBe(true);
    expect(result.details?.new_anchors.length).toBeGreaterThan(0);
    for (const anchor of result.details!.new_anchors!) {
      expect(anchor).toMatch(/^\d+#[0-9a-f]{6}$/);
    }
  });

  it("should return diff_preview array with v3 prefixed lines", async () => {
    const filePath = createTempFile("line 1\nline 2\nline 3\nline 4\nline 5");
    const hash = getHash(filePath, 3);
    const result = await editTool.execute("test-id", {
      file_path: filePath,
      operations: [{ op: "replace_line", hash, content: "LINE THREE" }],
    });
    expect(result.details?.ok).toBe(true);
    expect(Array.isArray(result.details?.diff_preview)).toBe(true);
    expect(result.details?.diff_preview.length).toBeGreaterThan(0);
    for (const line of result.details!.diff_preview!) {
      expect(line).toMatch(/^[-+ ]\d+#[0-9a-f]{6} \[(low|med|high)\]\|/);
    }
  });

  it("should return new_anchors and diff_preview for insert_after", async () => {
    const filePath = createTempFile("line 1\nline 2\nline 3");
    const hash = getHash(filePath, 3);
    const result = await editTool.execute("test-id", {
      file_path: filePath,
      operations: [{ op: "insert_after", hash, content: "line 4\nline 5" }],
    });
    expect(result.details?.ok).toBe(true);
    expect(result.details?.new_anchors.length).toBeGreaterThan(0);
  });

  it("should return new_anchors even for no-op replaces", async () => {
    const filePath = createTempFile("line 1\nline 2\nline 3");
    const hash = getHash(filePath, 2);
    const result = await editTool.execute("test-id", {
      file_path: filePath,
      operations: [{ op: "replace_line", hash, content: "line 2" }],
    });
    expect(result.details?.ok).toBe(true);
    expect(result.details?.new_anchors).toBeDefined();
  });

  it("should use occurrence to target specific duplicate line", async () => {
    const filePath = createTempFile("a\nb\na\nc");
    const aHash = computeLineHash("a");
    const result = await editTool.execute("test-id", {
      file_path: filePath,
      operations: [{ op: "replace_line", hash: aHash, occurrence: 2, content: "A2" }],
    });
    expect(result.details?.error).toBeUndefined();
    expect(readFile(filePath)).toBe("a\nb\nA2\nc");
  });

  it("should auto-resolve duplicate content without occurrence (first match)", async () => {
    const filePath = createTempFile("a\nb\na\nc");
    const aHash = computeLineHash("a");
    const result = await editTool.execute("test-id", {
      file_path: filePath,
      operations: [{ op: "replace_line", hash: aHash, content: "A1" }],
    });
    expect(result.details?.error).toBeUndefined();
    expect(readFile(filePath)).toBe("A1\nb\na\nc");
  });

  it("should resolve to first match when occurrence out of range", async () => {
    const filePath = createTempFile("a\nb\na\nc");
    const aHash = computeLineHash("a");
    const result = await editTool.execute("test-id", {
      file_path: filePath,
      operations: [{ op: "replace_line", hash: aHash, occurrence: 5, content: "x" }],
    });
    expect(result.details?.error).toBeUndefined();
    expect(readFile(filePath)).toBe("x\nb\na\nc");
  });

  it("should use occurrence:1 (first match) for delete_line", async () => {
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

  it("should auto-resolve range op with duplicate start_hash (first match)", async () => {
    const filePath = createTempFile("a\nb\na\nc\nd");
    const aHash = computeLineHash("a");
    const dHash = getHash(filePath, 5);
    const result = await editTool.execute("test-id", {
      file_path: filePath,
      operations: [{ op: "delete_range", start_hash: aHash, end_hash: dHash }],
    });
    expect(result.details?.error).toBeUndefined();
    expect(readFile(filePath)).toBe("");
  });

  it("should auto-resolve range op with duplicate end_hash (first match)", async () => {
    const filePath = createTempFile("b\na\nc\na\nd");
    const bHash = getHash(filePath, 1);
    const aHash = computeLineHash("a");
    const result = await editTool.execute("test-id", {
      file_path: filePath,
      operations: [{ op: "replace_range", start_hash: bHash, end_hash: aHash, content: "X" }],
    });
    expect(result.details?.error).toBeUndefined();
    expect(readFile(filePath)).toBe("X\nc\na\nd");
  });

  it("should auto-resolve range with both endpoints identical content", async () => {
    const filePath = createTempFile("a\nb\na\nc\na");
    const aHash = computeLineHash("a");
    const result = await editTool.execute("test-id", {
      file_path: filePath,
      operations: [{ op: "delete_range", start_hash: aHash, end_hash: aHash }],
    });
    expect(result.details?.error).toBeUndefined();
    expect(readFile(filePath)).toBe("b\na\nc\na");
  });

  it("should return anchors_valid_through and must_refresh_from_line for middle edit", async () => {
    const filePath = createTempFile("line 1\nline 2\nline 3\nline 4\nline 5");
    const hash = getHash(filePath, 3);
    const result = await editTool.execute("test-id", {
      file_path: filePath,
      operations: [{ op: "replace_line", hash, content: "LINE THREE" }],
    });
    expect(result.details?.error).toBeUndefined();
    expect(result.details?.anchors_valid_through).toBe(2);
    expect(result.details?.must_refresh_from_line).toBe(3);
  });

  it("should return anchors_valid_through: 0 for edit at top of file", async () => {
    const filePath = createTempFile("line 1\nline 2\nline 3");
    const hash = getHash(filePath, 1);
    const result = await editTool.execute("test-id", {
      file_path: filePath,
      operations: [{ op: "insert_before", hash, content: "line 0" }],
    });
    expect(result.details?.error).toBeUndefined();
    expect(result.details?.anchors_valid_through).toBe(0);
    expect(result.details?.must_refresh_from_line).toBe(1);
  });

  it("should include stale anchor warning with line range in text", async () => {
    const filePath = createTempFile("line 1\nline 2\nline 3\nline 4");
    const hash = getHash(filePath, 2);
    const result = await editTool.execute("test-id", {
      file_path: filePath,
      operations: [{ op: "replace_line", hash, content: "LINE TWO" }],
    });
    const text = result.content?.[0]?.text ?? "";
    expect(text).toContain("Anchors valid through line: 1");
    expect(text).toContain("Refresh required from line: 2");
  });

  it("should return invalid_range_order for reversed range", async () => {
    const filePath = createTempFile("line 1\nline 2\nline 3");
    const hash3 = getHash(filePath, 3);
    const hash1 = getHash(filePath, 1);
    const result = await editTool.execute("test-id", {
      file_path: filePath,
      operations: [{ op: "replace_range", start_hash: hash3, end_hash: hash1, content: "x" }],
    });
    expect(result.details?.error).toBe("invalid_range_order");
    expect(result.details?.suggested_action).toBe("re-read_file");
    expect(result.details?.start_line).toBe(3);
    expect(result.details?.end_line).toBe(1);
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
