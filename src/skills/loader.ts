import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import type { SkillManifest, SkillToolDef } from "../core/types.js";

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

    const manifest = parseSkillMd(skillMdPath, source);
    if (manifest) results.push(manifest);
  }

  return results;
}

export function parseSkillMd(filePath: string, source: "user" | "project"): SkillManifest | null {
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
  tools?: SkillToolDef[];
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
      // skip past tools block
      while (i < lines.length && (lines[i].startsWith("  ") || lines[i].startsWith("\t") || lines[i].trim() === "")) {
        i++;
      }
      continue;
    }

    i++;
  }

  return result;
}

function parseToolsList(lines: string[], startIdx: number): SkillToolDef[] {
  const tools: SkillToolDef[] = [];
  let i = startIdx;

  while (i < lines.length) {
    const line = lines[i];
    if (!line.startsWith("  ") && !line.startsWith("\t") && line.trim() !== "") break;

    const itemMatch = line.match(/^\s+-\s+name:\s*(.+)/);
    if (itemMatch) {
      const tool: SkillToolDef = {
        name: unquote(itemMatch[1].trim()),
        description: "",
        parameters: {},
        command: "",
      };
      i++;

      while (i < lines.length) {
        const tl = lines[i];
        if (tl.match(/^\s+-\s+name:/)) break;
        if (!tl.startsWith("    ") && !tl.startsWith("\t\t") && tl.trim() !== "") break;

        const descMatch = tl.match(/^\s+description:\s*(.+)/);
        if (descMatch) {
          tool.description = unquote(descMatch[1].trim());
          i++;
          continue;
        }

        const cmdMatch = tl.match(/^\s+command:\s*(.+)/);
        if (cmdMatch) {
          const cmdValue = cmdMatch[1].trim();
          if (cmdValue === "|") {
            i++;
            const cmdLines: string[] = [];
            while (i < lines.length) {
              const cl = lines[i];
              if (cl.match(/^\s{6}/) || cl.match(/^\t{3}/)) {
                cmdLines.push(cl.replace(/^\s{6}/, "").replace(/^\t{3}/, ""));
                i++;
              } else if (cl.trim() === "") {
                cmdLines.push("");
                i++;
              } else {
                break;
              }
            }
            tool.command = cmdLines.join("\n").trim();
          } else {
            tool.command = unquote(cmdValue);
            i++;
          }
          continue;
        }

        const paramsMatch = tl.match(/^\s+parameters:\s*$/);
        if (paramsMatch) {
          i++;
          tool.parameters = parseParameters(lines, i);
          while (i < lines.length && lines[i].match(/^\s{6,}/) ) {
            i++;
          }
          continue;
        }

        const paramsInlineMatch = tl.match(/^\s+parameters:$/);
        if (paramsInlineMatch) {
          i++;
          continue;
        }

        const paramLineMatch = tl.match(/^\s{6,}(\w+):\s*\{(.+)\}/);
        if (paramLineMatch) {
          const [, paramName, paramDef] = paramLineMatch;
          tool.parameters[paramName] = parseParamDef(paramDef);
          i++;
          continue;
        }

        i++;
      }

      tools.push(tool);
      continue;
    }

    i++;
  }

  return tools;
}

function parseParameters(lines: string[], startIdx: number): Record<string, { type: string; description?: string }> {
  const params: Record<string, { type: string; description?: string }> = {};
  let i = startIdx;

  while (i < lines.length) {
    const line = lines[i];
    if (!line.match(/^\s{6,}/)) break;

    const match = line.match(/^\s+(\w+):\s*\{(.+)\}/);
    if (match) {
      const [, name, def] = match;
      params[name] = parseParamDef(def);
    }
    i++;
  }

  return params;
}

function parseParamDef(def: string): { type: string; description?: string } {
  const typeMatch = def.match(/type:\s*(\w+)/);
  const descMatch = def.match(/description:\s*"([^"]*)"/) || def.match(/description:\s*'([^']*)'/);

  return {
    type: typeMatch?.[1] ?? "string",
    description: descMatch?.[1],
  };
}

function unquote(s: string): string {
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1);
  }
  return s;
}
