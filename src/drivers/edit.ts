import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

import type { AgentTool } from "@mariozechner/pi-agent-core";
import { Type } from "@mariozechner/pi-ai";

// --- Hash utilities ---

/**
 * Compute a content-only hash for a line.
 * The hash is based solely on the trimmed line content — NOT on the line number.
 * This ensures that upstream insertions/deletions do not invalidate anchors
 * for unchanged lines downstream.
 *
 * Line numbers are advisory (snapshot position) only, not authoritative identity.
 */
export function computeLineHash(line: string): string {
  return createHash("md5").update(line.trim()).digest("hex").slice(0, 4);
}

/**
 * Compute a file-level version hash for stale-state protection on write_file.
 */
export function computeFileVersion(content: string): string {
  return "fv_" + createHash("sha256").update(content).digest("hex").slice(0, 8);
}

/**
 * Build a hash → line-number[] map from file lines.
 * Since hash is content-only, identical lines share the same hash.
 * All matching line numbers are stored; single-line operations use the first match.
 * For disambiguation of duplicate-content lines, prefer range operations.
 */
export function hashLines(lines: string[]): Map<string, number[]> {
  const map = new Map<string, number[]>();
  for (let i = 0; i < lines.length; i++) {
    const hash = computeLineHash(lines[i]);
    const existing = map.get(hash);
    if (existing) {
      existing.push(i + 1);
    } else {
      map.set(hash, [i + 1]);
    }
  }
  return map;
}

/**
 * Build a hash → line-number map, keeping only the first occurrence for each hash.
 * Used for quick single-line lookups where disambiguation is not critical.
 */
export function hashLinesUnique(lines: string[]): Map<string, number> {
  const map = new Map<string, number>();
  for (let i = 0; i < lines.length; i++) {
    const hash = computeLineHash(lines[i]);
    if (!map.has(hash)) {
      map.set(hash, i + 1);
    }
  }
  return map;
}

/**
 * Format a line with its hashed anchor prefix.
 * Format: lineNumber#hash|content
 * - lineNumber: snapshot position when read (advisory, not authoritative)
 * - hash: content-based identity (authoritative for edit targeting)
 */
export function formatHashedLine(lineNumber: number, hash: string, content: string): string {
  return `${lineNumber}#${hash}|${content}`;
}

// --- Edit operation types ---

const ReplaceLineOp = Type.Object({
  op: Type.Literal("replace_line"),
  hash: Type.String({ description: "Hash of the line to replace" }),
  content: Type.String({ description: "New content for the line" }),
});

const ReplaceRangeOp = Type.Object({
  op: Type.Literal("replace_range"),
  start_hash: Type.String({ description: "Hash of the first line in the range" }),
  end_hash: Type.String({ description: "Hash of the last line in the range" }),
  content: Type.String({ description: "New content replacing the entire range" }),
});

const InsertAfterOp = Type.Object({
  op: Type.Literal("insert_after"),
  hash: Type.String({ description: "Hash of the line to insert after" }),
  content: Type.String({ description: "Content to insert (use \\n for multiple lines)" }),
});

const InsertBeforeOp = Type.Object({
  op: Type.Literal("insert_before"),
  hash: Type.String({ description: "Hash of the line to insert before" }),
  content: Type.String({ description: "Content to insert (use \\n for multiple lines)" }),
});

const DeleteLineOp = Type.Object({
  op: Type.Literal("delete_line"),
  hash: Type.String({ description: "Hash of the line to delete" }),
});

const DeleteRangeOp = Type.Object({
  op: Type.Literal("delete_range"),
  start_hash: Type.String({ description: "Hash of the first line in the range" }),
  end_hash: Type.String({ description: "Hash of the last line in the range" }),
});

const EditOperation = Type.Union([
  ReplaceLineOp,
  ReplaceRangeOp,
  InsertAfterOp,
  InsertBeforeOp,
  DeleteLineOp,
  DeleteRangeOp,
]);

export type EditOperation =
  | { op: "replace_line"; hash: string; content: string }
  | { op: "replace_range"; start_hash: string; end_hash: string; content: string }
  | { op: "insert_after"; hash: string; content: string }
  | { op: "insert_before"; hash: string; content: string }
  | { op: "delete_line"; hash: string }
  | { op: "delete_range"; start_hash: string; end_hash: string };

const editParams = Type.Object({
  file_path: Type.String({ description: "Absolute path of the file to edit" }),
  operations: Type.Array(EditOperation, { description: "Ordered list of edit operations to apply" }),
});

// --- Validation ---

interface ValidationResult {
  valid: boolean;
  missingHashes: string[];
}

function collectOpHashes(op: EditOperation): string[] {
  switch (op.op) {
    case "replace_line":
    case "insert_after":
    case "insert_before":
    case "delete_line":
      return [op.hash];
    case "replace_range":
    case "delete_range":
      return [op.start_hash, op.end_hash];
  }
}

function validateHashes(ops: EditOperation[], hashMap: Map<string, number[]>): ValidationResult {
  const missingHashes: string[] = [];
  const seen = new Set<string>();

  for (const op of ops) {
    for (const hash of collectOpHashes(op)) {
      if (seen.has(hash)) continue;
      seen.add(hash);
      const matches = hashMap.get(hash);
      if (!matches || matches.length === 0) {
        missingHashes.push(hash);
      }
    }
  }

  return { valid: missingHashes.length === 0, missingHashes };
}

// --- Apply operations ---

function applyEditOperations(
  lines: string[],
  ops: EditOperation[],
  hashMap: Map<string, number[]>,
): string[] {
  let result = [...lines];

  for (const op of ops) {
    switch (op.op) {
      case "replace_line": {
        const lineNums = hashMap.get(op.hash)!;
        // Use first matching line for single-line operations
        const lineNum = lineNums[0];
        const idx = lineNum - 1;
        result[idx] = op.content;
        break;
      }
      case "replace_range": {
        const startNums = hashMap.get(op.start_hash)!;
        const endNums = hashMap.get(op.end_hash)!;
        const startLine = startNums[0];
        const endLine = endNums[0];
        if (startLine > endLine) {
          throw new Error(
            `Invalid range: start line ${startLine} is after end line ${endLine}`
          );
        }
        const startIdx = startLine - 1;
        const endIdx = endLine - 1;
        const newLines = op.content.split("\n");
        result.splice(startIdx, endIdx - startIdx + 1, ...newLines);
        break;
      }
      case "insert_after": {
        const lineNums = hashMap.get(op.hash)!;
        const lineNum = lineNums[0];
        const idx = lineNum;
        const newLines = op.content.split("\n");
        result.splice(idx, 0, ...newLines);
        break;
      }
      case "insert_before": {
        const lineNums = hashMap.get(op.hash)!;
        const lineNum = lineNums[0];
        const idx = lineNum - 1;
        const newLines = op.content.split("\n");
        result.splice(idx, 0, ...newLines);
        break;
      }
      case "delete_line": {
        const lineNums = hashMap.get(op.hash)!;
        const lineNum = lineNums[0];
        const idx = lineNum - 1;
        result.splice(idx, 1);
        break;
      }
      case "delete_range": {
        const startNums = hashMap.get(op.start_hash)!;
        const endNums = hashMap.get(op.end_hash)!;
        const startLine = startNums[0];
        const endLine = endNums[0];
        if (startLine > endLine) {
          throw new Error(
            `Invalid range: start line ${startLine} is after end line ${endLine}`
          );
        }
        const startIdx = startLine - 1;
        const endIdx = endLine - 1;
        result.splice(startIdx, endIdx - startIdx + 1);
        break;
      }
    }
  }

  return result;
}

// --- Diff context helpers ---

/**
 * Generate a localized hashed diff showing the changed region with new anchors.
 * Includes N lines of context before and after the change.
 */
function generateLocalDiff(
  oldLines: string[],
  newLines: string[],
  ops: EditOperation[],
  hashMap: Map<string, number[]>,
): string {
  // Find the affected line range from the operations
  let minLine = oldLines.length + 1;
  let maxLine = 0;

  for (const op of ops) {
    switch (op.op) {
      case "replace_line":
      case "insert_after":
      case "insert_before":
      case "delete_line": {
        const nums = hashMap.get(op.hash);
        if (nums && nums.length > 0) {
          minLine = Math.min(minLine, nums[0]);
          maxLine = Math.max(maxLine, nums[0]);
        }
        break;
      }
      case "replace_range":
      case "delete_range": {
        const sNums = hashMap.get(op.start_hash);
        const eNums = hashMap.get(op.end_hash);
        if (sNums && sNums.length > 0) minLine = Math.min(minLine, sNums[0]);
        if (eNums && eNums.length > 0) maxLine = Math.max(maxLine, eNums[0]);
        break;
      }
    }
  }

  if (minLine > maxLine) return "";

  // Context window: 3 lines before and after the affected region
  const contextBefore = 3;
  const contextAfter = 3;
  const ctxStart = Math.max(0, minLine - 1 - contextBefore);
  const ctxEnd = Math.min(newLines.length, maxLine + contextAfter);

  const parts: string[] = [];
  parts.push("--- file");
  parts.push("+++ file");

  for (let i = ctxStart; i < ctxEnd; i++) {
    const lineNum = i + 1;
    const newHash = computeLineHash(newLines[i]);
    const formatted = formatHashedLine(lineNum, newHash, newLines[i]);

    // Check if this line is in the affected range
    const isInOld = i < oldLines.length;
    const oldLineNum = i + 1;
    const inRange = oldLineNum >= minLine && oldLineNum <= maxLine;

    if (inRange && isInOld) {
      const oldHash = computeLineHash(oldLines[i]);
      parts.push(`-${formatHashedLine(oldLineNum, oldHash, oldLines[i])}`);
      if (newLines[i] !== oldLines[i]) {
        parts.push(`+${formatted}`);
      } else {
        parts.push(` ${formatted}`);
      }
    } else if (!isInOld) {
      parts.push(`+${formatted}`);
    } else {
      parts.push(` ${formatted}`);
    }
  }

  if (ctxEnd < newLines.length) {
    parts.push(`... (${newLines.length - ctxEnd} more lines after)`);
  }

  return parts.join("\n");
}


// --- AgentTool ---

export const editTool: AgentTool<typeof editParams> = {
  name: "edit",
  label: "Edit file (preferred over shell commands)",
  description:
    "【PREFERRED】Use this tool for ALL file editing — do NOT use bash/sed/awk for file modifications. " +
    "Edit a file using content-based hash anchors. " +
    "First read the file with read_file(hashes: true) to get line hashes (format: lineNum#hash|content), " +
    "then use this tool to make precise changes. " +
    "Line numbers in anchors are advisory (snapshot position); hashes are content-based identity. " +
    "Operations: replace_line, replace_range, insert_after, insert_before, delete_line, delete_range. " +
    "All operations in a single call are applied atomically — if any hash is invalid, no changes are made. " +
    "For duplicate-content lines, use range operations for disambiguation. " +
    "Example: { op: \"replace_line\", hash: \"a1b2\", content: \"new line content\" }",
  parameters: editParams,
  execute: async (_id, { file_path, operations }) => {
    const resolved = resolve(file_path);

    if (!existsSync(resolved)) {
      return {
        content: [{ type: "text", text: `Error: file not found: ${resolved}` }],
        details: { error: "not_found" },
      };
    }

    if (!operations || operations.length === 0) {
      return {
        content: [{ type: "text", text: "Error: no operations provided" }],
        details: { error: "empty_operations" },
      };
    }

    const raw = readFileSync(resolved, "utf8");
    const lines = raw.split("\n");
    const hashMap = hashLines(lines);

    const validation = validateHashes(operations, hashMap);
    if (!validation.valid) {
      return {
        content: [
          {
            type: "text",
            text:
              `Edit rejected: file has changed since last read or anchors are invalid.\n` +
              `Missing anchors: [${validation.missingHashes.join(", ")}]\n` +
              `Hint: re-read the file with read_file(hashes: true) to get current anchors and retry.`,
          },
        ],
        details: {
          error: "anchor_stale",
          missingHashes: validation.missingHashes,
          suggested_action: "re-read_file",
        },
      };
    }

    let resultLines: string[];
    try {
      resultLines = applyEditOperations(lines, operations, hashMap);
    } catch (err: any) {
      return {
        content: [
          {
            type: "text",
            text: `Edit failed: ${err.message ?? String(err)}`,
          },
        ],
        details: { error: "apply_failed", message: err.message },
      };
    }

    const newContent = resultLines.join("\n");
    writeFileSync(resolved, newContent);

    // Compute new file version and localized diff
    const newFileVersion = computeFileVersion(newContent);
    const localDiff = generateLocalDiff(lines, resultLines, operations, hashMap);

    const opsCount = operations.length;
    const netChange = resultLines.length - lines.length;
    const addedLines = Math.max(0, netChange);
    const removedLines = Math.max(0, -netChange);

    const summaryParts: string[] = [
      `${opsCount} operation(s) applied to ${resolved}.`,
      `Lines: ${lines.length} → ${resultLines.length} ${netChange > 0 ? `(+${netChange})` : netChange < 0 ? `(${netChange})` : "(unchanged)"}`,
      `New file version: ${newFileVersion}`,
    ];

    if (localDiff) {
      summaryParts.push(`\nLocal diff (with new anchors):\n${localDiff}`);
    }

    summaryParts.push(
      "\nNote: anchors outside the displayed diff may be stale. Re-read if you need to edit other regions."
    );

    return {
      content: [
        {
          type: "text",
          text: summaryParts.join("\n"),
        },
      ],
      details: {
        operations: opsCount,
        linesBefore: lines.length,
        linesAfter: resultLines.length,
        addedLines,
        removedLines,
        file_version: newFileVersion,
      },
    };
  },
};
