import { readFileSync, writeFileSync, existsSync, statSync, readdirSync, mkdirSync } from "node:fs";
import { join, resolve, dirname } from "node:path";

import type { AgentTool } from "@mariozechner/pi-agent-core";
import { Type } from "@mariozechner/pi-ai";

import {
  computeLineHash,
  computeFileVersion,
  formatHashedLine,
  ANCHOR_FORMAT_VERSION,
  classifyLinesWithFrequency,
} from "./edit/hash.js";
import { getCheckpointManager, getFileWriteTracker, getSnapshotStore } from "../checkpoint/index.js";

const readFileParams = Type.Object({
  path: Type.String({ description: "Absolute file path to read" }),
  offset: Type.Optional(Type.Number({ description: "Start line (0-indexed)" })),
  limit: Type.Optional(Type.Number({ description: "Number of lines to read, default 200" })),
  hashes: Type.Optional(Type.Boolean({ description: "Enable anchor mode: prefix each line with 'N#XXXXXX [quality]|' where XXXXXX is a 6-char content-only hash for use with the edit tool. Also returns file_version, anchor_format_version, and recommended_anchors." })),
});

export const readFileTool: AgentTool<typeof readFileParams> = {
  name: "read_file",
  label: "Read file",
  description:
    "Read the contents of a file. Returns numbered lines. " +
    "When hashes:true, each line is prefixed with 'lineNum#hash [quality]|' where the hash is a content-based identity — " +
    "the line number is advisory (snapshot position) only, and the hash is the authoritative identity for edit operations. " +
    "Quality annotations: [high] = good for edit targeting, [med] = usable but repeated, [low] = avoid as primary anchor.",
  parameters: readFileParams,
  execute: async (_id, { path, offset, limit, hashes }) => {
    const resolved = resolve(path);
    if (!existsSync(resolved)) {
      return {
        content: [{ type: "text", text: `Error: file not found: ${resolved}` }],
        details: { error: "not_found" },
      };
    }
    const stat = statSync(resolved);
    if (stat.size > 2 * 1024 * 1024) {
      return {
        content: [{ type: "text", text: `Error: file too large (${stat.size} bytes)` }],
        details: { error: "too_large" },
      };
    }
    const raw = readFileSync(resolved, "utf8");
    const lines = raw.split("\n");
    const start = offset ?? 0;
    const count = limit ?? 200;
    const slice = lines.slice(start, start + count);
    const useHashes = hashes === true;

    let numbered: string;
    let recommendedAnchors: string[] | undefined;

    if (useHashes) {
      const qualities = classifyLinesWithFrequency(lines);
      const sliceQualities = qualities.slice(start, start + count);
      const highIndices: number[] = [];
      for (let i = 0; i < qualities.length; i++) {
        if (qualities[i] === "high") highIndices.push(i);
      }
      const maxRec = 20;
      const step = Math.max(1, Math.floor(highIndices.length / maxRec));
      recommendedAnchors = [];
      for (let i = 0; i < highIndices.length && recommendedAnchors.length < maxRec; i += step) {
        const idx = highIndices[i];
        recommendedAnchors.push(`${idx + 1}#${computeLineHash(lines[idx])}`);
      }

      numbered = slice.map((l, i) => {
        const lineNum = start + i + 1;
        const hash = computeLineHash(l);
        const quality = sliceQualities[i];
        return formatHashedLine(lineNum, hash, l, quality);
      }).join("\n");
    } else {
      numbered = slice.map((l, i) => `${start + i + 1}\t${l}`).join("\n");
    }

    const parts: string[] = [numbered];

    if (useHashes) {
      const fileVersion = computeFileVersion(raw);
      parts.push(`\n[file_version: ${fileVersion}]`);
      parts.push(`\n(${lines.length} lines total, showing ${start + 1}-${start + slice.length}${useHashes ? ", anchors enabled" : ""})`);
    }

    return {
      content: [{ type: "text", text: parts.join("") }],
      details: {
        lines: lines.length,
        shown: slice.length,
        hashes: useHashes || undefined,
        file_version: useHashes ? computeFileVersion(raw) : undefined,
        anchor_format_version: useHashes ? ANCHOR_FORMAT_VERSION : undefined,
        recommended_anchors: useHashes ? recommendedAnchors : undefined,
        is_dirty: useHashes ? (getCheckpointManager()?.isDirty(resolved) ?? false) : undefined,
        last_writer: useHashes ? (getFileWriteTracker()?.getWriter(resolved) ?? null) : undefined,
      },
    };
  },
};

const listFilesParams = Type.Object({
  path: Type.String({ description: "Absolute directory path" }),
  recursive: Type.Optional(Type.Boolean({ description: "Recurse into subdirectories (default false)" })),
  maxDepth: Type.Optional(Type.Number({ description: "Max recursion depth (default 3)" })),
});

export const listFilesTool: AgentTool<typeof listFilesParams> = {
  name: "list_files",
  label: "List files",
  description: "List files and directories at a given path.",
  parameters: listFilesParams,
  execute: async (_id, { path, recursive, maxDepth }) => {
    const resolved = resolve(path);
    if (!existsSync(resolved)) {
      return {
        content: [{ type: "text", text: `Error: directory not found: ${resolved}` }],
        details: { error: "not_found" },
      };
    }
    const SKIP = new Set(["node_modules", ".git", "dist", ".next", "__pycache__"]);
    const results: string[] = [];
    const maxD = maxDepth ?? 3;

    function walk(dir: string, depth: number): void {
      if (depth > maxD || results.length >= 500) return;
      const entries = readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (SKIP.has(entry.name)) continue;
        const rel = join(dir, entry.name).slice(resolved.length + 1) || entry.name;
        results.push(entry.isDirectory() ? `${rel}/` : rel);
        if (entry.isDirectory() && recursive) {
          walk(join(dir, entry.name), depth + 1);
        }
      }
    }

    walk(resolved, 0);
    const text = results.length > 0 ? results.join("\n") : "(empty directory)";
    return {
      content: [{ type: "text", text }],
      details: { count: results.length },
    };
  },
};

const writeFileParams = Type.Object({
  path: Type.String({ description: "Absolute file path to write" }),
  content: Type.String({ description: "Complete file content" }),
  expected_file_version: Type.Optional(Type.String({ description: "If set, the write is rejected unless the current file version matches this value. Obtain this from read_file(hashes: true) output. Required when overwriting an existing file; omitted only for new files." })),
});

export const writeFileTool: AgentTool<typeof writeFileParams> = {
  name: "write_file",
  label: "Write file",
  description:
    "Write content to a file (creates or overwrites). " +
    "For existing files, you MUST provide expected_file_version (obtained from read_file(hashes: true)) " +
    "to prevent accidental overwrites of changes made by other tools or users. " +
    "For new files, omit expected_file_version. " +
    "Prefer using the edit tool for partial modifications to existing files — whole-file rewrite is an explicit, high-risk operation.",
  parameters: writeFileParams,
  execute: async (_id, { path, content, expected_file_version }) => {
    const resolved = resolve(path);
    const fileExists = existsSync(resolved);

    if (fileExists && expected_file_version) {
      const currentRaw = readFileSync(resolved, "utf8");
      const currentVersion = computeFileVersion(currentRaw);
      if (currentVersion !== expected_file_version) {
        return {
          content: [
            {
              type: "text",
              text:
                `Write rejected: file version mismatch for ${resolved}.\n` +
                `Expected version: ${expected_file_version}\n` +
                `Current version:  ${currentVersion}\n` +
                `The file has been modified since you last read it.\n` +
                `Hint: re-read the file with read_file(hashes: true) to get the current version and anchors, then retry.`,
            },
          ],
          details: {
            error: "write_conflict",
            expected_file_version,
            current_file_version: currentVersion,
            suggested_action: "re-read_file",
          },
        };
      }
    }

    const dir = dirname(resolved);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    // 4.2: Checkpoint before write + track writer
    const cpm = getCheckpointManager();
    const fwt = getFileWriteTracker();
    const baselineContinuity = fwt ? fwt.getContinuity(resolved, "write_file") : "clean";
    if (cpm) cpm.save(resolved, "write_file");
    if (fwt) fwt.recordWrite(resolved, "write_file");

    writeFileSync(resolved, content);
    if (cpm) cpm.commit(resolved);
    const bytes = Buffer.byteLength(content, "utf8");
    const newFileVersion = computeFileVersion(content);
    const ss = getSnapshotStore();
    if (ss) {
      ss.invalidate(resolved);
      ss.record(resolved, newFileVersion, content);
    }

    const newLines = content.split("\n");
    const previewLimit = Math.min(newLines.length, 50);
    const newQualities = classifyLinesWithFrequency(newLines);
    const newAnchors = newLines.slice(0, previewLimit)
      .map((l, i) => `${i + 1}#${computeLineHash(l)}`);
    const anchorPreview = newLines.slice(0, previewLimit)
      .map((l, i) => formatHashedLine(i + 1, computeLineHash(l), l, newQualities[i]))
      .join("\n");

    const responseParts: string[] = [
      `Written ${bytes} bytes to ${resolved}`,
      `New file version: ${newFileVersion}`,
    ];

    if (newLines.length > 0) {
      responseParts.push(
        `\nNew anchors preview${newLines.length > previewLimit ? ` (first ${previewLimit} of ${newLines.length} lines)` : ""}:`,
        anchorPreview,
      );

      if (newLines.length > previewLimit) {
        responseParts.push(`... (${newLines.length - previewLimit} more lines)`);
      }

      responseParts.push(
        "\nNote: use these new anchors or re-read for full file. Previous anchors are invalid."
      );
    }

    return {
      content: [{ type: "text", text: responseParts.join("\n") }],
      details: {
        ok: true,
        bytes,
        path: resolved,
        file_version: newFileVersion,
        lines: newLines.length,
        baseline_continuity: baselineContinuity,
        writer_type: "write_file",
        new_anchors: newAnchors,
      },
    };
  },
};

const overwriteFileParams = Type.Object({
  path: Type.String({ description: "Absolute file path to overwrite" }),
  content: Type.String({ description: "Complete new file content" }),
  expected_file_version: Type.String({ description: "Current file version from last read_file(hashes: true). Required to confirm you are overwriting the version you intend to replace." }),
});

export const overwriteFileTool: AgentTool<typeof overwriteFileParams> = {
  name: "overwrite_file",
  label: "Overwrite file (full replace)",
  description:
    "Explicitly overwrite an entire existing file with new content. " +
    "REQUIRES expected_file_version from read_file(hashes: true) — this is mandatory to prevent accidental data loss. " +
    "For partial modifications, prefer the edit tool. " +
    "For new files, use write_file without expected_file_version.",
  parameters: overwriteFileParams,
  execute: async (_id, { path, content, expected_file_version }) => {
    const resolved = resolve(path);

    if (!existsSync(resolved)) {
      return {
        content: [
          {
            type: "text",
            text: `Error: file not found: ${resolved}. Use write_file for new files, or overwrite_file only for existing files.`,
          },
        ],
        details: { error: "not_found", suggested_action: "use_write_file" },
      };
    }

    const currentRaw = readFileSync(resolved, "utf8");
    const currentVersion = computeFileVersion(currentRaw);
    if (currentVersion !== expected_file_version) {
      return {
        content: [
          {
            type: "text",
            text:
              `Overwrite rejected: file version mismatch for ${resolved}.\n` +
              `Expected version: ${expected_file_version}\n` +
              `Current version:  ${currentVersion}\n` +
              `Hint: the file has been modified since you last read it. ` +
              `Re-read with read_file(hashes: true) to get the current version and anchors, then retry.`,
          },
        ],
        details: {
          error: "overwrite_conflict",
          expected_file_version,
          current_file_version: currentVersion,
          suggested_action: "re-read_file",
        },
      };
    }

    const dir = dirname(resolved);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    // 4.2: Checkpoint before overwrite + track writer
    const cpm2 = getCheckpointManager();
    const fwt2 = getFileWriteTracker();
    const bc = fwt2 ? fwt2.getContinuity(resolved, "overwrite_file") : "clean";
    if (cpm2) cpm2.save(resolved, "overwrite_file");
    if (fwt2) fwt2.recordWrite(resolved, "overwrite_file");

    writeFileSync(resolved, content);
    if (cpm2) cpm2.commit(resolved);
    const bytes = Buffer.byteLength(content, "utf8");
    const newFileVersion = computeFileVersion(content);
    const ss2 = getSnapshotStore();
    if (ss2) {
      ss2.invalidate(resolved);
      ss2.record(resolved, newFileVersion, content);
    }

    const newLines = content.split("\n");
    const previewLimit = Math.min(newLines.length, 50);
    const newQualities = classifyLinesWithFrequency(newLines);
    const newAnchors = newLines.slice(0, previewLimit)
      .map((l, i) => `${i + 1}#${computeLineHash(l)}`);
    const anchorPreview = newLines.slice(0, previewLimit)
      .map((l, i) => formatHashedLine(i + 1, computeLineHash(l), l, newQualities[i]))
      .join("\n");

    const responseParts: string[] = [
      `Written ${bytes} bytes to ${resolved}`,
      `New file version: ${newFileVersion}`,
      `\nNew anchors preview${newLines.length > previewLimit ? ` (first ${previewLimit} of ${newLines.length} lines)` : ""}:`,
      anchorPreview,
    ];

    if (newLines.length > previewLimit) {
      responseParts.push(`... (${newLines.length - previewLimit} more lines)`);
    }

    return {
      content: [{ type: "text", text: responseParts.join("\n") }],
      details: {
        ok: true,
        bytes,
        path: resolved,
        file_version: newFileVersion,
        lines: newLines.length,
        baseline_continuity: bc,
        writer_type: "overwrite_file",
        new_anchors: newAnchors,
      },
    };
  },
};
