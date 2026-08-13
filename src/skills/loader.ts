import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";

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

  let parsed: ParsedFrontmatter;
  try {
    parsed = parse(frontmatter) as ParsedFrontmatter;
  } catch {
    return null;
  }
  if (
    typeof parsed.name !== "string"
    || !parsed.name
    || typeof parsed.description !== "string"
    || !parsed.description
    || (
      parsed.tools !== undefined
      && (
        !Array.isArray(parsed.tools)
        || parsed.tools.some((tool) => typeof tool !== "string")
      )
    )
  ) return null;
  const description = parsed.description.replace(/\n$/, "");

  return {
    name: parsed.name,
    description,
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
