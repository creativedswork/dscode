import { readFileSync, writeFileSync, existsSync, statSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

import type { AgentTool } from "@mariozechner/pi-agent-core";
import { Type } from "@mariozechner/pi-ai";

import { computeLineHash, formatHashedLine } from "./edit.js";

const readFileParams = Type.Object({
  path: Type.String({ description: "Absolute file path to read" }),
  offset: Type.Optional(Type.Number({ description: "Start line (0-indexed)" })),
  limit: Type.Optional(Type.Number({ description: "Number of lines to read, default 200" })),
  hashes: Type.Optional(Type.Boolean({ description: "Enable hashline mode: prefix each line with 'N:XXXX|' where XXXX is a content hash for use with the edit tool" })),
});

export const readFileTool: AgentTool<typeof readFileParams> = {
  name: "read_file",
  label: "Read file",
  description: "Read the contents of a file. Returns numbered lines.",
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
    const numbered = useHashes
      ? slice.map((l, i) => {
          const lineNum = start + i + 1;
          const hash = computeLineHash(l, lineNum);
          return formatHashedLine(lineNum, hash, l);
        }).join("\n")
      : slice.map((l, i) => `${start + i + 1}\t${l}`).join("\n");
    const result = slice.length < lines.length
      ? (useHashes
          ? `${numbered}\n\n(${lines.length} lines total, showing ${start + 1}-${start + slice.length}, hashes enabled)`
          : `${numbered}\n\n(${lines.length} lines total, showing ${start + 1}-${start + slice.length})`)
      : numbered;
    return {
      content: [{ type: "text", text: result }],
      details: { lines: lines.length, shown: slice.length, hashes: useHashes || undefined },
    };
  },
};

const writeFileParams = Type.Object({
  path: Type.String({ description: "Absolute file path to write" }),
  content: Type.String({ description: "Complete file content" }),
});

export const writeFileTool: AgentTool<typeof writeFileParams> = {
  name: "write_file",
  label: "Write file",
  description: "Write content to a file (creates or overwrites).",
  parameters: writeFileParams,
  execute: async (_id, { path, content }) => {
    const resolved = resolve(path);
    writeFileSync(resolved, content);
    const bytes = Buffer.byteLength(content, "utf8");
    return {
      content: [{ type: "text", text: `Written ${bytes} bytes to ${resolved}` }],
      details: { bytes, path: resolved },
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
