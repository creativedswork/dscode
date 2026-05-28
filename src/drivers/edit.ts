import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

import type { AgentTool } from "@mariozechner/pi-agent-core";
import { Type } from "@mariozechner/pi-ai";

// --- Hash utilities ---

/**
 * Compute a 6-character display hash for a line (v3 protocol).
 * Shown in read_file output and accepted as input by edit operations.
 * The hash is based solely on the trimmed line content — NOT on the line number.
 */
export function computeLineHash(line: string): string {
  return createHash("md5").update(line.trim()).digest("hex").slice(0, 6);
}

/**
 * Compute an 8-character resolution hash for internal disambiguation.
 * Used when the 6-char display hash matches multiple lines.
 */
export function computeResolutionHash(line: string): string {
  return createHash("md5").update(line.trim()).digest("hex").slice(0, 8);
}

/**
 * Compute a file-level version hash for stale-state protection on write_file.
 */
export function computeFileVersion(content: string): string {
  return "fv_" + createHash("sha256").update(content).digest("hex").slice(0, 8);
}

/**
 * Build a hash → line-number[] map from file lines using 8-char resolution hashes.
 * Also returns a displayHash → resolutionHash[] index for adaptive resolution.
 */
export function hashLines(lines: string[]): {
  resolutionMap: Map<string, number[]>;
  displayIndex: Map<string, string[]>;
} {
  const resolutionMap = new Map<string, number[]>();
  const displayIndex = new Map<string, string[]>();
  for (let i = 0; i < lines.length; i++) {
    const resHash = computeResolutionHash(lines[i]);
    const displayHash = resHash.slice(0, 6);
    const existing = resolutionMap.get(resHash);
    if (existing) {
      existing.push(i + 1);
    } else {
      resolutionMap.set(resHash, [i + 1]);
    }
    const displayEntries = displayIndex.get(displayHash);
    if (displayEntries) {
      if (!displayEntries.includes(resHash)) {
        displayEntries.push(resHash);
      }
    } else {
      displayIndex.set(displayHash, [resHash]);
    }
  }
  return { resolutionMap, displayIndex };
}

/**
 * Build a hash → line-number map, keeping only the first occurrence for each hash.
 * Uses 6-char display hash for quick single-line lookups.
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
 * v3: 6-char display hash + quality annotations.
 */
export const ANCHOR_FORMAT_VERSION = "v3";

/**
 * Format a line with its hashed anchor prefix (v3 format).
 * Format: lineNumber#hash [quality]|content
 */
export function formatHashedLine(lineNumber: number, hash: string, content: string, quality: string): string {
  return `${lineNumber}#${hash} [${quality}]|${content}`;
}

// --- Line quality classification ---

type LineQuality = "low" | "med" | "high";

const LOW_ENTROPY_PATTERN = /^[\s{}()\[\],;'"`]*$/;

function classifyLineQuality(line: string): "low" | "other" {
  const trimmed = line.trim();
  if (trimmed.length === 0) return "low";
  if (LOW_ENTROPY_PATTERN.test(trimmed)) return "low";
  return "other";
}

export function classifyLinesWithFrequency(lines: string[]): LineQuality[] {
  const freq = new Map<string, number>();
  for (const l of lines) {
    const hash = computeLineHash(l);
    freq.set(hash, (freq.get(hash) ?? 0) + 1);
  }
  return lines.map((l) => {
    const initial = classifyLineQuality(l);
    if (initial === "low") return "low";
    const count = freq.get(computeLineHash(l)) ?? 0;
    return count > 3 ? "med" : "high";
  });
}

// --- Context-augmented hash ---

function computeContextHash(lines: string[], lineIdx: number): string {
  const prev = findNonEmptyBefore(lines, lineIdx);
  const curr = lines[lineIdx].trim();
  const next = findNonEmptyAfter(lines, lineIdx);
  return createHash("md5").update(`${prev}\n${curr}\n${next}`).digest("hex").slice(0, 8);
}

function findNonEmptyBefore(lines: string[], idx: number): string {
  for (let i = idx - 1; i >= 0; i--) {
    if (lines[i].trim().length > 0) return lines[i].trim();
  }
  return "";
}

function findNonEmptyAfter(lines: string[], idx: number): string {
  for (let i = idx + 1; i < lines.length; i++) {
    if (lines[i].trim().length > 0) return lines[i].trim();
  }
  return "";
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

interface CandidateInfo {
  line: number;
  preview: string;
}

interface AmbiguousAnchor {
  hash: string;
  candidates: number[];
  candidatePreviews?: CandidateInfo[];
}

interface ValidationResult {
  valid: boolean;
  error?: string;
  missingHashes?: string[];
  ambiguousAnchors?: AmbiguousAnchor[];
  suggested_action?: string;
  invalidRangeOrder?: { startLine: number; endLine: number };
  lowEntropyAnchors?: { hash: string; line: number; content: string; neighborAnchors: string[] }[];
}

interface ResolutionContext {
  resolutionMap: Map<string, number[]>;
  displayIndex: Map<string, string[]>;
  lines: string[];
  qualities: LineQuality[];
  hashToQuality: Map<string, LineQuality>;
}

// --- Adaptive anchor resolution ---

interface ResolvedAnchor {
  lineNum: number;
  level: "display" | "resolution" | "context";
}

function resolveAnchor(
  displayHash: string,
  ctx: ResolutionContext,
  occurrence?: number,
): ResolvedAnchor | { error: string; candidates: CandidateInfo[] } {
  const resHashes = ctx.displayIndex.get(displayHash);

  // Step 1: display hash not found at all
  if (!resHashes || resHashes.length === 0) {
    return { error: "anchor_stale", candidates: [] };
  }

  // Step 2: display hash maps to exactly one resolution hash → unique
  if (resHashes.length === 1) {
    const lineNums = ctx.resolutionMap.get(resHashes[0])!;
    const lineNum = resolveSingleLineTarget(lineNums, occurrence);
    return { lineNum, level: "display" };
  }

  // Step 3: multiple resolution hashes — try occurrence disambiguation
  if (occurrence !== undefined) {
    const allLineNums: number[] = [];
    for (const rh of resHashes) {
      allLineNums.push(...(ctx.resolutionMap.get(rh) ?? []));
    }
    allLineNums.sort((a, b) => a - b);
    if (occurrence >= 1 && occurrence <= allLineNums.length) {
      return { lineNum: allLineNums[occurrence - 1], level: "context" };
    }
  }

  // Step 4: all disambiguation failed
  const candidates: CandidateInfo[] = [];
  for (const rh of resHashes) {
    const lineNums = ctx.resolutionMap.get(rh) ?? [];
    for (const ln of lineNums) {
      candidates.push({
        line: ln,
        preview: ctx.lines[ln - 1].trim().slice(0, 40),
      });
    }
  }

  // If only one candidate total across all resolution hashes, resolve to it
  if (candidates.length === 1) {
    return { lineNum: candidates[0].line, level: "resolution" };
  }

  return { error: "anchor_prefix_ambiguous", candidates };
}

function resolveSingleLineTarget(
  lineNums: number[],
  occurrence?: number,
): number {
  if (occurrence !== undefined && occurrence >= 1 && occurrence <= lineNums.length) {
    return lineNums[occurrence - 1];
  }
  return lineNums[0];
}

function computeNeighborAnchors(lineNum: number, ctx: ResolutionContext): string[] {
  const result: string[] = [];
  for (let offset = -3; offset <= 3; offset++) {
    if (offset === 0) continue;
    const idx = lineNum - 1 + offset;
    if (idx >= 0 && idx < ctx.lines.length && ctx.qualities[idx] === "high") {
      result.push(`${idx + 1}#${computeLineHash(ctx.lines[idx])}`);
    }
    if (result.length >= 6) break;
  }
  return result;
}

function validateOperations(
  ops: EditOperation[],
  ctx: ResolutionContext,
): ValidationResult {
  const missingHashes: string[] = [];
  const ambiguousAnchors: AmbiguousAnchor[] = [];
  const lowEntropyAnchors: { hash: string; line: number; content: string; neighborAnchors: string[] }[] = [];
  const resolvedMap = new Map<string, ResolvedAnchor>();

  for (const op of ops) {
    if (isRangeOp(op)) {
      for (const hash of [op.start_hash, op.end_hash]) {
        if (resolvedMap.has(hash)) continue;
        const result = resolveAnchor(hash, ctx);
        if ("error" in result) {
          if (result.error === "anchor_stale") {
            missingHashes.push(hash);
          } else {
            ambiguousAnchors.push({
              hash,
              candidates: result.candidates.map(c => c.line),
              candidatePreviews: result.candidates,
            });
          }
        } else {
          resolvedMap.set(hash, result);
        }
      }
      // Check range order
      const startRes = resolvedMap.get(op.start_hash);
      const endRes = resolvedMap.get(op.end_hash);
      if (startRes && "lineNum" in startRes && endRes && "lineNum" in endRes) {
        if (startRes.lineNum > endRes.lineNum) {
          return {
            valid: false,
            error: "invalid_range_order",
            invalidRangeOrder: { startLine: startRes.lineNum, endLine: endRes.lineNum },
            suggested_action: "re-read_file",
          };
        }
      }
    } else if (isSingleLineOp(op)) {
      const hash = op.hash;
      if (resolvedMap.has(hash)) continue;
      const result = resolveAnchor(hash, ctx, op.occurrence);
      if ("error" in result) {
        if (result.error === "anchor_stale") {
          missingHashes.push(hash);
        } else {
          ambiguousAnchors.push({
            hash,
            candidates: result.candidates.map(c => c.line),
            candidatePreviews: result.candidates,
          });
        }
      } else {
        resolvedMap.set(hash, result);
        // Check low-entropy for single-line ops
        const lineNum = result.lineNum;
        const quality = ctx.qualities[lineNum - 1];
        if (quality === "low") {
          lowEntropyAnchors.push({
            hash,
            line: lineNum,
            content: ctx.lines[lineNum - 1].trim(),
            neighborAnchors: computeNeighborAnchors(lineNum, ctx),
          });
        }
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

  if (lowEntropyAnchors.length > 0) {
    return {
      valid: false,
      error: "anchor_low_entropy",
      lowEntropyAnchors,
      suggested_action: "use_neighbor_anchor",
    };
  }

  if (ambiguousAnchors.length > 0) {
    const hasContextAmbig = ambiguousAnchors.some(a => a.candidatePreviews && a.candidatePreviews.length > 0);
    return {
      valid: false,
      error: hasContextAmbig ? "anchor_context_ambiguous" : "anchor_prefix_ambiguous",
      ambiguousAnchors,
      suggested_action: hasContextAmbig ? "re-read_with_context" : "use_context_anchor",
    };
  }

  // P0-3: detect overlapping operations in same batch
  if (ops.length > 1) {
    const ranges: { startLine: number; endLine: number }[] = [];
    for (const op of ops) {
      if (isSingleLineOp(op)) {
        const ln = resolvedMap.get(op.hash);
        if (ln && "lineNum" in ln) ranges.push({ startLine: ln.lineNum, endLine: ln.lineNum });
      } else {
        const s = resolvedMap.get(op.start_hash);
        const e = resolvedMap.get(op.end_hash);
        if (s && "lineNum" in s && e && "lineNum" in e) {
          ranges.push({ startLine: Math.min(s.lineNum, e.lineNum), endLine: Math.max(s.lineNum, e.lineNum) });
        }
      }
    }
    for (let i = 0; i < ranges.length; i++) {
      for (let j = i + 1; j < ranges.length; j++) {
        if (ranges[i].startLine <= ranges[j].endLine && ranges[j].startLine <= ranges[i].endLine) {
          return {
            valid: false,
            error: "overlapping_operations",
            suggested_action: "rewrite_as_single_block",
          };
        }
      }
    }
  }

  return { valid: true };
}

// --- Apply operations ---

function applyEditOperations(
  lines: string[],
  ops: EditOperation[],
  ctx: ResolutionContext,
): string[] {
  let result = [...lines];

  // Pre-resolve all operations
  const resolved = new Map<string, number>();
  for (const op of ops) {
    if (isSingleLineOp(op)) {
      if (!resolved.has(op.hash)) {
        const r = resolveAnchor(op.hash, ctx, op.occurrence);
        if (!("error" in r)) resolved.set(op.hash, r.lineNum);
      }
    } else {
      if (!resolved.has(op.start_hash)) {
        const r = resolveAnchor(op.start_hash, ctx);
        if (!("error" in r)) resolved.set(op.start_hash, r.lineNum);
      }
      if (!resolved.has(op.end_hash)) {
        const r = resolveAnchor(op.end_hash, ctx);
        if (!("error" in r)) resolved.set(op.end_hash, r.lineNum);
      }
    }
  }

  for (const op of ops) {
    switch (op.op) {
      case "replace_line": {
        const lineNum = resolved.get(op.hash)!;
        const idx = lineNum - 1;
        result[idx] = op.content;
        break;
      }
      case "replace_range": {
        const startLine = resolved.get(op.start_hash)!;
        const endLine = resolved.get(op.end_hash)!;
        const startIdx = startLine - 1;
        const endIdx = endLine - 1;
        const newLines = op.content.split("\n");
        result.splice(startIdx, endIdx - startIdx + 1, ...newLines);
        break;
      }
      case "insert_after": {
        const lineNum = resolved.get(op.hash)!;
        const idx = lineNum;
        const newLines = op.content.split("\n");
        result.splice(idx, 0, ...newLines);
        break;
      }
      case "insert_before": {
        const lineNum = resolved.get(op.hash)!;
        const idx = lineNum - 1;
        const newLines = op.content.split("\n");
        result.splice(idx, 0, ...newLines);
        break;
      }
      case "delete_line": {
        const lineNum = resolved.get(op.hash)!;
        const idx = lineNum - 1;
        result.splice(idx, 1);
        break;
      }
      case "delete_range": {
        const startLine = resolved.get(op.start_hash)!;
        const endLine = resolved.get(op.end_hash)!;
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

function computeAffectedRange(
  ops: EditOperation[],
  ctx: ResolutionContext,
): { minLine: number; maxLine: number } {
  let minLine = Infinity;
  let maxLine = 0;

  const resolved = new Map<string, number>();
  for (const op of ops) {
    if (isSingleLineOp(op)) {
      if (!resolved.has(op.hash)) {
        const r = resolveAnchor(op.hash, ctx, op.occurrence);
        if (!("error" in r)) resolved.set(op.hash, r.lineNum);
      }
    } else {
      if (!resolved.has(op.start_hash)) {
        const r = resolveAnchor(op.start_hash, ctx);
        if (!("error" in r)) resolved.set(op.start_hash, r.lineNum);
      }
      if (!resolved.has(op.end_hash)) {
        const r = resolveAnchor(op.end_hash, ctx);
        if (!("error" in r)) resolved.set(op.end_hash, r.lineNum);
      }
    }
  }

  for (const op of ops) {
    switch (op.op) {
      case "replace_line":
      case "insert_after":
      case "insert_before":
      case "delete_line": {
        const lineNum = resolved.get(op.hash);
        if (lineNum !== undefined) {
          minLine = Math.min(minLine, lineNum);
          maxLine = Math.max(maxLine, lineNum);
        }
        break;
      }
      case "replace_range":
      case "delete_range": {
        const sNum = resolved.get(op.start_hash);
        const eNum = resolved.get(op.end_hash);
        if (sNum !== undefined) minLine = Math.min(minLine, sNum);
        if (eNum !== undefined) maxLine = Math.max(maxLine, eNum);
        break;
      }
    }
  }

  return { minLine: minLine === Infinity ? 0 : minLine, maxLine };
}

interface LocalDiffResult {
  text: string;
  newAnchors: string[];
  diffPreview: string[];
}

function generateLocalDiff(
  oldLines: string[],
  newLines: string[],
  ops: EditOperation[],
  ctx: ResolutionContext,
): LocalDiffResult {
  const { minLine, maxLine } = computeAffectedRange(ops, ctx);

  if (minLine > maxLine || minLine === 0) {
    return { text: "", newAnchors: [], diffPreview: [] };
  }

  const contextBefore = 3;
  const contextAfter = 3;
  const ctxStart = Math.max(0, minLine - 1 - contextBefore);
  const ctxEnd = Math.min(newLines.length, maxLine + contextAfter);

  const newQualities = classifyLinesWithFrequency(newLines);

  const textParts: string[] = [];
  const newAnchors: string[] = [];
  const diffPreview: string[] = [];

  textParts.push("--- file");
  textParts.push("+++ file");

  for (let i = ctxStart; i < ctxEnd; i++) {
    const lineNum = i + 1;
    const newHash = computeLineHash(newLines[i]);
    const newQuality = newQualities[i];
    const anchorStr = `${lineNum}#${newHash}`;
    const formatted = formatHashedLine(lineNum, newHash, newLines[i], newQuality);

    const isInOld = i < oldLines.length;
    const inRange = lineNum >= minLine && lineNum <= maxLine;

    if (inRange && isInOld) {
      const oldHash = computeLineHash(oldLines[i]);
      const oldQuality = ctx.qualities[i];
      const oldFormatted = formatHashedLine(lineNum, oldHash, oldLines[i], oldQuality);
      textParts.push(`-${oldFormatted}`);
      diffPreview.push(`-${oldFormatted}`);
      if (newLines[i] !== oldLines[i]) {
        textParts.push(`+${formatted}`);
        diffPreview.push(`+${formatted}`);
      } else {
        textParts.push(` ${formatted}`);
        diffPreview.push(` ${formatted}`);
      }
      newAnchors.push(anchorStr);
    } else if (!isInOld) {
      textParts.push(`+${formatted}`);
      diffPreview.push(`+${formatted}`);
      newAnchors.push(anchorStr);
    } else {
      textParts.push(` ${formatted}`);
      diffPreview.push(` ${formatted}`);
      newAnchors.push(anchorStr);
    }
  }

  if (ctxEnd < newLines.length) {
    textParts.push(`... (${newLines.length - ctxEnd} more lines after)`);
  }

  return {
    text: textParts.join("\n"),
    newAnchors,
    diffPreview,
  };
}


// --- Sanity checks (4.1) ---

interface SanityResult {
  status: "clean" | "suspicious";
  warnings: string[];
}

function runSanityChecks(
  oldLines: string[],
  newLines: string[],
  affectedMinLine: number,
  affectedMaxLine: number,
): SanityResult {
  const warnings: string[] = [];
  const ctxStart = Math.max(0, affectedMinLine - 4);
  const ctxEnd = Math.min(newLines.length, affectedMaxLine + 4);

  // P0-8: duplicate-line guard
  const seenHashes = new Map<string, number[]>();
  for (let i = ctxStart; i < ctxEnd; i++) {
    if (newLines[i].trim().length === 0) continue;
    const h = computeLineHash(newLines[i]);
    const existing = seenHashes.get(h);
    if (existing) { existing.push(i + 1); }
    else { seenHashes.set(h, [i + 1]); }
  }
  for (const [hash, lineNums] of seenHashes) {
    if (lineNums.length > 1) {
      warnings.push("duplicate_line: identical lines at " + lineNums.join(", "));
    }
  }

  // P0-10: delimiter balance heuristic
  let braces = 0, parens = 0, brackets = 0;
  for (let i = ctxStart; i < ctxEnd; i++) {
    for (const ch of newLines[i]) {
      if (ch === "{") braces++; if (ch === "}") braces--;
      if (ch === "(") parens++; if (ch === ")") parens--;
      if (ch === "[") brackets++; if (ch === "]") brackets--;
    }
  }
  if (Math.abs(braces) > 1) warnings.push("unbalanced_braces: net " + (braces > 0 ? "+" : "") + braces);
  if (Math.abs(parens) > 2) warnings.push("unbalanced_parens: net " + (parens > 0 ? "+" : "") + parens);
  if (Math.abs(brackets) > 2) warnings.push("unbalanced_brackets: net " + (brackets > 0 ? "+" : "") + brackets);

  // P0-9: orphan-fragment guard
  for (let i = ctxStart; i < ctxEnd; i++) {
    const l = newLines[i].trim();
    if (l === "else" || l === "else {") {
      let hasIf = false;
      for (let j = ctxStart; j < i; j++) {
        if (/\bif\b/.test(newLines[j])) { hasIf = true; break; }
      }
      if (!hasIf) warnings.push("orphan_else at line " + (i + 1));
    }
    if (/^\s*}\s*$/.test(l) && l.length <= 3) {
      let openCount = 0;
      for (let j = ctxStart; j < i; j++) {
        for (const ch of newLines[j]) {
          if (ch === "{") openCount++;
          if (ch === "}") openCount--;
        }
      }
      if (openCount <= 0) warnings.push("suspicious_extra_brace at line " + (i + 1));
    }
  }

  return {
    status: warnings.length === 0 ? "clean" : "suspicious",
    warnings,
  };
}

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
    "The edit tool resolves ambiguous short hashes automatically via longer hash and context matching. " +
    "Example: { op: \"replace_line\", hash: \"a1b2c3\", content: \"new line content\" }",
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
    const { resolutionMap, displayIndex } = hashLines(lines);
    const qualities = classifyLinesWithFrequency(lines);

    const hashToQuality = new Map<string, LineQuality>();
    for (let i = 0; i < lines.length; i++) {
      hashToQuality.set(computeLineHash(lines[i]), qualities[i]);
    }

    const ctx: ResolutionContext = {
      resolutionMap,
      displayIndex,
      lines,
      qualities,
      hashToQuality,
    };

    const validation = validateOperations(operations, ctx);
    if (!validation.valid) {
      if (validation.error === "anchor_low_entropy") {
        const leDetails = validation.lowEntropyAnchors!.map(a =>
          `  hash "${a.hash}" resolves to low-entropy line ${a.line}: "${a.content}"\n` +
          `  Suggested high-quality neighbor anchors: [${a.neighborAnchors.join(", ")}]`
        ).join("\n");
        return {
          content: [
            {
              type: "text",
              text:
                `Edit rejected: low-entropy anchor detected.\n` +
                `${leDetails}\n` +
                `Hint: use one of the suggested neighbor anchors instead, or switch to a range operation ` +
                `that uses this line only as a boundary marker.`,
            },
          ],
          details: {
            error: "anchor_low_entropy",
            low_entropy_anchors: validation.lowEntropyAnchors,
            suggested_action: "use_neighbor_anchor",
          },
        };
      }

      if (validation.error === "anchor_prefix_ambiguous" || validation.error === "anchor_context_ambiguous") {
        const ambDetails = validation.ambiguousAnchors!.map(a => {
          const previews = a.candidatePreviews && a.candidatePreviews.length > 0
            ? a.candidatePreviews.map(c => `  line ${c.line}: "${c.preview}"`).join("\n")
            : `  lines [${a.candidates.join(", ")}]`;
          return `  hash "${a.hash}" matches:\n${previews}`;
        }).join("\n");
        const hint = validation.error === "anchor_prefix_ambiguous"
          ? `Hint: the hash prefix is ambiguous. Try re-reading with context or use a neighboring unique line as anchor.`
          : `Hint: all disambiguation levels failed. Re-read the file and use different anchors.`;
        return {
          content: [
            {
              type: "text",
              text:
                `Edit rejected: ambiguous anchors detected (${validation.error}).\n` +
                `${ambDetails}\n` +
                `${hint}`,
            },
          ],
          details: {
            error: validation.error,
            ambiguous_anchors: validation.ambiguousAnchors,
            suggested_action: validation.suggested_action,
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

      if (validation.error === "overlapping_operations") {
        return {
          content: [
            {
              type: "text",
              text:
                "Edit rejected: overlapping operations detected.\n" +
                "Multiple operations in this batch affect overlapping ranges.\n" +
                "Hint: combine them into a single replace_range or re-organize into separate batches.",
            },
          ],
          details: {
            error: "overlapping_operations",
            suggested_action: "rewrite_as_single_block",
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

    // Compute affected range BEFORE applying (uses pre-edit ctx)
    const { minLine: affectedMinLine } = computeAffectedRange(operations, ctx);

    let resultLines: string[];
    try {
      resultLines = applyEditOperations(lines, operations, ctx);
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

    const newFileVersion = computeFileVersion(newContent);
    const sanity = runSanityChecks(lines, resultLines, affectedMinLine,
      Math.min(lines.length, resultLines.length));
    const diffResult = generateLocalDiff(lines, resultLines, operations, ctx);

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

    if (diffResult.text) {
      summaryParts.push(`\nLocal diff (with new anchors):\n${diffResult.text}`);
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
        ok: true,
        operations: opsCount,
        linesBefore: lines.length,
        linesAfter: resultLines.length,
        addedLines,
        removedLines,
        file_version: newFileVersion,
        anchors_valid_through: anchorsValidThrough,
        must_refresh_from_line: mustRefreshFromLine,
        new_anchors: diffResult.newAnchors,
        diff_preview: diffResult.diffPreview,
        safety_status: sanity.status,
        safety_warnings: sanity.warnings,
      },
    };
  },
};
