/**
 * edit_undo tool — restores a file to its pre-edit state.
 *
 * Uses the in-memory undo snapshot store.
 * After restoring, the snapshot is cleared.
 * Returns a diff with new anchor hashes and a stale-anchor warning.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";

import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "@earendil-works/pi-ai";
import { resolveExecutionPath } from "../../kernel/execution-context.js";

import {
  computeLineHash,
  computeFileVersion,
  classifyLinesWithFrequency,
  formatHashedLine,
} from "./hash.js";

import {
  getUndoSnapshot,
  clearUndoSnapshot,
  hasUndoSnapshot,
} from "./undo-store.js";

const editUndoParams = Type.Object({
  path: Type.String({ description: "Absolute path of the file to undo the last edit on" }),
});

export const editUndoTool: AgentTool<typeof editUndoParams> = {
  name: "edit_undo",
  label: "Undo last edit on a file",
  description:
    "Restores a file to its pre-edit state after an edit operation. " +
    "Only works for the most recent edit — calling edit again overwrites the undo snapshot. " +
    "Dry-run calls do not create undo snapshots. " +
    "Returns a diff with new anchor hashes and warns that all previous anchors are stale.",
  parameters: editUndoParams,
  execute: async (_id, { path }) => {
    const resolved = resolveExecutionPath(path);

    if (!existsSync(resolved)) {
      return {
        content: [{ type: "text", text: `Error: file not found: ${resolved}` }],
        details: { error: "not_found", suggested_action: "check_path" },
      };
    }

    if (!hasUndoSnapshot(resolved)) {
      return {
        content: [{
          type: "text",
          text:
            `Error: no undo snapshot available for ${resolved}.\n` +
            `An undo snapshot is captured before each successful edit call. ` +
            `It is cleared after undo or when a new edit is made on the same file. ` +
            `Dry-run calls do not capture snapshots.`,
        }],
        details: {
          restored: false,
          error: "no_snapshot",
          suggested_action: "no_undo_available",
        },
      };
    }

    const snapshotContent = getUndoSnapshot(resolved)!;
    const currentRaw = readFileSync(resolved, "utf8");

    // Only undo if the file actually changed
    if (snapshotContent === currentRaw) {
      clearUndoSnapshot(resolved);
      return {
        content: [{
          type: "text",
          text:
            `Undo skipped: file ${resolved} already matches the pre-edit snapshot (unchanged).\n` +
            `Snapshot cleared.`,
        }],
        details: {
          restored: true,
          file_version: computeFileVersion(currentRaw),
          unchanged: true,
        },
      };
    }

    // Restore the file
    writeFileSync(resolved, snapshotContent);
    clearUndoSnapshot(resolved);

    const restoredVersion = computeFileVersion(snapshotContent);

    // Generate diff between corrupted (current) and restored (snapshot) content
    const currentLines = currentRaw.split("\n");
    const restoredLines = snapshotContent.split("\n");
    const restoredQualities = classifyLinesWithFrequency(restoredLines);

    const diffParts: string[] = [];
    diffParts.push("--- file (before undo)");
    diffParts.push("+++ file (after undo)");

    const maxLines = Math.max(currentLines.length, restoredLines.length);
    const newAnchorStrs: string[] = [];

    for (let i = 0; i < maxLines; i++) {
      const lineNum = i + 1;
      const inCurrent = i < currentLines.length;
      const inRestored = i < restoredLines.length;

      if (inCurrent && inRestored && currentLines[i] === restoredLines[i]) {
        // Unchanged line
        const hash = computeLineHash(restoredLines[i]);
        const quality = restoredQualities[i];
        diffParts.push(` ${formatHashedLine(lineNum, hash, restoredLines[i], quality)}`);
        newAnchorStrs.push(`${lineNum}#${hash}`);
      } else {
        // Changed: show removed and added
        if (inCurrent) {
          const hash = computeLineHash(currentLines[i]);
          diffParts.push(`-${lineNum}#${hash}|${currentLines[i]}`);
        }
        if (inRestored) {
          const hash = computeLineHash(restoredLines[i]);
          const quality = restoredQualities[i];
          diffParts.push(`+${formatHashedLine(lineNum, hash, restoredLines[i], quality)}`);
          newAnchorStrs.push(`${lineNum}#${hash}`);
        }
      }
    }

    const summaryParts: string[] = [
      `Undo applied: restored ${resolved} to pre-edit state.`,
      `New file version: ${restoredVersion}`,
      ``,
      `Diff (corrupted → restored):`,
      diffParts.join("\n"),
      ``,
      `⚠️  ANCHORS INVALIDATED — ALL previous anchors for this file are stale.`,
      `Re-read with read_file({ path: "${path}", hashes: true }) before further edits.`,
    ];

    return {
      content: [{ type: "text", text: summaryParts.join("\n") }],
      details: {
        restored: true,
        file_version: restoredVersion,
        new_anchors: newAnchorStrs,
        stale_anchor_warning: true,
        hint: `All previous hash anchors are invalid. Re-read with read_file({ path: "${path}", hashes: true }) before calling edit.`,
      },
    };
  },
};
