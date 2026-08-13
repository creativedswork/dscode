import { getHostLogger } from "../../kernel/logger.js";
import { createHash } from "node:crypto";
import { readFile, writeFile, stat } from "node:fs/promises";
import { resolveExecutionPath } from "../../kernel/execution-context.js";

async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "@earendil-works/pi-ai";
import { getCheckpointManager, getFileWriteTracker, getSnapshotStore, type WriterType } from "../../checkpoint/index.js";
import { recoverBySnapshot, recoverByContentSearch } from "./recovery.js";
import {
  computeLineHash,
  computeFileVersion,
  computeResolutionHash,
  hashLines,
  classifyLinesWithFrequency,
  formatHashedLine,
  type LineQuality,
  type ResolutionContext,
  type EditOperation,
  EditOperation as EditOperationSchema,
  type ResolvedAnchor,
  type AmbiguousAnchor,
  validateOperations,
  applyEditOperations,
  computeAffectedRange,
  generateLocalDiff,
  resolveAnchor,
} from "./hash.js";
import { captureUndoSnapshot } from "./undo-store.js";
import { validateSyntax, isSyntaxCheckSupported } from "./syntax-validate.js";

const _editLogger = {
  warn(tag: string, message: string): void {
    getHostLogger()?.warn(tag, message);
  },
};

const editParams = Type.Object({
  path: Type.String({ description: "Absolute path of the file to edit" }),
  file_path: Type.Optional(Type.String({ description: "[deprecated] Use 'path' instead. Will be removed in a future version." })),
  operations: Type.Array(EditOperationSchema, { description: "Ordered list of edit operations to apply" }),
  expected_file_version: Type.Optional(Type.String({ description: "File version from the last read_file(hashes: true). When provided and the file has changed, the edit tool will attempt to recover by replaying operations on the snapshot and merging the result onto the current file (3-way merge recovery)." })),
  safety_check: Type.Optional(Type.String({ description: "Safety check strictness: 'strict' (default, reject on imbalance), 'warn' (apply but warn), 'off' (skip checks)." })),
  dry_run: Type.Optional(Type.Boolean({ description: "When true, validate all operations (resolve anchors, check safety, detect conflicts) without modifying the file. Returns per-operation diagnostics." })),

});
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

  // Build hash set of old lines to identify truly new content.
  // Insertions cause position shifts, so positional comparison (oldLines[i] !== newLines[i])
  // would incorrectly mark shifted lines as "changed".
  const oldHashSet = new Set<string>();
  for (const line of oldLines) {
    if (line.trim().length > 0) oldHashSet.add(computeLineHash(line));
  }

  // P0-8: duplicate-line guard — only check GENUINELY NEW lines (hash not in oldLines)
  const newLineDups = new Map<string, number[]>();
  for (let i = 0; i < newLines.length; i++) {
    const trimmed = newLines[i].trim();
    if (trimmed.length === 0) continue;
    const h = computeLineHash(newLines[i]);
    if (!oldHashSet.has(h)) {
      const existing = newLineDups.get(h);
      if (existing) { existing.push(i + 1); }
      else { newLineDups.set(h, [i + 1]); }
    }
  }
  for (const [, lineNums] of newLineDups) {
    if (lineNums.length > 1) {
      warnings.push("duplicate_line: identical lines at " + lineNums.join(", "));
    }
  }

  // P0-10: delimiter balance — compare WHOLE file totals (immune to position shifts)
  function countDelims(lines: string[]): [number, number, number] {
    let b = 0, p = 0, br = 0;
    for (const line of lines) {
      for (const ch of line) {
        if (ch === "{") b++; if (ch === "}") b--;
        if (ch === "(") p++; if (ch === ")") p--;
        if (ch === "[") br++; if (ch === "]") br--;
      }
    }
    return [b, p, br];
  }
  const [oldB, oldP, oldBr] = countDelims(oldLines);
  const [newB, newP, newBr] = countDelims(newLines);
  const bDelta = newB - oldB, pDelta = newP - oldP, brDelta = newBr - oldBr;
  if (Math.abs(bDelta) > 1) warnings.push("unbalanced_braces: net " + (bDelta > 0 ? "+" : "") + bDelta);
  if (Math.abs(pDelta) > 2) warnings.push("unbalanced_parens: net " + (pDelta > 0 ? "+" : "") + pDelta);
  if (Math.abs(brDelta) > 2) warnings.push("unbalanced_brackets: net " + (brDelta > 0 ? "+" : "") + brDelta);

  // P0-9: orphan-fragment guard — only check genuinely new lines
  for (let i = 0; i < newLines.length; i++) {
    const trimmed = newLines[i].trim();
    if (trimmed.length === 0) continue;
    const h = computeLineHash(newLines[i]);
    if (oldHashSet.has(h)) continue; // pre-existing line, skip

    if (trimmed === "else" || trimmed === "else {") {
      let hasIf = false;
      for (let j = 0; j < i; j++) {
        if (/\bif\b/.test(newLines[j])) { hasIf = true; break; }
      }
      if (!hasIf) warnings.push("orphan_else at line " + (i + 1));
    }
    if (/^\s*}\s*$/.test(trimmed) && trimmed.length <= 3) {
      let openCount = 0;
      for (let j = 0; j < i; j++) {
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


// (removed)
}

export const editTool: AgentTool<typeof editParams> = {
  name: "edit",
  label: "Edit file (preferred over shell commands)",
  description:
    "【PREFERRED】Use this tool for ALL file editing — do NOT use bash/sed/awk for file modifications. " +
    "Edit a file using content-based hash anchors. " +
    "First read the file with read_file(hashes: true) to get line hashes (format: lineNum#hash|content), " +
    "then use this tool to make precise changes. " +
    "After reading a file with read_file(hashes: true), apply edits to that file in the " +
    "same response turn or the immediate next turn. Do not read file A, then read file B, " +
    "then later edit file A — the anchors from A will be stale and cause cross-version " +
    "conflicts. Process one file completely (read → edit) before reading anchors for " +
    "another file. " +
    "Line numbers in anchors are advisory (snapshot position); hashes are content-based identity (the guard material). " +
    "Operations: replace_line, replace_range, insert_after, insert_before, delete_line, delete_range. " +
    "All operations in a single call are applied atomically against the same initial file snapshot — " +
    "later operations within the batch do NOT see the results of earlier operations. " +
    "If any hash is invalid, ambiguous, or out of order, the entire batch is rejected and no changes are made. " +
    "For duplicate-content lines, use the `occurrence` field (1-indexed) to specify which matching line to target. " +
    "For ambiguous hashes, use the `line` field (advisory line number from read_file) to select the candidate closest to that line. " +
    "Anchor selection guidance: Prefer lines with unique, distinctive content as anchors. " +
    "Avoid anchoring on empty lines, closing braces (`}`), or frequently repeated boilerplate " +
    "(e.g., `position: fixed;`, `display: flex;` in CSS, `</div>` in HTML). For files with " +
    "repetitive content, use `replace_range` with two unique boundary anchors instead of " +
    "`replace_line` — range operations enforce uniqueness on both endpoints and are " +
    "rejected if ambiguous. When a `replace_line` anchor matches multiple lines, use the " +
    "`occurrence` field (1-indexed) and `line` field (advisory line number) together to " +
    "disambiguate. " +
    "Range operations (replace_range, delete_range) require both endpoint hashes to be unique and will be rejected if ambiguous. " +
    "The edit tool resolves ambiguous short hashes automatically via longer hash and context matching. " +
    "Parameter notes: " +
    "- Use `path` to specify the file; `file_path` is deprecated and will be rejected. " +
    "- `replace_line` / `delete_line` / `insert_after` / `insert_before` use `hash` (single anchor). " +
    "- `replace_range` / `delete_range` use `start_hash` + `end_hash` (two anchors). " +
    "- Mixing these (e.g., `start_hash` on a `replace_line`) causes validation failure. " +
    "Example: { op: \"replace_line\", hash: \"a1b2c3\", content: \"new line content\" }",
  parameters: editParams,
  execute: async (_id, { path, file_path, operations, expected_file_version, safety_check, dry_run }) => {
    // Resolve path alias: file_path is deprecated, path takes precedence
    const effectivePath = path ?? file_path;
    if (!effectivePath) {
      return {
        content: [{ type: "text", text: "Error: 'path' parameter is required" }],
        details: { error: "missing_parameter", suggested_action: "provide_path" },
      };
    }
    if (file_path && !path) {
      _editLogger.warn('Edit', 'file_path is deprecated, use path instead');
    }
    const resolved = resolveExecutionPath(effectivePath);

    if (!(await fileExists(resolved))) {
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

    const raw = await readFile(resolved, "utf8");
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

    // --- Dry-run path: validate without writing ---

    // --- Dry-run path: validate without writing ---
    const isDryRun = dry_run === true;
    const fileVersion = computeFileVersion(raw);

    if (isDryRun) {
      const validation = validateOperations(operations, ctx);

      if (!validation.valid) {
        // Return validation failure as dry-run diagnostics
        const dryRunDetails: Record<string, unknown> = {
          dry_run: true,
          valid: false,
          error: validation.error,
          validated_at_file_version: fileVersion,
        };
        if (validation.missingHashes) dryRunDetails.missing_hashes = validation.missingHashes;
        if (validation.ambiguousAnchors) dryRunDetails.ambiguous_anchors = validation.ambiguousAnchors;
        if (validation.lowEntropyAnchors) dryRunDetails.low_entropy_anchors = validation.lowEntropyAnchors;
        if (validation.invalidRangeOrder) dryRunDetails.invalid_range_order = validation.invalidRangeOrder;
        if (validation.auto_corrections) dryRunDetails.auto_corrections = validation.auto_corrections;
        if (validation.suggested_action) dryRunDetails.suggested_action = validation.suggested_action;

        // Compute invalidation scope for dry-run error
        const affected = computeAffectedRange(operations, ctx);
        if (affected.minLine > 0) {
          dryRunDetails.invalidation_scope = {
            anchors_valid_through: affected.minLine - 1,
            must_refresh_from_line: affected.minLine,
          };
        }

        const errTextParts: string[] = [];
        errTextParts.push(`Dry-run: validation FAILED (${validation.error})`);
        if (validation.missingHashes) errTextParts.push(`Missing hashes: [${validation.missingHashes.join(", ")}]`);
        if (validation.ambiguousAnchors) errTextParts.push(`Ambiguous anchors: ${validation.ambiguousAnchors.length}`);
        if (validation.auto_corrections) errTextParts.push(`Auto-corrections: ${validation.auto_corrections.map(c => c.detail).join("; ")}`);
        errTextParts.push(`Validated at file version: ${fileVersion}`);
        if (validation.suggested_action) errTextParts.push(`Suggestion: ${validation.suggested_action}`);

        return {
          content: [{ type: "text", text: errTextParts.join("\n") }],
          details: dryRunDetails,
        };
      }

      // Validation passed — run safety check if applicable
      const dryRunSafetyMode = safety_check ?? "strict";
      let dryRunSafetyWarnings: string[] = [];
      let dryRunSafetyStatus: "clean" | "suspicious" = "clean";

      if (dryRunSafetyMode !== "off") {
        // Simulate the edit to check safety
        let simulatedLines: string[];
        try {
          simulatedLines = applyEditOperations(lines, operations, ctx);
        } catch {
          // If simulation fails, we can't do safety check — return valid anyway
          const affected = computeAffectedRange(operations, ctx);
          return {
            content: [{ type: "text", text: `Dry-run: validation PASSED (simulation error, but anchors resolved)\nValidated at file version: ${fileVersion}` }],
            details: {
              dry_run: true,
              valid: true,
              validated_at_file_version: fileVersion,
              operations: operations.length,
              auto_corrections: validation.auto_corrections,
              invalidation_scope: affected.minLine > 0 ? {
                anchors_valid_through: affected.minLine - 1,
                must_refresh_from_line: affected.minLine,
              } : undefined,
            },
          };
        }

        const affectedMinLine = computeAffectedRange(operations, ctx).minLine;
        const sanity = runSanityChecks(lines, simulatedLines, affectedMinLine,
          Math.min(lines.length, simulatedLines.length));
        dryRunSafetyWarnings = sanity.warnings;
        dryRunSafetyStatus = sanity.status;
      }

      const affected = computeAffectedRange(operations, ctx);
      const dryRunDetails: Record<string, unknown> = {
        dry_run: true,
        valid: true,
        validated_at_file_version: fileVersion,
        operations: operations.length,
        auto_corrections: validation.auto_corrections,
        invalidation_scope: affected.minLine > 0 ? {
          anchors_valid_through: affected.minLine - 1,
          must_refresh_from_line: affected.minLine,
        } : undefined,
        safety_status: dryRunSafetyStatus,
      };

      if (dryRunSafetyWarnings.length > 0) {
        dryRunDetails.safety_warnings = dryRunSafetyWarnings;
      }

      // In strict mode with suspicious result → valid: false
      if (dryRunSafetyMode === "strict" && dryRunSafetyStatus === "suspicious") {
        const severeWarnings = dryRunSafetyWarnings.filter((w: string) => !w.startsWith("duplicate_line"));
        if (severeWarnings.length > 0) {
          dryRunDetails.valid = false;
          dryRunDetails.safety_status = "failed";
          const diagParts: string[] = [];
          diagParts.push("Dry-run: validation FAILED (safety check)");
          diagParts.push("┌─ Safety Check Diagnostics ────────────────────────────────┐");
          for (const w of dryRunSafetyWarnings) {
            diagParts.push("│ " + w);
          }
          diagParts.push("│");
          diagParts.push("│ Total: " + dryRunSafetyWarnings.length + " warning(s)");
          diagParts.push("│ Hint: review the per-operation delta and re-read before retrying.");
          diagParts.push("└──────────────────────────────────────────────────────────┘");
          diagParts.push(`Validated at file version: ${fileVersion}`);
          return {
            content: [{ type: "text", text: diagParts.join("\n") }],
            details: dryRunDetails,
          };
        }
      }

      // Dry-run success
      const okParts: string[] = [];
      okParts.push(`Dry-run: validation PASSED`);
      okParts.push(`${operations.length} operation(s) would be applied to ${resolved}.`);
      if (validation.auto_corrections && validation.auto_corrections.length > 0) {
        okParts.push(`Auto-corrections: ${validation.auto_corrections.map(c => c.detail).join("; ")}`);
      }
      okParts.push(`Validated at file version: ${fileVersion}`);
      if (dryRunSafetyWarnings.length > 0) {
        okParts.push(`Safety: ${dryRunSafetyStatus} (${dryRunSafetyWarnings.length} warning(s))`);
      }
      return {
        content: [{ type: "text", text: okParts.join("\n") }],
        details: dryRunDetails,
      };
    }

    // --- End dry-run path ---

    // 4.2: Checkpoint file before modification + track writer
    const cpm = getCheckpointManager();
    const fwt = getFileWriteTracker();
    const baselineContinuity = fwt ? fwt.getContinuity(resolved, "edit") : "clean";
    if (cpm) cpm.save(resolved, "edit");
    if (fwt) fwt.recordWrite(resolved, "edit");
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
            ? a.candidatePreviews.map((c, idx) => `  #${idx + 1} line ${c.line}: "${c.preview}"`).join("\n")
            : `  lines [${a.candidates.join(", ")}]`;
          return `  hash "${a.hash}" matches (use occurrence to select):\n${previews}`;
        }).join("\n");
        const hint = validation.error === "anchor_prefix_ambiguous"
          ? `Hint: use occurrence field to target the correct match (e.g., occurrence: 3 for #3 above).`
          : `Hint: all disambiguation levels failed. Re-read the file and use different anchors, or use occurrence to select.`;
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
      // anchor_stale — attempt recovery before rejecting
      if (expected_file_version) {
        const ss = getSnapshotStore();
        const snapshotText = ss?.lookup(resolved, expected_file_version) ?? null;

        if (snapshotText !== null) {
          // Level 1: Snapshot replay + structured diff merge
          const snapshotLines = snapshotText.split("\n");
          const { resolutionMap: snapResMap, displayIndex: snapDispIdx } = hashLines(snapshotLines);
          const snapQualities = classifyLinesWithFrequency(snapshotLines);
          const snapHashToQuality = new Map<string, LineQuality>();
          for (let i = 0; i < snapshotLines.length; i++) {
            snapHashToQuality.set(computeLineHash(snapshotLines[i]), snapQualities[i]);
          }
          const snapCtx: ResolutionContext = {
            resolutionMap: snapResMap,
            displayIndex: snapDispIdx,
            lines: snapshotLines,
            qualities: snapQualities,
            hashToQuality: snapHashToQuality,
          };

          const recovery = recoverBySnapshot(snapshotLines, lines, operations, snapCtx);
          if ("lines" in recovery) {
            const recoveredContent = recovery.lines.join("\n");
            await writeFile(resolved, recoveredContent);
            if (cpm) cpm.commit(resolved);
            const recoveredVersion = computeFileVersion(recoveredContent);
            const crossVersionWarning = undefined;
            if (ss) ss.record(resolved, recoveredVersion, recoveredContent);

            return {
              content: [{
                type: "text",
                text:
                  `Edit applied via snapshot-replay recovery (file changed since last read).\n` +
                  `${operations.length} operation(s) replayed on snapshot and merged onto current file.\n` +
                  `New file version: ${recoveredVersion}\n` +
                  `Recovery diff preview:\n${recovery.diffPreview.join("\n")}`,
              }],
              details: {
                ok: true,
                recovery_level: "snapshot_replay",
                operations: operations.length,
                file_version: recoveredVersion,
                diff_preview: recovery.diffPreview,
                baseline_continuity: baselineContinuity,
        writer_type: "edit" as WriterType,
        auto_corrections: validation.auto_corrections,
        cross_version: crossVersionWarning || undefined,
              },
            };
          }
        }

        // Level 2: Content-based anchor re-resolution
        const originalLines = snapshotText !== null
          ? snapshotText.split("\n")
          : ctx.lines;
        const originalQualities = snapshotText !== null
          ? classifyLinesWithFrequency(originalLines)
          : ctx.qualities;

        const contentRecovery = recoverByContentSearch(
          lines,
          validation.missingHashes!,
          originalLines,
          originalQualities,
          operations,
        );
        if ("resolved" in contentRecovery) {
          // Rebuild resolution context with recovered anchor positions
          const rebuiltCtx: ResolutionContext = {
            resolutionMap: ctx.resolutionMap,
            displayIndex: new Map(ctx.displayIndex),
            lines: ctx.lines,
            qualities: ctx.qualities,
            hashToQuality: ctx.hashToQuality,
          };
          for (const [hash, lineNum] of contentRecovery.resolved) {
            const rh = computeResolutionHash(ctx.lines[lineNum - 1]);
            rebuiltCtx.displayIndex.set(hash, [rh]);
            rebuiltCtx.resolutionMap.set(rh, [lineNum]);
          }
          const retry = validateOperations(operations, rebuiltCtx);
          if (retry.valid) {
            const retryResult = applyEditOperations(lines, operations, rebuiltCtx);
            const retryContent = retryResult.join("\n");
            await writeFile(resolved, retryContent);
            if (cpm) cpm.commit(resolved);
            const retryVersion = computeFileVersion(retryContent);
            const crossVersionWarning = undefined;
            if (ss) ss.record(resolved, retryVersion, retryContent);

            return {
              content: [{
                type: "text",
                text:
                  `Edit applied via content-search recovery (file changed since last read).\n` +
                  `${operations.length} operation(s) applied with re-resolved anchors.\n` +
                  `New file version: ${retryVersion}\n` +
                  (contentRecovery.warnings.length > 0
                    ? `Warnings: ${contentRecovery.warnings.join("; ")}\n`
                    : "") +
                  `Note: re-read the file to get fresh anchors for subsequent edits.`,
              }],
              details: {
                ok: true,
                recovery_level: "content_search",
                recovery_warnings: contentRecovery.warnings,
                operations: operations.length,
                file_version: retryVersion,
                baseline_continuity: baselineContinuity,
                writer_type: "edit" as WriterType,
        auto_corrections: validation.auto_corrections,
        cross_version: crossVersionWarning || undefined,
              },
            };
          }
        }
      }

      // Level 3: Recovery failed or not attempted — reject
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
      if (cpm) { try { cpm.rollback(resolved); } catch { /* best-effort rollback */ } }
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

    // Capture undo snapshot BEFORE writing (after validation passes, before first write)
    const snapshotId = computeFileVersion(raw);
    captureUndoSnapshot(resolved, raw);
    const newContent = resultLines.join("\n");
    await writeFile(resolved, newContent);

    const newFileVersion = computeFileVersion(newContent);
    const safetyMode = safety_check ?? "strict";
    let safetyWarnings: string[] = [];
    let safetyStatus: "clean" | "suspicious" = "clean";

    if (safetyMode !== "off") {
      const sanity = runSanityChecks(lines, resultLines, affectedMinLine,
        Math.min(lines.length, resultLines.length));
      safetyWarnings = sanity.warnings;
      safetyStatus = sanity.status;

      const severeWarnings = safetyWarnings.filter((w: string) => !w.startsWith("duplicate_line"));
      if (safetyStatus === "suspicious" && severeWarnings.length > 0) {
        if (safetyMode === "strict") {
          if (cpm) {
            try { cpm.rollback(resolved); } catch { /* best-effort rollback */ }
          }
          const diagParts: string[] = [];
          diagParts.push("Edit rejected: safety check failed. File rolled back.");
          diagParts.push("┌─ Safety Check Diagnostics ────────────────────────────────┐");
          for (const w of safetyWarnings) {
            diagParts.push("│ " + w);
          }
          diagParts.push("│");
          diagParts.push("│ Total: " + safetyWarnings.length + " warning(s)");
          diagParts.push("│ Hint: review the per-operation delta and re-read before retrying.");
          diagParts.push("└──────────────────────────────────────────────────────────┘");
          return {
            content: [{ type: "text", text: diagParts.join("\n") }],
            details: {
              error: "safety_check_failed",
              safety_warnings: safetyWarnings,
              baseline_continuity: baselineContinuity,
              writer_type: "edit",
              suggested_action: "re-read_file",
            },
          };
        }
        // safetyMode === "warn": continue with warnings attached
      }
    }
    if (cpm) cpm.commit(resolved);

    // T2: Check cross-version — warn if file was modified since snapshot
    let crossVersionWarning: string | undefined;
    if (expected_file_version) {
      const currentFv = computeFileVersion(newContent);
      if (currentFv !== expected_file_version) {
        crossVersionWarning = "cross_version: file was modified since snapshot, but all anchors resolved correctly.";
      }

    }
    // Post-edit syntax validation (non-blocking, informational only)
    let syntaxCheck: { valid: boolean | null; errors?: Array<{line: number; message: string}>; error?: string } | undefined;
    if (isSyntaxCheckSupported(resolved)) {
      syntaxCheck = await validateSyntax(resolved, newContent);
    }
    const ss2 = getSnapshotStore();
    if (ss2) ss2.record(resolved, newFileVersion, newContent);

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
        snapshot_id: snapshotId,
        anchors_valid_through: anchorsValidThrough,
        must_refresh_from_line: mustRefreshFromLine,
        new_anchors: diffResult.newAnchors,
        diff_preview: diffResult.diffPreview,
        safety_status: safetyStatus,
        safety_warnings: safetyWarnings,
        baseline_continuity: baselineContinuity,
        writer_type: "edit" as WriterType,
        auto_corrections: validation.auto_corrections,
        cross_version: crossVersionWarning || undefined,
        syntax_check: syntaxCheck,
      },
    };
  },
};
