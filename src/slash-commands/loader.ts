import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { parse } from "yaml";

import type { CommandManifest } from "./types.js";

export function scanCommandDirs(userDir: string, projectDir: string): CommandManifest[] {
  const manifests = new Map<string, CommandManifest>();

  for (const manifest of scanDir(userDir, "user")) {
    manifests.set(manifest.name, manifest);
  }
  for (const manifest of scanDir(projectDir, "project")) {
    manifests.set(manifest.name, manifest);
  }

  return Array.from(manifests.values());
}

function scanDir(baseDir: string, source: "user" | "project"): CommandManifest[] {
  if (!existsSync(baseDir)) return [];
  return walkDir(baseDir, source, baseDir);
}

function walkDir(dir: string, source: "user" | "project", baseDir: string): CommandManifest[] {
  const results: CommandManifest[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }

  for (const name of entries) {
    // Skip hidden files/dirs
    if (name.startsWith(".")) continue;

    const fullPath = join(dir, name);
    let stat;
    try {
      stat = statSync(fullPath);
    } catch {
      continue;
    }

    if (stat.isDirectory()) {
      results.push(...walkDir(fullPath, source, baseDir));
    } else if (stat.isFile() && name.endsWith(".md")) {
      const relPath = relative(baseDir, fullPath);
      // Derive command name from relative path:
      // "opsx/apply.md" → "opsx:apply", "code-review.md" → "code-review"
      const derivedName = relPath.replace(/\.md$/, "").replace(/\//g, ":");
      const manifest = parseCommandFile(fullPath, source, derivedName);
      if (manifest) results.push(manifest);
    }
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

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/\s+/g, "");
}

export function parseCommandFile(
  filePath: string,
  source: "user" | "project",
  derivedName: string,
): CommandManifest | null {
  let raw: string;
  try {
    const buf = readFileSync(filePath);
    raw = stripBomAndDecode(buf);
  } catch {
    return null;
  }

  // Must start with "---"
  if (!raw.startsWith("---")) return null;

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

  // description is required
  if (typeof parsed.description !== "string" || !parsed.description) {
    return null;
  }
  parsed.description = parsed.description.replace(/\n$/, "");
  if (parsed.name !== undefined && typeof parsed.name !== "string") {
    return null;
  }

  // name is optional: if present, must match derived name (sanity check)
  if (parsed.name !== undefined && normalizeName(parsed.name) !== normalizeName(derivedName)) {
    console.warn(
      `[commands] Skipping ${filePath}: frontmatter name "${parsed.name}" does not match path-derived name "${derivedName}"`,
    );
    return null;
  }

  return {
    name: derivedName,
    description: parsed.description,
    body,
    source,
    path: filePath,
  };
}

interface ParsedFrontmatter {
  name?: string;
  description?: string;
}
