import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, resolve, relative, sep } from "node:path";

import type { AgentTool } from "@mariozechner/pi-agent-core";
import { Type } from "@mariozechner/pi-ai";

const SKIP_DIRS = new Set(["node_modules", ".git", "dist", ".next", "__pycache__", ".dscode"]);

function globToRegex(pattern: string): RegExp {
  let re = "";
  let i = 0;
  while (i < pattern.length) {
    const ch = pattern[i];
    if (ch === "*") {
      if (pattern[i + 1] === "*") {
        if (pattern[i + 2] === "/" || pattern[i + 2] === "\\") {
          re += "(.*[/\\\\])?";
          i += 3;
          continue;
        }
        if (i + 2 >= pattern.length) {
          re += ".*";
          i += 2;
          continue;
        }
      }
      re += "[^/\\\\]*";
      i++;
    } else if (ch === "?") {
      re += "[^/\\\\]";
      i++;
    } else if (ch === "." || ch === "(" || ch === ")" || ch === "+" ||
               ch === "^" || ch === "$" || ch === "{" || ch === "}" ||
               ch === "[" || ch === "]" || ch === "|") {
      re += "\\" + ch;
      i++;
    } else {
      re += ch;
      i++;
    }
  }
  return new RegExp("^" + re + "$", "i");
}

function walkDir(
  dir: string,
  baseDir: string,
  includePattern: RegExp | null,
  skipDirs: Set<string>,
  results: string[],
  maxResults: number,
): void {
  if (results.length >= maxResults) return;
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    if (results.length >= maxResults) return;
    if (skipDirs.has(name)) continue;
    const fullPath = join(dir, name);
    let stat;
    try {
      stat = statSync(fullPath);
    } catch {
      continue;
    }
    if (stat.isDirectory()) {
      walkDir(fullPath, baseDir, includePattern, skipDirs, results, maxResults);
    } else if (stat.isFile()) {
      const rel = relative(baseDir, fullPath);
      if (!includePattern || includePattern.test(rel)) {
        results.push(fullPath);
      }
    }
  }
}

function globToFilenamePattern(glob: string): RegExp {
  return globToRegex(glob);
}

const grepParams = Type.Object({
  pattern: Type.String({ description: "Search pattern (regex)" }),
  path: Type.Optional(Type.String({ description: "Directory to search (default: cwd)" })),
  include: Type.Optional(Type.String({ description: "File glob filter, e.g. '*.ts'" })),
  maxResults: Type.Optional(Type.Number({ description: "Max results (default 50)" })),
});

export const grepTool: AgentTool<typeof grepParams> = {
  name: "grep",
  label: "Search content",
  description: "Search file contents by pattern (regex). Returns matching lines with file paths.",
  parameters: grepParams,
  execute: async (_id, { pattern, path, include, maxResults }) => {
    const dir = resolve(path ?? process.cwd());
    const max = maxResults ?? 50;

    if (!existsSync(dir)) {
      return {
        content: [{ type: "text", text: `Error: directory not found: ${dir}` }],
        details: { error: "not_found" },
      };
    }

    const includeRe = include ? globToFilenamePattern(include) : null;
    const files: string[] = [];
    walkDir(dir, dir, includeRe, SKIP_DIRS, files, max);

    let regex: RegExp;
    try {
      regex = new RegExp(pattern, "g");
    } catch {
      return {
        content: [{ type: "text", text: `Error: invalid regex pattern: ${pattern}` }],
        details: { error: "invalid_pattern" },
      };
    }

    const results: string[] = [];
    outer:
    for (const file of files) {
      if (results.length >= max) break;
      let content: string;
      try {
        const stat = statSync(file);
        if (stat.size > 512 * 1024) continue;
        content = readFileSync(file, "utf8");
      } catch {
        continue;
      }
      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (results.length >= max) break outer;
        regex.lastIndex = 0;
        if (regex.test(lines[i])) {
          const rel = relative(dir, file);
          const displayName = rel.includes(sep) ? rel : file;
          results.push(`${displayName}:${i + 1}: ${lines[i].trim().slice(0, 200)}`);
        }
      }
    }

    return {
      content: [{ type: "text", text: results.length > 0 ? results.join("\n") : "(no matches)" }],
      details: { matchCount: results.length },
    };
  },
};

const globParams = Type.Object({
  pattern: Type.String({ description: "Glob pattern, e.g. 'src/**/*.ts'" }),
  cwd: Type.Optional(Type.String({ description: "Base directory (default: project root)" })),
});

export const globTool: AgentTool<typeof globParams> = {
  name: "glob",
  label: "Find files",
  description: "Find files matching a glob pattern.",
  parameters: globParams,
  execute: async (_id, { pattern, cwd: cwdArg }) => {
    const dir = resolve(cwdArg ?? process.cwd());

    if (!existsSync(dir)) {
      return {
        content: [{ type: "text", text: `Error: directory not found: ${dir}` }],
        details: { error: "not_found" },
      };
    }

    const regex = globToRegex(pattern);
    const results: string[] = [];
    walkDir(dir, dir, regex, SKIP_DIRS, results, 200);

    const display = results.map((f) => {
      const rel = relative(dir, f);
      return rel.includes(sep) ? rel : f;
    });

    return {
      content: [{ type: "text", text: display.length > 0 ? display.join("\n") : "(no matches)" }],
      details: { count: display.length },
    };
  },
};
