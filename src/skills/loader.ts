import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import type { SkillManifest } from "./types.js";

export function scanSkillDirs(userDir: string, projectDir: string): SkillManifest[] {
  const manifests = new Map<string, SkillManifest>();

  for (const manifest of scanDir(userDir, "user")) {
    manifests.set(manifest.name, manifest);
  }
  for (const manifest of scanDir(projectDir, "project")) {
    manifests.set(manifest.name, manifest);
  }

  return Array.from(manifests.values());
}

function scanDir(dir: string, source: "user" | "project"): SkillManifest[] {
  if (!existsSync(dir)) return [];

  const results: SkillManifest[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }

  for (const name of entries) {
    const fullPath = join(dir, name);
    const skillMdPath = join(fullPath, "SKILL.md");
    if (!existsSync(skillMdPath)) continue;

    const manifest = parseSkillManifest(skillMdPath, source);
    if (manifest) results.push(manifest);
  }

  return results;
}

function stripBomAndDecode(buf: Buffer): string {
  if (buf.length >= 3 && buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) {
    return buf.subarray(3).toString("utf8");
  }
  if (buf.length >= 2 && buf[0] === 0xFF && buf[1] === 0xFE) {
    return buf.subarray(2).toString("utf16le");
  }
  if (buf.length >= 2 && buf[0] === 0xFE && buf[1] === 0xFF) {
    return buf.subarray(2).swap16().toString("utf16le");
  }
  return buf.toString("utf8");
}

export function parseSkillManifest(filePath: string, source: "user" | "project"): SkillManifest | null {
  let raw: string;
  try {
    const buf = readFileSync(filePath);
    raw = stripBomAndDecode(buf);
  } catch {
    return null;
  }

  const parts = raw.split(/^---\s*$/m);
  if (parts.length < 3) return null;

  const frontmatter = parts[1];
  const body = parts.slice(2).join("---").trim();

  const parsed = parseFrontmatter(frontmatter);
  if (!parsed.name || !parsed.description) return null;

  return {
    name: parsed.name,
    description: parsed.description,
    tools: parsed.tools,
    instructions: body || undefined,
    source,
    path: filePath,
  };
}

interface ParsedFrontmatter {
  name?: string;
  description?: string;
  tools?: string[];
}

function parseFrontmatter(text: string): ParsedFrontmatter {
  const result: ParsedFrontmatter = {};
  const lines = text.split("\n");

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    const nameMatch = line.match(/^name:\s*(.+)/);
    if (nameMatch) {
      result.name = unquote(nameMatch[1].trim());
      i++;
      continue;
    }

    // YAML block scalar: description: >  or  description: |  (with optional chomp: -/+)
    const blockDescMatch = line.match(/^description:\s*([>|][-+]?)\s*$/);
    if (blockDescMatch) {
      const style = blockDescMatch[1];
      const { value, endIdx } = consumeBlockScalar(lines, i + 1, style);
      result.description = value;
      i = endIdx;
      continue;
    }

    // Plain single-line description
    const descMatch = line.match(/^description:\s*(.+)/);
    if (descMatch) {
      result.description = unquote(descMatch[1].trim());
      i++;
      continue;
    }

    if (line.match(/^tools:\s*$/)) {
      i++;
      result.tools = parseToolsList(lines, i);
      while (i < lines.length && (lines[i].startsWith("  ") || lines[i].startsWith("\t") || lines[i].trim() === "")) {
        i++;
      }
      continue;
    }

    // Inline tools list: tools: [read_file, bash]
    const inlineToolsMatch = line.match(/^tools:\s*\[(.*)\]/);
    if (inlineToolsMatch) {
      result.tools = inlineToolsMatch[1].split(",").map((s) => s.trim()).filter(Boolean);
      i++;
      continue;
    }

    i++;
  }

  return result;
}

/**
 * Consume a YAML block scalar value.
 *
 * Block scalars are multi-line values indicated by `>` (folded) or `|` (literal)
 * on the header line, optionally followed by a chomping indicator (`-` or `+`).
 *
 * - `>`  folded: single newlines become spaces; blank lines become paragraph breaks (\n)
 * - `|`  literal: all newlines preserved as-is
 * - `>-` / `|-`  strip: remove trailing blank lines
 * - `>+` / `|+`  keep: preserve all trailing blank lines
 * - default (no indicator): clip — single trailing newline
 */
function consumeBlockScalar(
  lines: string[],
  startIdx: number,
  style: string,
): { value: string; endIdx: number } {
  const isFolded = style.startsWith(">");
  const chomp = style.length > 1 ? style[style.length - 1] : undefined;

  // Collect all content lines (indented or blank)
  const contentLines: string[] = [];
  let i = startIdx;

  while (i < lines.length) {
    const ln = lines[i];

    // Blank lines (including whitespace-only) are always part of the block
    if (ln.trim() === "") {
      contentLines.push("");
      i++;
      continue;
    }

    // Non-blank lines must be indented (2+ spaces or tab) relative to parent
    if (ln.startsWith("  ") || ln.startsWith("\t")) {
      contentLines.push(ln.replace(/^[ \t]+/, ""));
      i++;
      continue;
    }

    // Non-indented, non-blank line → block ends
    break;
  }

  // Build value from content lines
  let value: string;
  if (isFolded) {
    value = foldLines(contentLines);
  } else {
    value = contentLines.join("\n");
  }

  // Apply chomping
  if (chomp === "-") {
    value = value.replace(/\n+$/, "");
  } else if (chomp === "+") {
    // Keep all trailing newlines — already intact
  } else {
    // Default clip: single trailing newline, then trim trailing whitespace
    value = value.replace(/\n+$/, "");
  }

  return { value: chomp === "+" ? value : value.trim(), endIdx: i };
}

/** Fold a sequence of lines according to YAML folded block scalar rules:
 *  single newlines collapse to spaces; blank lines separate paragraphs. */
function foldLines(lines: string[]): string {
  const paragraphs: string[] = [];
  let currentPara: string[] = [];

  for (const ln of lines) {
    if (ln.trim() === "") {
      if (currentPara.length > 0) {
        paragraphs.push(currentPara.join(" "));
        currentPara = [];
      }
    } else {
      currentPara.push(ln);
    }
  }

  if (currentPara.length > 0) {
    paragraphs.push(currentPara.join(" "));
  }

  return paragraphs.join("\n");
}

function parseToolsList(lines: string[], startIdx: number): string[] {
  const tools: string[] = [];
  let i = startIdx;

  while (i < lines.length) {
    const line = lines[i];
    if (!line.startsWith("  ") && !line.startsWith("\t") && line.trim() !== "") break;

    // Match: - tool_name or - "tool_name"
    const itemMatch = line.match(/^\s*-\s*(?:"([^"]*)"|'([^']*)'|([\w-]+))/);
    if (itemMatch) {
      const toolName = itemMatch[1] ?? itemMatch[2] ?? itemMatch[3];
      if (toolName) {
        tools.push(toolName);
      }
    }

    i++;
  }

  return tools;
}

function unquote(s: string): string {
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1);
  }
  return s;
}
