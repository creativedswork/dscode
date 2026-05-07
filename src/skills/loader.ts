import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import type { SkillManifest } from "../core/types.js";

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

export function parseSkillManifest(filePath: string, source: "user" | "project"): SkillManifest | null {
  let raw: string;
  try {
    raw = readFileSync(filePath, "utf8");
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
