import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

import type { AgentTool } from "@mariozechner/pi-agent-core";
import { Type } from "@mariozechner/pi-ai";

// --- Hash utilities ---

export function computeLineHash(line: string, lineNumber: number): string {
  const input = `${line.trim()}|${lineNumber}`;
  return createHash("md5").update(input).digest("hex").slice(0, 4);
}

export function hashLines(lines: string[]): Map<string, number> {
  const map = new Map<string, number>();
  for (let i = 0; i < lines.length; i++) {
    const hash = computeLineHash(lines[i], i + 1);
    const existing = map.get(hash);
    if (existing !== undefined) {
      throw new Error(
        `Hash collision: lines ${existing} and ${i + 1} both produce hash "${hash}"`
      );
    }
    map.set(hash, i + 1);
  }
  return map;
}

export function formatHashedLine(lineNumber: number, hash: string, content: string): string {
  return `${lineNumber}:${hash}|${content}`;
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

function validateHashes(ops: EditOperation[], hashMap: Map<string, number>): ValidationResult {
  const missingHashes: string[] = [];
  const seen = new Set<string>();

  for (const op of ops) {
    for (const hash of collectOpHashes(op)) {
      if (seen.has(hash)) continue;
      seen.add(hash);
      if (!hashMap.has(hash)) {
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
  hashMap: Map<string, number>,
): string[] {
  let result = [...lines];

  for (const op of ops) {
    switch (op.op) {
      case "replace_line": {
        const lineNum = hashMap.get(op.hash)!;
        const idx = lineNum - 1;
        result[idx] = op.content;
        break;
      }
      case "replace_range": {
        const startLine = hashMap.get(op.start_hash)!;
        const endLine = hashMap.get(op.end_hash)!;
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
        const lineNum = hashMap.get(op.hash)!;
        const idx = lineNum;
        const newLines = op.content.split("\n");
        result.splice(idx, 0, ...newLines);
        break;
      }
      case "insert_before": {
        const lineNum = hashMap.get(op.hash)!;
        const idx = lineNum - 1;
        const newLines = op.content.split("\n");
        result.splice(idx, 0, ...newLines);
        break;
      }
      case "delete_line": {
        const lineNum = hashMap.get(op.hash)!;
        const idx = lineNum - 1;
        result.splice(idx, 1);
        break;
      }
      case "delete_range": {
        const startLine = hashMap.get(op.start_hash)!;
        const endLine = hashMap.get(op.end_hash)!;
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

// --- AgentTool ---

export const editTool: AgentTool<typeof editParams> = {
  name: "edit",
  label: "Edit file",
  description:
    "Edit a file using hash-based line references. " +
    "First read the file with read_file(hashes: true) to get line hashes, " +
    "then use this tool to make precise changes. " +
    "Operations: replace_line, replace_range, insert_after, insert_before, delete_line, delete_range. " +
    "All operations in a single call are applied atomically — if any hash is invalid, no changes are made. " +
    "Example: { op: \"replace_line\", hash: \"a1b2\", content: \"new line content\" }",
  parameters: editParams,
  executionMode: "sequential",
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
              `Edit rejected: file has changed since last read or hashes are invalid.\n` +
              `Missing hashes: [${validation.missingHashes.join(", ")}]\n` +
              `Hint: re-read the file with read_file(hashes: true) to get current hashes and retry.`,
          },
        ],
        details: { error: "hash_mismatch", missingHashes: validation.missingHashes },
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

    const opsCount = operations.length;
    const netChange = resultLines.length - lines.length;
    const addedLines = Math.max(0, netChange);
    const removedLines = Math.max(0, -netChange);
    return {
      content: [
        {
          type: "text",
          text:
            `${opsCount} operation(s) applied to ${resolved}.\n` +
            `Lines: ${lines.length} → ${resultLines.length} ` +
            `${netChange > 0 ? `(+${netChange})` : netChange < 0 ? `(${netChange})` : "(unchanged)"}`,
        },
      ],
      details: {
        operations: opsCount,
        linesBefore: lines.length,
        linesAfter: resultLines.length,
        addedLines,
        removedLines,
      },
    };
  },
};
