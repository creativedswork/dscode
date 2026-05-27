import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

import type { AgentTool } from "@mariozechner/pi-agent-core";
import { Type } from "@mariozechner/pi-ai";

// --- Hash utilities ---

/**
 * Compute a content-only hash for a line (v2 protocol).
 * The hash is based solely on the trimmed line content — NOT on the line number.
 * This ensures that upstream insertions/deletions do not invalidate anchors
 * for unchanged lines downstream.
 *
 * Line numbers are advisory (snapshot position) only, not authoritative identity.
 * This is anchor_format_version "v2" semantics.
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
 * All matching line numbers are stored; single-line operations must use
 * the `occurrence` field for disambiguation when hash is not unique.
 * Range operations require both endpoint hashes to be unique.
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
 * The current anchor protocol version.
 * Returned in read_file(hashes: true) details so agents can detect format changes.
 */
export const ANCHOR_FORMAT_VERSION = "v2";

/**
 * Format a line with its hashed anchor prefix (v2 format).
 * Format: lineNumber#hash|content
 * - lineNumber: snapshot position when read (advisory, not authoritative identity)
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
  occurrence: Type.Optional(Type.Number({ description: "When hash matches multiple lines, specifies which occurrence (1-indexed) to target. Omit if hash is unique." })),
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
  occurrence: Type.Optional(Type.Number({ description: "When hash matches multiple lines, specifies which occurrence (1-indexed) to target. Omit if hash is unique." })),
});

const InsertBeforeOp = Type.Object({
  op: Type.Literal("insert_before"),
  hash: Type.String({ description: "Hash of the line to insert before" }),
  content: Type.String({ description: "Content to insert (use \\n for multiple lines)" }),
  occurrence: Type.Optional(Type.Number({ description: "When hash matches multiple lines, specifies which occurrence (1-indexed) to target. Omit if hash is unique." })),
});

const DeleteLineOp = Type.Object({
  op: Type.Literal("delete_line"),
  hash: Type.String({ description: "Hash of the line to delete" }),
  occurrence: Type.Optional(Type.Number({ description: "When hash matches multiple lines, specifies which occurrence (1-indexed) to target. Omit if hash is unique." })),
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
  | { op: "replace_line"; hash: string; content: string; occurrence?: number }
  | { op: "replace_range"; start_hash: string; end_hash: string; content: string }
  | { op: "insert_after"; hash: string; content: string; occurrence?: number }
  | { op: "insert_before"; hash: string; content: string; occurrence?: number }
  | { op: "delete_line"; hash: string; occurrence?: number }
  | { op: "delete_range"; start_hash: string; end_hash: string };

const editParams = Type.Object({
  file_path: Type.String({ description: "Absolute path of the file to edit" }),
  operations: Type.Array(EditOperation, { description: "Ordered list of edit operations to apply" }),
});

// --- Validation ---

type SingleLineOp = Extract<EditOperation, { op: "replace_line" | "insert_after" | "insert_before" | "delete_line" }>;
type RangeOp = Extract<EditOperation, { op: "replace_range" | "delete_range" }>;

function isSingleLineOp(op: EditOperation): op is SingleLineOp {
  return op.op === "replace_line" || op.op === "insert_after" || op.op === "insert_before" || op.op === "delete_line";
}

function isRangeOp(op: EditOperation): op is RangeOp {
  return op.op === "replace_range" || op.op === "delete_range";
}

interface AmbiguousAnchor {
  hash: string;
  candidates: number[];
}

interface ValidationResult {
  valid: boolean;
  error?: string;
  missingHashes?: string[];
  ambiguousAnchors?: AmbiguousAnchor[];
  suggested_action?: string;
  invalidRangeOrder?: { startLine: number; endLine: number };
}

function validateOperations(ops: EditOperation[], hashMap: Map<string, number[]>): ValidationResult {
  const missingHashes: string[] = [];
  const ambiguousAnchors: AmbiguousAnchor[] = [];
  const seen = new Set<string>();

  for (const op of ops) {
    if (isRangeOp(op)) {
      // Range operations: both endpoints must exist and be unique
      for (const hash of [op.start_hash, op.end_hash]) {
        if (seen.has(hash)) continue;
        seen.add(hash);
        const matches = hashMap.get(hash);
        if (!matches || matches.length === 0) {
          missingHashes.push(hash);
        } else if (matches.length > 1) {
          // Range ops never support occurrence — ambiguity means reject
          ambiguousAnchors.push({ hash, candidates: matches });
        }
      }
      // Check range order
      const startMatches = hashMap.get(op.start_hash);
      const endMatches = hashMap.get(op.end_hash);
      if (startMatches && startMatches.length === 1 && endMatches && endMatches.length === 1) {
        if (startMatches[0] > endMatches[0]) {
          return {
            valid: false,
            error: "invalid_range_order",
            invalidRangeOrder: { startLine: startMatches[0], endLine: endMatches[0] },
            suggested_action: "re-read_file",
          };
        }
      }
    } else if (isSingleLineOp(op)) {
      const hash = op.hash;
      if (seen.has(hash)) continue;
      seen.add(hash);
      const matches = hashMap.get(hash);
      if (!matches || matches.length === 0) {
        missingHashes.push(hash);
      } else if (matches.length > 1 && (!op.occurrence || op.occurrence < 1 || op.occurrence > matches.length)) {
        ambiguousAnchors.push({ hash, candidates: matches });
      }
    }
  }

  if (missingHashes.length > 0) {
    return {
      valid: false,
      error: "anchor_stale",
      missingHashes,
      suggested_action: "re-read_file",
    };
  }

  if (ambiguousAnchors.length > 0) {
    return {
      valid: false,
      error: "anchor_ambiguous",
      ambiguousAnchors,
      suggested_action: "re-read_with_context",
    };
  }

  return { valid: true };
}

// --- Apply operations ---

/**
 * Resolve the target line number for a single-line operation.
 * Uses `occurrence` if provided (1-indexed), otherwise defaults to 1 (first match).
 * Caller must have already validated that occurrence is within range via validateOperations.
 */
function resolveSingleLineTarget(
  lineNums: number[],
  occurrence?: number,
): number {
  if (occurrence !== undefined && occurrence >= 1 && occurrence <= lineNums.length) {
    return lineNums[occurrence - 1];
  }
  return lineNums[0];
}

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
        const lineNum = resolveSingleLineTarget(lineNums, op.occurrence);
        const idx = lineNum - 1;
        result[idx] = op.content;
        break;
      }
      case "replace_range": {
        const startNums = hashMap.get(op.start_hash)!;
        const endNums = hashMap.get(op.end_hash)!;
        const startLine = startNums[0];
        const endLine = endNums[0];
        const startIdx = startLine - 1;
        const endIdx = endLine - 1;
        const newLines = op.content.split("\n");
        result.splice(startIdx, endIdx - startIdx + 1, ...newLines);
        break;
      }
      case "insert_after": {
        const lineNums = hashMap.get(op.hash)!;
        const lineNum = resolveSingleLineTarget(lineNums, op.occurrence);
        const idx = lineNum;
        const newLines = op.content.split("\n");
        result.splice(idx, 0, ...newLines);
        break;
      }
      case "insert_before": {
        const lineNums = hashMap.get(op.hash)!;
        const lineNum = resolveSingleLineTarget(lineNums, op.occurrence);
        const idx = lineNum - 1;
        const newLines = op.content.split("\n");
        result.splice(idx, 0, ...newLines);
        break;
      }
      case "delete_line": {
        const lineNums = hashMap.get(op.hash)!;
        const lineNum = resolveSingleLineTarget(lineNums, op.occurrence);
        const idx = lineNum - 1;
        result.splice(idx, 1);
        break;
      }
      case "delete_range": {
        const startNums = hashMap.get(op.start_hash)!;
        const endNums = hashMap.get(op.end_hash)!;
        const startLine = startNums[0];
        const endLine = endNums[0];
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
 * Compute the affected line range from a set of operations.
 * Returns [minLine, maxLine] for the affected region (1-indexed, inclusive).
 */
function computeAffectedRange(
  ops: EditOperation[],
  hashMap: Map<string, number[]>,
): { minLine: number; maxLine: number } {
  let minLine = Infinity;
  let maxLine = 0;

  for (const op of ops) {
    switch (op.op) {
      case "replace_line":
      case "insert_after":
      case "insert_before":
      case "delete_line": {
        const nums = hashMap.get(op.hash);
        if (nums && nums.length > 0) {
          const lineNum = resolveSingleLineTarget(nums, op.occurrence);
          minLine = Math.min(minLine, lineNum);
          maxLine = Math.max(maxLine, lineNum);
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

  return { minLine: minLine === Infinity ? 0 : minLine, maxLine };
}

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
  const { minLine, maxLine } = computeAffectedRange(ops, hashMap);

  if (minLine > maxLine || minLine === 0) return "";

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
    "Line numbers in anchors are advisory (snapshot position); hashes are content-based identity (the guard material). " +
    "Operations: replace_line, replace_range, insert_after, insert_before, delete_line, delete_range. " +
    "All operations in a single call are applied atomically against the same initial file snapshot — " +
    "later operations within the batch do NOT see the results of earlier operations. " +
    "If any hash is invalid, ambiguous, or out of order, the entire batch is rejected and no changes are made. " +
    "For duplicate-content lines, use the `occurrence` field (1-indexed) to specify which matching line to target. " +
    "Range operations (replace_range, delete_range) require both endpoint hashes to be unique and will be rejected if ambiguous. " +
    "Example: { op: \"replace_line\", hash: \"a1b2\", content: \"new line content\" }",
  parameters: editParams,
  execute: async (_id, { file_path, operations }) => {
    const resolved = resolve(file_path);

    if (!existsSync(resolved)) {
      return {
        content: [{ type: "text", text: `Error: file not found: ${resolved}` }],
        details: { error: "not_found", suggested_action: "check_path" },
      };
    }

    if (!operations || operations.length === 0) {
      return {
        content: [{ type: "text", text: "Error: no operations provided" }],
        details: { error: "empty_operations", suggested_action: "provide_at_least_one_operation" },
      };
    }

    const raw = readFileSync(resolved, "utf8");
    const lines = raw.split("\n");
    const hashMap = hashLines(lines);

    const validation = validateOperations(operations, hashMap);
    if (!validation.valid) {
      if (validation.error === "anchor_ambiguous") {
        const ambDetails = validation.ambiguousAnchors!.map(a =>
          `  hash "${a.hash}" matches lines [${a.candidates.join(", ")}]`
        ).join("\n");
        return {
          content: [
            {
              type: "text",
              text:
                `Edit rejected: ambiguous anchors detected.\n` +
                `${ambDetails}\n` +
                `Hint: for single-line operations, add the "occurrence" field (1-indexed) to specify which matching line.\n` +
                `For range operations, re-read the file and use more specific anchors, or use single-line operations instead.`,
            },
          ],
          details: {
            error: "anchor_ambiguous",
            ambiguous_anchors: validation.ambiguousAnchors,
            suggested_action: "re-read_with_context",
          },
        };
      }

      if (validation.error === "invalid_range_order") {
        const ro = validation.invalidRangeOrder!;
        return {
          content: [
            {
              type: "text",
              text:
                `Edit rejected: invalid range order.\n` +
                `Start line ${ro.startLine} is after end line ${ro.endLine}.\n` +
                `Hint: swap start_hash and end_hash, or re-read the file for correct anchors.`,
            },
          ],
          details: {
            error: "invalid_range_order",
            start_line: ro.startLine,
            end_line: ro.endLine,
            suggested_action: "re-read_file",
          },
        };
      }

      // anchor_stale (default)
      return {
        content: [
          {
            type: "text",
            text:
              `Edit rejected: file has changed since last read or anchors are invalid.\n` +
              `Missing anchors: [${validation.missingHashes!.join(", ")}]\n` +
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

    // Compute affected range BEFORE applying (uses pre-edit hashMap)
    const { minLine: affectedMinLine } = computeAffectedRange(operations, hashMap);

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
        details: { error: "apply_failed", message: err.message, suggested_action: "re-read_file" },
      };
    }

    const newContent = resultLines.join("\n");
    writeFileSync(resolved, newContent);

    // Compute new file version and localized diff
    const newFileVersion = computeFileVersion(newContent);
    const localDiff = generateLocalDiff(lines, resultLines, operations, hashMap);

    // Compute invalidation contract
    const mustRefreshFromLine = affectedMinLine > 0 ? affectedMinLine : 1;
    const anchorsValidThrough = mustRefreshFromLine - 1;

    const opsCount = operations.length;
    const netChange = resultLines.length - lines.length;
    const addedLines = Math.max(0, netChange);
    const removedLines = Math.max(0, -netChange);

    const summaryParts: string[] = [
      `${opsCount} operation(s) applied to ${resolved}.`,
      `Lines: ${lines.length} → ${resultLines.length} ${netChange > 0 ? `(+${netChange})` : netChange < 0 ? `(${netChange})` : "(unchanged)"}`,
      `New file version: ${newFileVersion}`,
      `Anchors valid through line: ${anchorsValidThrough}. Refresh required from line: ${mustRefreshFromLine}.`,
    ];

    if (localDiff) {
      summaryParts.push(`\nLocal diff (with new anchors):\n${localDiff}`);
    }

    if (mustRefreshFromLine > 1) {
      summaryParts.push(
        `\nNote: anchors for lines 1-${anchorsValidThrough} remain valid. ` +
        `Anchors at line ${mustRefreshFromLine} and beyond are stale — re-read if you need to edit those regions.`
      );
    } else {
      summaryParts.push(
        "\nNote: all anchors are now stale. Re-read the file to get new anchors before further edits."
      );
    }

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
        anchors_valid_through: anchorsValidThrough,
        must_refresh_from_line: mustRefreshFromLine,
      },
    };
  },
};
