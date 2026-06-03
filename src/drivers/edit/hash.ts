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

export type LineQuality = "low" | "med" | "high";

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
  line: Type.Optional(Type.Number({ description: "Advisory line number from read_file snapshot. When hash is ambiguous, selects the candidate closest to this line." })),
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
  line: Type.Optional(Type.Number({ description: "Advisory line number from read_file snapshot. When hash is ambiguous, selects the candidate closest to this line." })),
});

const InsertBeforeOp = Type.Object({
  op: Type.Literal("insert_before"),
  hash: Type.String({ description: "Hash of the line to insert before" }),
  content: Type.String({ description: "Content to insert (use \\n for multiple lines)" }),
  occurrence: Type.Optional(Type.Number({ description: "When hash matches multiple lines, specifies which occurrence (1-indexed) to target. Omit if hash is unique." })),
  line: Type.Optional(Type.Number({ description: "Advisory line number from read_file snapshot. When hash is ambiguous, selects the candidate closest to this line." })),
});

const DeleteLineOp = Type.Object({
  op: Type.Literal("delete_line"),
  hash: Type.String({ description: "Hash of the line to delete" }),
  occurrence: Type.Optional(Type.Number({ description: "When hash matches multiple lines, specifies which occurrence (1-indexed) to target. Omit if hash is unique." })),
  line: Type.Optional(Type.Number({ description: "Advisory line number from read_file snapshot. When hash is ambiguous, selects the candidate closest to this line." })),
});

const DeleteRangeOp = Type.Object({
  op: Type.Literal("delete_range"),
  start_hash: Type.String({ description: "Hash of the first line in the range" }),
  end_hash: Type.String({ description: "Hash of the last line in the range" }),
});

export const EditOperation = Type.Union([
  ReplaceLineOp,
  ReplaceRangeOp,
  InsertAfterOp,
  InsertBeforeOp,
  DeleteLineOp,
  DeleteRangeOp,
]);

export type EditOperation =
  | { op: "replace_line"; hash: string; content: string; occurrence?: number; line?: number }
  | { op: "replace_range"; start_hash: string; end_hash: string; content: string }
  | { op: "insert_after"; hash: string; content: string; occurrence?: number; line?: number }
  | { op: "insert_before"; hash: string; content: string; occurrence?: number; line?: number }
  | { op: "delete_line"; hash: string; occurrence?: number; line?: number }
  | { op: "delete_range"; start_hash: string; end_hash: string };

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

export interface AmbiguousAnchor {
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

export interface ResolutionContext {
  resolutionMap: Map<string, number[]>;
  displayIndex: Map<string, string[]>;
  lines: string[];
  qualities: LineQuality[];
  hashToQuality: Map<string, LineQuality>;
}

// --- Adaptive anchor resolution ---

export interface ResolvedAnchor {
  lineNum: number;
  level: "display" | "resolution" | "context";
}

export function resolveAnchor(
  displayHash: string,
  ctx: ResolutionContext,
  occurrence?: number,
  line?: number,
): ResolvedAnchor | { error: string; candidates: CandidateInfo[] } {
  const resHashes = ctx.displayIndex.get(displayHash);

  // Step 1: display hash not found at all
  if (!resHashes || resHashes.length === 0) {
    return { error: "anchor_stale", candidates: [] };
  }

  // Step 2: display hash maps to exactly one resolution hash
  if (resHashes.length === 1) {
    const lineNums = ctx.resolutionMap.get(resHashes[0])!;
    const resolved = resolveSingleLineTarget(lineNums, occurrence, line);
    if (resolved !== null) return { lineNum: resolved, level: "display" };
    // line-hint was ambiguous (equidistant) — collect candidates and fall through to error
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

  // Collect all candidates for error reporting and line-hint disambiguation
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

  // Step 4: line-hint disambiguation — pick candidate closest to advisory line number
  if (line !== undefined && candidates.length > 0) {
    candidates.sort((a, b) => a.line - b.line);
    let bestIdx = 0;
    let bestDist = Math.abs(candidates[0].line - line);
    let unique = true;
    for (let i = 1; i < candidates.length; i++) {
      const dist = Math.abs(candidates[i].line - line);
      if (dist < bestDist) { bestIdx = i; bestDist = dist; unique = true; }
      else if (dist === bestDist) { unique = false; }
    }
    if (unique) {
      return { lineNum: candidates[bestIdx].line, level: "context" };
    }
  }

  // Step 5: context-augmented matching — each candidate gets a unique hash from surrounding lines.
  // If all context hashes are distinct AND line hint is provided, use line to select.
  if (line !== undefined && candidates.length > 1) {
    const ctxHashes = candidates.map(c => ({
      ...c,
      ctxHash: computeContextHash(ctx.lines, c.line - 1),
    }));
    // Check all context hashes are unique
    const seen = new Set<string>();
    let allUnique = true;
    for (const c of ctxHashes) { if (seen.has(c.ctxHash)) { allUnique = false; break; } seen.add(c.ctxHash); }
    if (allUnique) {
      // Use line hint to pick among uniquely-contextualized candidates
      let best = ctxHashes[0];
      let bestDist = Math.abs(best.line - line);
      let unique = true;
      for (let i = 1; i < ctxHashes.length; i++) {
        const dist = Math.abs(ctxHashes[i].line - line);
        if (dist < bestDist) { best = ctxHashes[i]; bestDist = dist; unique = true; }
        else if (dist === bestDist) { unique = false; }
      }
      if (unique) return { lineNum: best.line, level: "context" };
    }
  }

  return { error: "anchor_prefix_ambiguous", candidates };
}

function resolveSingleLineTarget(
  lineNums: number[],
  occurrence?: number,
  line?: number,
): number | null {
  if (occurrence !== undefined && occurrence >= 1 && occurrence <= lineNums.length) {
    return lineNums[occurrence - 1];
  }
  // Line-hint: pick closest candidate
  if (line !== undefined && lineNums.length > 1) {
    let best = lineNums[0];
    let bestDist = Math.abs(best - line);
    let unique = true;
    for (let i = 1; i < lineNums.length; i++) {
      const dist = Math.abs(lineNums[i] - line);
      if (dist < bestDist) { best = lineNums[i]; bestDist = dist; unique = true; }
      else if (dist === bestDist) { unique = false; }
    }
    if (unique) return best;
    return null; // equidistant — caller should reject
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

/**
 * Proximity-based resolution for range endpoints.
 * When one endpoint is unique and the other is ambiguous, resolve the ambiguous
 * one to the closest candidate in the correct direction.
 * Example: start=unique(line 182), end=ambiguous(`}` matches 50 lines)
 *   → resolve end to the nearest `}` at or after line 182.
 */
function tryProximityResolve(
  startHash: string,
  endHash: string,
  ctx: ResolutionContext,
  resolvedMap: Map<string, ResolvedAnchor>,
  ambiguousAnchors: AmbiguousAnchor[],
): void {
  const startRes = resolvedMap.get(startHash);
  const endRes = resolvedMap.get(endHash);
  const unresolvedStart = !startRes || "error" in startRes ? startHash : null;
  const unresolvedEnd = !endRes || "error" in endRes ? endHash : null;
  if (!unresolvedStart && !unresolvedEnd) return;
  if (unresolvedStart && unresolvedEnd) return;
  const unresolvedHash = unresolvedStart ?? unresolvedEnd!;
  const resolvedLineNum = unresolvedStart
    ? (endRes as ResolvedAnchor).lineNum
    : (startRes as ResolvedAnchor).lineNum;
  const isStart = unresolvedStart !== null;
  const ambIdx = ambiguousAnchors.findIndex(a => a.hash === unresolvedHash);
  if (ambIdx < 0) return;
  const candidates = ambiguousAnchors[ambIdx].candidates.slice().sort((a, b) => a - b);
  if (candidates.length === 0) return;
  let best: number | null = null;
  if (isStart) {
    for (let i = candidates.length - 1; i >= 0; i--) {
      if (candidates[i] <= resolvedLineNum) { best = candidates[i]; break; }
    }
  } else {
    for (const c of candidates) {
      if (c >= resolvedLineNum) { best = c; break; }
    }
  }
  if (best !== null) {
    resolvedMap.set(unresolvedHash, { lineNum: best, level: "context" });
    ambiguousAnchors.splice(ambIdx, 1);
  }
}


export function validateOperations(
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
      // 4.0+: Proximity-based resolution — if one endpoint unique and other ambiguous,
      // resolve ambiguous one to closest candidate in the correct direction.
      tryProximityResolve(op.start_hash, op.end_hash, ctx, resolvedMap, ambiguousAnchors);

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
      const result = resolveAnchor(hash, ctx, op.occurrence, op.line);
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
        // Check low-entropy for single-line ops — only reject when AMBIGUOUS
        const lineNum = result.lineNum;
        const quality = ctx.qualities[lineNum - 1];
        if (quality === "low") {
          // Count total candidates for this hash across all resolution entries
          const resHashes = ctx.displayIndex.get(hash) ?? [];
          let totalCandidates = 0;
          for (const rh of resHashes) {
            totalCandidates += (ctx.resolutionMap.get(rh)?.length ?? 0);
          }
          // Only reject if ambiguous AND no occurrence to disambiguate
          if (totalCandidates > 1 && op.occurrence === undefined) {
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

export function applyEditOperations(
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
        const r = resolveAnchor(op.hash, ctx, op.occurrence, op.line);
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

export function computeAffectedRange(
  ops: EditOperation[],
  ctx: ResolutionContext,
): { minLine: number; maxLine: number } {
  let minLine = Infinity;
  let maxLine = 0;

  const resolved = new Map<string, number>();
  for (const op of ops) {
    if (isSingleLineOp(op)) {
      if (!resolved.has(op.hash)) {
        const r = resolveAnchor(op.hash, ctx, op.occurrence, op.line);
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

export function generateLocalDiff(
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
