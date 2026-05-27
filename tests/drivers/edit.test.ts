import { describe, it, expect } from "vitest";
import { readFileSync, writeFileSync, unlinkSync, existsSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  computeLineHash,
  computeFileVersion,
  hashLines,
  formatHashedLine,
  editTool,
} from "../../src/drivers/edit.js";

// --- computeLineHash (content-only, no line number) ---

describe("computeLineHash", () => {
  it("should produce deterministic output for same input", () => {
    const h1 = computeLineHash("function hello() {");
    const h2 = computeLineHash("function hello() {");
    expect(h1).toBe(h2);
  });

  it("should produce 4-character hex string", () => {
    const hash = computeLineHash("some line content");
    expect(hash).toMatch(/^[0-9a-f]{4}$/);
  });

  it("should produce same hash for same content regardless of position", () => {
    // Content-only hash: same content → same hash (position is advisory, not identity)
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

// --- hashLines ---

describe("hashLines", () => {
  it("should build a hash-to-linenumbers map (content-only)", () => {
    const lines = ["line one", "line two", "line three"];
    const map = hashLines(lines);
    expect(map.size).toBe(3);
    for (let i = 0; i < lines.length; i++) {
      const hash = computeLineHash(lines[i]);
      const nums = map.get(hash);
      expect(nums).toBeDefined();
      expect(nums).toContain(i + 1);
    }
  });

  it("should group duplicate content under same hash", () => {
    const lines = ["a", "b", "a"];
    const map = hashLines(lines);
    expect(map.size).toBe(2); // only "a" and "b"
    const aHash = computeLineHash("a");
    const aNums = map.get(aHash);
    expect(aNums).toEqual([1, 3]); // both line 1 and line 3
  });

  it("should handle empty array", () => {
    const map = hashLines([]);
    expect(map.size).toBe(0);
  });

  it("should handle single line", () => {
    const map = hashLines(["only line"]);
    expect(map.size).toBe(1);
    const hash = computeLineHash("only line");
    expect(map.get(hash)).toEqual([1]);
  });
});

// --- formatHashedLine (now uses # separator) ---

describe("formatHashedLine", () => {
  it("should format line with # anchor prefix", () => {
    const result = formatHashedLine(1, "a1b2", "function hello() {");
    expect(result).toBe("1#a1b2|function hello() {");
  });

  it("should handle empty content", () => {
    const result = formatHashedLine(3, "c3d4", "");
    expect(result).toBe("3#c3d4|");
  });
});

// --- editTool ---

describe("editTool", () => {
  let tmpDir: string;

  function createTempFile(content: string): string {
    const filePath = join(tmpDir, `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.txt`);
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

  // setup: create temp dir before each
  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "dscode-edit-test-"));
  });

  // cleanup is handled by OS temp cleanup

  // --- replace_line ---

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

  // --- replace_range ---

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

  // --- insert_after ---

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

  // --- insert_before ---

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

  // --- delete_line ---

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

  // --- delete_range ---

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

  // --- error: anchor stale ---

  it("should reject when hash not found (anchor_stale)", async () => {
    const filePath = createTempFile("line 1\nline 2\nline 3");

    const result = await editTool.execute("test-id", {
      file_path: filePath,
      operations: [{ op: "replace_line", hash: "ffff", content: "should not apply" }],
    });

    expect(result.details?.error).toBe("anchor_stale");
    expect(result.details?.missingHashes).toContain("ffff");
    expect(result.details?.suggested_action).toBe("re-read_file");
    // File should be unchanged
    expect(readFile(filePath)).toBe("line 1\nline 2\nline 3");
  });

  // --- error: file not found ---

  it("should return error for nonexistent file", async () => {
    const result = await editTool.execute("test-id", {
      file_path: "/nonexistent/path/file.txt",
      operations: [{ op: "replace_line", hash: "a1b2", content: "x" }],
    });

    expect(result.details?.error).toBe("not_found");
  });

  // --- error: empty operations ---

  it("should return error for empty operations", async () => {
    const filePath = createTempFile("content");

    const result = await editTool.execute("test-id", {
      file_path: filePath,
      operations: [],
    });

    expect(result.details?.error).toBe("empty_operations");
  });

  // --- batch atomicity ---

  it("should reject entire batch if any hash is invalid", async () => {
    const filePath = createTempFile("line 1\nline 2\nline 3");
    const validHash = getHash(filePath, 1);

    const result = await editTool.execute("test-id", {
      file_path: filePath,
      operations: [
        { op: "replace_line", hash: validHash, content: "new line 1" },
        { op: "replace_line", hash: "ffff", content: "should not apply" },
      ],
    });

    expect(result.details?.error).toBe("anchor_stale");
    // File should be unchanged — atomic rejection
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
    // line 1 replaced, original line 3 deleted (which is now line 3 in new file)
    // Operations use initial hashMap - so hash3 maps to original line 3
    expect(readFile(filePath)).toBe("LINE ONE\nline 2\nline 4");
  });

  // --- anchors survive upstream changes ---

  it("should keep downstream anchors valid after upstream edit", async () => {
    // Content-only hash: downstream anchors stay valid even after upstream changes
    const filePath = createTempFile("line 1\nline 2\nline 3\nline 4\nline 5");
    const hash5 = getHash(filePath, 5); // hash for "line 5"

    // First edit: insert a line at the top
    await editTool.execute("test-id", {
      file_path: filePath,
      operations: [{ op: "insert_before", hash: getHash(filePath, 1), content: "line 0" }],
    });

    // Second edit: edit what was originally line 5 (now line 6).
    // With content-only hash, the anchor should still be valid
    // even though the line number shifted from 5 to 6.
    const result = await editTool.execute("test-id", {
      file_path: filePath,
      operations: [{ op: "replace_line", hash: hash5, content: "LINE FIVE" }],
    });

    expect(result.details?.error).toBeUndefined();
    expect(readFile(filePath)).toBe("line 0\nline 1\nline 2\nline 3\nline 4\nLINE FIVE");
  });

  // --- return summary with file_version and local diff ---

  it("should return operation summary with file_version and local diff", async () => {
    const filePath = createTempFile("line 1\nline 2\nline 3");

    const result = await editTool.execute("test-id", {
      file_path: filePath,
      operations: [
        { op: "insert_after", hash: getHash(filePath, 3), content: "line 4\nline 5" },
      ],
    });

    expect(result.details?.operations).toBe(1);
    expect(result.details?.linesBefore).toBe(3);
    expect(result.details?.linesAfter).toBe(5);
    expect(result.details?.addedLines).toBe(2);
    expect(result.details?.removedLines).toBe(0);
    expect(result.details?.file_version).toBeDefined();
    expect(result.details?.file_version).toMatch(/^fv_[0-9a-f]{8}$/);

    // Content should include local diff
    const text = result.content?.[0]?.text ?? "";
    expect(text).toContain("New file version");
    expect(text).toContain("Local diff");
    expect(text).toContain("--- file");
    expect(text).toContain("+++ file");
  });
});
