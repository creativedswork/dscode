import { execSync } from "node:child_process";
import { resolve } from "node:path";

import type { AgentTool } from "@mariozechner/pi-agent-core";
import { Type } from "@mariozechner/pi-ai";

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
    const includeFlag = include ? `--include='${include}'` : "";

    try {
      const cmd = `grep -rn ${includeFlag} --exclude-dir=node_modules --exclude-dir=.git -m ${max} '${pattern.replace(/'/g, "'\\''")}' '${dir}' 2>/dev/null | head -${max}`;
      const result = execSync(cmd, { encoding: "utf8", timeout: 15000, maxBuffer: 512 * 1024 });
      return {
        content: [{ type: "text", text: result.trim() || "(no matches)" }],
        details: { matchCount: result.trim().split("\n").filter(Boolean).length },
      };
    } catch {
      return {
        content: [{ type: "text", text: "(no matches)" }],
        details: { matchCount: 0 },
      };
    }
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
    try {
      const cmd = `find '${dir}' -path '*/${pattern.replace(/\*\*/g, "*")}' -not -path '*/node_modules/*' -not -path '*/.git/*' 2>/dev/null | head -200`;
      const result = execSync(cmd, { encoding: "utf8", timeout: 10000 });
      const files = result.trim();
      return {
        content: [{ type: "text", text: files || "(no matches)" }],
        details: { count: files.split("\n").filter(Boolean).length },
      };
    } catch {
      return {
        content: [{ type: "text", text: "(no matches)" }],
        details: { count: 0 },
      };
    }
  },
};
