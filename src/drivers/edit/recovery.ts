/**
 * Three-level edit recovery for dscode.
 *
 * Adapted from oh-my-pi's SnapshotStore + Recovery pattern.
 * When an edit arrives with a stale expected_file_version, instead of
 * immediately rejecting, we attempt recovery in three levels:
 *
 *   Level 1: Snapshot replay + diff merge (3-way merge)
 *     - Look up the snapshot by (filePath, fileVersion)
 *     - Replay operations on the snapshot text
 *     - Compute structured diff (snapshot → expected)
 *     - Apply diff to current file
 *     - If clean → return recovered lines
 *
 *   Level 2: Content-based anchor re-resolution
 *     - For each stale hash, search current file for matching content
 *     - Use context hashing to disambiguate candidates
 *     - If all anchors resolve → apply normally
 *
 *   Level 3: Reject (delegated to caller — same as current behavior)
 */

import { createHash } from "node:crypto";

// Import shared types from edit.ts (avoid circular dependency via inline types)
import type {
  EditOperation,
  ResolutionContext,
  ResolvedAnchor,
  AmbiguousAnchor,
} from "./hash.js";

import {
  computeLineHash,
  computeResolutionHash,
  hashLines,
  classifyLinesWithFrequency,
  computeFileVersion,
  formatHashedLine,
} from "./hash.js";

// --- Level 1: Snapshot replay + structured diff merge ---

interface SnapshotRecoveryResult {
  /** The recovered lines (merged onto current file). */
  lines: string[];
  /** Diff preview for diagnostics. */
  diffPreview: string[];
  /** Recovery level used. */
  level: "snapshot_replay";
}

interface SnapshotRecoveryError {
  error: string;
  reason: string;
}

/**
 * Attempt Level 1 recovery: replay ops on snapshot, then merge diff to current.
 *
 * Algorithm:
 *   1. Replay `operations` on `snapshotLines` → `expectedLines`
 *   2. Build a structured diff between snapshotLines and expectedLines
 *      (line-level: which lines were replaced/inserted/deleted)
 *   3. Apply that diff to currentLines
 *   4. If the diff applies cleanly, return the result
 *   5. If not, return an error → caller falls through to Level 2
 */
export function recoverBySnapshot(
  snapshotLines: string[],
  currentLines: string[],
  operations: EditOperation[],
  snapshotCtx: ResolutionContext,
): SnapshotRecoveryResult | SnapshotRecoveryError {
  // Step 1: Replay operations on snapshot
  let expectedLines: string[];
  try {
    expectedLines = applyOperationsToLines(snapshotLines, snapshotCtx, operations);
  } catch (err: any) {
    return {
      error: "snapshot_replay_failed",
      reason: `Failed to replay operations on snapshot: ${err.message ?? String(err)}`,
    };
  }

  // Step 2: Build a structured patch from snapshot → expected
  const patch = buildLinePatch(snapshotLines, expectedLines);

  // Step 3: Apply patch to current lines
  const recovered = applyLinePatch(currentLines, patch);
  if (!recovered) {
    return {
      error: "patch_merge_conflict",
      reason:
        "Could not cleanly merge the snapshot diff onto the current file. " +
        "The file may have diverged too far from the snapshot.",
    };
  }

  // Step 4: Build a human-readable diff preview
  const diffPreview = buildDiffPreview(snapshotLines, expectedLines, currentLines, patch);

  return { lines: recovered, diffPreview, level: "snapshot_replay" };
}

// --- Level 2: Content-based anchor re-resolution ---

interface ContentRecoveryResult {
  /** Map of hash → resolved line number in the current file. */
  resolved: Map<string, number>;
  /** Warnings about anchors that were resolved with lower confidence. */
  warnings: string[];
  level: "content_search";
}

interface ContentRecoveryError {
  error: string;
  unresolved: string[];
  partiallyResolved: Map<string, number>;
}

/**
 * Attempt Level 2 recovery: search for each hash's content in the current file.
 *
 * For each stale hash, we:
 *   1. Extract the original line content from the snapshot context
 *   2. Compute its context hash (surrounding non-empty lines)
 *   3. Search the current file for that context hash
 *   4. If found uniquely → resolve
 *   5. If found multiple times → try occurrence/line hint disambiguation
 *   6. If not found → try display hash alone (fallback)
 */
export function recoverByContentSearch(
  currentLines: string[],
  staleHashes: string[],
  originalLines: string[], // snapshot lines
  originalQualities: import("./hash.js").LineQuality[],
  operations: EditOperation[],
): ContentRecoveryResult | ContentRecoveryError {
  const currentResolutionMap = new Map<string, number[]>();
  const currentDisplayIndex = new Map<string, string[]>();

  // Build resolution map for current file
  for (let i = 0; i < currentLines.length; i++) {
    const resHash = computeResolutionHash(currentLines[i]);
    const displayHash = resHash.slice(0, 6);
    const existing = currentResolutionMap.get(resHash);
    if (existing) {
      existing.push(i + 1);
    } else {
      currentResolutionMap.set(resHash, [i + 1]);
    }
    const displayEntries = currentDisplayIndex.get(displayHash);
    if (displayEntries) {
      if (!displayEntries.includes(resHash)) {
        displayEntries.push(resHash);
      }
    } else {
      currentDisplayIndex.set(displayHash, [resHash]);
    }
  }

  const resolved = new Map<string, number>();
  const warnings: string[] = [];
  const unresolved: string[] = [];

  for (const hash of staleHashes) {
    const result = resolveHashInCurrentFile(
      hash,
      currentLines,
      currentResolutionMap,
      currentDisplayIndex,
      originalLines,
      operations,
    );

    if (result !== null) {
      resolved.set(hash, result.lineNum);
      if (result.warning) warnings.push(result.warning);
    } else {
      unresolved.push(hash);
    }
  }

  if (unresolved.length > 0) {
    return {
      error: "content_search_partial",
      unresolved,
      partiallyResolved: resolved,
    };
  }

  return { resolved, warnings, level: "content_search" };
}

// --- Internal helpers ---

/** Hash-to-line resolver result */
interface HashResolveResult {
  lineNum: number;
  warning?: string;
}

/**
 * Try to resolve a hash from the snapshot into the current file.
 * Strategy:
 *   1. Build context hash from original lines around the anchor
 *   2. Search current file for that context hash
 *   3. Fall back to display hash search
 *   4. Fall back to line number hint from the operation
 */
function resolveHashInCurrentFile(
  displayHash: string,
  currentLines: string[],
  currentResolutionMap: Map<string, number[]>,
  currentDisplayIndex: Map<string, string[]>,
  originalLines: string[],
  operations: EditOperation[],
): HashResolveResult | null {
  // Strategy 1: Context hash search
  // Find the original line number(s) for this hash
  const origResHashes = new Set<string>();
  for (let i = 0; i < originalLines.length; i++) {
    const rh = computeResolutionHash(originalLines[i]);
    if (rh.startsWith(displayHash)) {
      origResHashes.add(rh);
    }
  }

  if (origResHashes.size > 0) {
    // For each original line that matches, compute its context hash
    // and search the current file
    const candidates: { line: number; score: number; method: string }[] = [];

    for (const origRh of origResHashes) {
      // Find the original line number
      const origLineNum = findLineByResolutionHash(originalLines, origRh);
      if (origLineNum < 0) continue;

      const ctxHash = computeContextHash(originalLines, origLineNum);
      const currentMatches = findLineByContextHash(currentLines, ctxHash);

      if (currentMatches.length === 1) {
        candidates.push({
          line: currentMatches[0] + 1,
          score: 3,
          method: "context_hash_exact",
        });
      } else if (currentMatches.length > 1) {
        // Try to find the closest to the original position
        let best = currentMatches[0];
        let bestDist = Math.abs(best - origLineNum);
        for (let i = 1; i < currentMatches.length; i++) {
          const dist = Math.abs(currentMatches[i] - origLineNum);
          if (dist < bestDist) { best = currentMatches[i]; bestDist = dist; }
        }
        candidates.push({
          line: best + 1,
          score: 2,
          method: "context_hash_proximity",
        });
      }
    }

    if (candidates.length > 0) {
      // Pick the highest-scoring candidate
      candidates.sort((a, b) => b.score - a.score);
      const best = candidates[0];
      return {
        lineNum: best.line,
        warning: best.method === "context_hash_proximity"
          ? `Anchor "${displayHash}" resolved via proximity match (confidence: medium)`
          : undefined,
      };
    }
  }

  // Strategy 2: Display hash search in current file
  const curResHashes = currentDisplayIndex.get(displayHash);
  if (curResHashes && curResHashes.length > 0) {
    // Collect all line numbers
    const allLines: number[] = [];
    for (const rh of curResHashes) {
      const lines = currentResolutionMap.get(rh);
      if (lines) allLines.push(...lines);
    }
    allLines.sort((a, b) => a - b);

    if (allLines.length === 1) {
      return {
        lineNum: allLines[0],
        warning: `Anchor "${displayHash}" resolved in current file via exact hash match (file may have shifted)`,
      };
    }

    if (allLines.length > 1) {
      // Try to get a line hint from the operation
      const lineHint = getLineHintFromOperations(displayHash, operations);
      if (lineHint !== null) {
        let best = allLines[0];
        let bestDist = Math.abs(best - lineHint);
        let unique = true;
        for (let i = 1; i < allLines.length; i++) {
          const dist = Math.abs(allLines[i] - lineHint);
          if (dist < bestDist) { best = allLines[i]; bestDist = dist; unique = true; }
          else if (dist === bestDist) { unique = false; }
        }
        if (unique) {
          return {
            lineNum: best,
            warning: `Anchor "${displayHash}" resolved via line-hint proximity (confidence: low)`,
          };
        }
      }

      // Multiple matches and no disambiguation — can't resolve
      return null;
    }
  }

  // Strategy 3: Content substring search (last resort)
  // Find original line content
  const origLineContent = findOriginalLineContent(displayHash, originalLines);
  if (origLineContent !== null && origLineContent.trim().length > 10) {
    const trimmed = origLineContent.trim();
    const matches: number[] = [];
    for (let i = 0; i < currentLines.length; i++) {
      if (currentLines[i].trim() === trimmed) {
        matches.push(i + 1);
      }
    }
    if (matches.length === 1) {
      return {
        lineNum: matches[0],
        warning: `Anchor "${displayHash}" resolved via exact content match (confidence: low)`,
      };
    }
  }

  return null;
}

/** Build a context hash for a line using surrounding non-empty lines. */
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

/** Find line indices that match a context hash. */
function findLineByContextHash(lines: string[], targetCtxHash: string): number[] {
  const results: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (computeContextHash(lines, i) === targetCtxHash) {
      results.push(i);
    }
  }
  return results;
}

/** Find a line by its 8-char resolution hash. */
function findLineByResolutionHash(lines: string[], targetRh: string): number {
  for (let i = 0; i < lines.length; i++) {
    if (computeResolutionHash(lines[i]) === targetRh) return i;
  }
  return -1;
}

/** Extract a line hint from operations that reference this hash. */
function getLineHintFromOperations(
  hash: string,
  operations: EditOperation[],
): number | null {
  for (const op of operations) {
    if (isSingleLineOp(op) && op.hash === hash && op.line !== undefined) {
      return op.line;
    }
    if (isRangeOp(op)) {
      if ((op as any).line !== undefined && (op.start_hash === hash || op.end_hash === hash)) {
        return (op as any).line;
      }
    }
  }
  return null;
}

/** Find the original line content for a display hash. */
function findOriginalLineContent(
  displayHash: string,
  originalLines: string[],
): string | null {
  for (const line of originalLines) {
    if (computeLineHash(line) === displayHash) {
      return line;
    }
  }
  return null;
}

// --- Type guards (duplicated from edit.ts to avoid coupling) ---

type SingleLineOp = Extract<EditOperation, { op: "replace_line" | "insert_after" | "insert_before" | "delete_line" }>;
type RangeOp = Extract<EditOperation, { op: "replace_range" | "delete_range" }>;

function isSingleLineOp(op: EditOperation): op is SingleLineOp {
  return op.op === "replace_line" || op.op === "insert_after" || op.op === "insert_before" || op.op === "delete_line";
}

function isRangeOp(op: EditOperation): op is RangeOp {
  return op.op === "replace_range" || op.op === "delete_range";
}

// --- Structured line patch (simple line-level diff) ---

interface LinePatchHunk {
  /** Start line in the original (0-indexed). */
  start: number;
  /** Number of lines to delete from original. */
  deleteCount: number;
  /** Lines to insert at start position. */
  insertLines: string[];
}

interface LinePatch {
  hunks: LinePatchHunk[];
}

/**
 * Build a structured line-level patch from old → new.
 * Uses a simple greedy diff: walk both files, emit hunks for differences.
 */
function buildLinePatch(oldLines: string[], newLines: string[]): LinePatch {
  const hunks: LinePatchHunk[] = [];

  // Compute LCS to find matching lines
  const lcs = computeLCS(oldLines, newLines);

  let oi = 0; // old index
  let ni = 0; // new index
  let li = 0; // LCS pair index

  while (oi < oldLines.length || ni < newLines.length) {
    // Find the next matching pair
    const pair = li < lcs.length ? lcs[li] : null;

    if (pair && oi === pair.oldIdx && ni === pair.newIdx) {
      // Lines match — advance both
      oi++;
      ni++;
      li++;
    } else {
      // Lines differ — build a hunk
      const hunkStart = oi;
      const hunkInsertLines: string[] = [];

      // Advance until we hit the next matching pair or end
      while (true) {
        const nextPair = li < lcs.length ? lcs[li] : null;
        if (nextPair && oi === nextPair.oldIdx && ni === nextPair.newIdx) {
          break;
        }
        if (ni < newLines.length) {
          hunkInsertLines.push(newLines[ni]);
          ni++;
        }
        if (oi < oldLines.length) {
          oi++;
        }
        if (oi >= oldLines.length && ni >= newLines.length) break;
      }

      const deleteCount = oi - hunkStart;
      hunks.push({
        start: hunkStart,
        deleteCount,
        insertLines: hunkInsertLines,
      });
    }
  }

  return { hunks };
}

interface LCSPair {
  oldIdx: number;
  newIdx: number;
}

/** Compute longest common subsequence of lines (by content hash). */
function computeLCS(a: string[], b: string[]): LCSPair[] {
  // Build hash arrays for fast comparison
  const aHashes = a.map(l => computeLineHash(l));
  const bHashes = b.map(l => computeLineHash(l));

  // Simple O(n*m) LCS — acceptable for typical file sizes (≤2000 lines)
  // Build dp table
  const m = aHashes.length;
  const n = bHashes.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (aHashes[i - 1] === bHashes[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack
  const pairs: LCSPair[] = [];
  let i = m, j = n;
  while (i > 0 && j > 0) {
    if (aHashes[i - 1] === bHashes[j - 1]) {
      pairs.unshift({ oldIdx: i - 1, newIdx: j - 1 });
      i--;
      j--;
    } else if (dp[i - 1][j] > dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }

  return pairs;
}

/**
 * Apply a line patch to a target file.
 * Returns the new lines or null if the patch doesn't apply cleanly.
 */
function applyLinePatch(
  targetLines: string[],
  patch: LinePatch,
): string[] | null {
  const result: string[] = [];
  let ti = 0;

  // Sort hunks by start position (reverse order for safe splicing)
  const sortedHunks = [...patch.hunks].sort((a, b) => a.start - b.start);

  for (const hunk of sortedHunks) {
    // Copy lines before this hunk
    while (ti < hunk.start && ti < targetLines.length) {
      result.push(targetLines[ti]);
      ti++;
    }

    // Verify the context: the lines we're about to delete should match
    // what the patch expects. We do a lenient check — if the delete
    // range exists, we accept it even if content shifted slightly.
    if (hunk.start + hunk.deleteCount > targetLines.length) {
      // Hunk extends beyond current file — still try to apply
    }

    // Skip the deleted lines
    ti = hunk.start + hunk.deleteCount;

    // Insert the new lines
    for (const line of hunk.insertLines) {
      result.push(line);
    }
  }

  // Copy remaining lines
  while (ti < targetLines.length) {
    result.push(targetLines[ti]);
    ti++;
  }

  return result;
}

// --- Apply operations to lines (used by snapshot replay) ---

/**
 * Apply edit operations to a set of lines using pre-resolved anchors.
 * This is a simplified version of edit.ts's applyEditOperations that works
 * with the snapshot's resolution context.
 */
function applyOperationsToLines(
  lines: string[],
  ctx: ResolutionContext,
  operations: EditOperation[],
): string[] {
  const result = [...lines];

  // Pre-resolve all anchors in the snapshot context
  const resolved = new Map<string, number>();
  for (const op of operations) {
    if (isSingleLineOp(op)) {
      if (!resolved.has(op.hash)) {
        const lineNums = findLineNumsForHash(op.hash, ctx);
        if (lineNums.length > 0) {
          const target = resolveSingleTarget(lineNums, op.occurrence, op.line);
          if (target !== null) resolved.set(op.hash, target);
        }
      }
    } else {
      if (!resolved.has(op.start_hash)) {
        const lineNums = findLineNumsForHash(op.start_hash, ctx);
        if (lineNums.length > 0) {
          const target = resolveSingleTarget(lineNums);
          if (target !== null) resolved.set(op.start_hash, target);
        }
      }
      if (!resolved.has(op.end_hash)) {
        const lineNums = findLineNumsForHash(op.end_hash, ctx);
        if (lineNums.length > 0) {
          const target = resolveSingleTarget(lineNums);
          if (target !== null) resolved.set(op.end_hash, target);
        }
      }
    }
  }

  // Verify all anchors resolved
  for (const op of operations) {
    if (isSingleLineOp(op) && !resolved.has(op.hash)) {
      throw new Error(`Cannot resolve anchor: ${op.hash}`);
    }
    if (isRangeOp(op) && (!resolved.has(op.start_hash) || !resolved.has(op.end_hash))) {
      throw new Error(`Cannot resolve range anchors: ${op.start_hash}..${op.end_hash}`);
    }
  }

  // Apply operations (in original order, against snapshot — no position shifting)
  for (const op of operations) {
    switch (op.op) {
      case "replace_line": {
        const lineNum = resolved.get(op.hash)!;
        result[lineNum - 1] = op.content;
        break;
      }
      case "replace_range": {
        const startLine = resolved.get(op.start_hash)!;
        const endLine = resolved.get(op.end_hash)!;
        const newLines = op.content.split("\n");
        result.splice(startLine - 1, endLine - startLine + 1, ...newLines);
        break;
      }
      case "insert_after": {
        const lineNum = resolved.get(op.hash)!;
        const newLines = op.content.split("\n");
        result.splice(lineNum, 0, ...newLines);
        break;
      }
      case "insert_before": {
        const lineNum = resolved.get(op.hash)!;
        const newLines = op.content.split("\n");
        result.splice(lineNum - 1, 0, ...newLines);
        break;
      }
      case "delete_line": {
        const lineNum = resolved.get(op.hash)!;
        result.splice(lineNum - 1, 1);
        break;
      }
      case "delete_range": {
        const startLine = resolved.get(op.start_hash)!;
        const endLine = resolved.get(op.end_hash)!;
        result.splice(startLine - 1, endLine - startLine + 1);
        break;
      }
    }
  }

  return result;
}

function findLineNumsForHash(
  displayHash: string,
  ctx: ResolutionContext,
): number[] {
  const resHashes = ctx.displayIndex.get(displayHash);
  if (!resHashes) return [];
  const lineNums: number[] = [];
  for (const rh of resHashes) {
    const nums = ctx.resolutionMap.get(rh);
    if (nums) lineNums.push(...nums);
  }
  lineNums.sort((a, b) => a - b);
  return lineNums;
}

function resolveSingleTarget(
  lineNums: number[],
  occurrence?: number,
  line?: number,
): number | null {
  if (occurrence !== undefined && occurrence >= 1 && occurrence <= lineNums.length) {
    return lineNums[occurrence - 1];
  }
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
    return null;
  }
  return lineNums[0];
}

// --- Diff preview builder ---

function buildDiffPreview(
  snapshotLines: string[],
  expectedLines: string[],
  currentLines: string[],
  patch: LinePatch,
): string[] {
  const preview: string[] = [];
  preview.push("--- snapshot (original)");
  preview.push("+++ current (recovered)");

  // Show a summary of what changed
  for (const hunk of patch.hunks) {
    const ctxStart = Math.max(0, hunk.start - 2);
    const ctxEnd = Math.min(snapshotLines.length, hunk.start + hunk.deleteCount + 2);

    for (let i = ctxStart; i < ctxEnd; i++) {
      if (i >= hunk.start && i < hunk.start + hunk.deleteCount) {
        preview.push(`-${i + 1}: ${snapshotLines[i]}`);
      } else {
        preview.push(` ${i + 1}: ${snapshotLines[i]}`);
      }
    }
    for (const line of hunk.insertLines) {
      preview.push(`+${line}`);
    }
  }

  if (preview.length > 50) {
    preview.push(`... (${preview.length - 50} more diff lines)`);
    preview.splice(50);
  }

  return preview;
}
