import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";

import type { CheckpointStore } from "./interface.js";
import type { CheckpointMeta } from "../types.js";

function computeFileVersion(content: string): string {
  return "fv_" + createHash("sha256").update(content).digest("hex").slice(0, 8);
}

/**
 * File-system-backed checkpoint storage under a caller-provided base directory.
 *
 * Directory layout per checkpoint:
 *   {safeFileName}-{timestamp}/
 *     original      ← byte-identical file copy (absent if file didn't exist)
 *     meta.json     ← CheckpointMeta as JSON
 */
export class FileSystemCheckpointStore implements CheckpointStore {
  private baseDir: string;

  constructor(baseDir: string) {
    this.baseDir = baseDir;
    mkdirSync(this.baseDir, { recursive: true });
  }

  private safeName(filePath: string): string {
    return filePath.replace(/[\/\\:]/g, "_").replace(/^_+/, "");
  }

  private findCheckpointDir(filePath: string): string | null {
    const prefix = this.safeName(filePath) + "-";
    if (!existsSync(this.baseDir)) return null;
    let entries;
    try { entries = readdirSync(this.baseDir, { withFileTypes: true }); } catch { return null; }
    for (const entry of entries) {
      if (entry.isDirectory() && entry.name.startsWith(prefix)) {
        return join(this.baseDir, entry.name);
      }
    }
    return null;
  }

  // --- CheckpointStore implementation ---

  save(meta: CheckpointMeta, content: Buffer | null): void {
    // Remove previous checkpoint for same file (keep only latest)
    const existing = this.findCheckpointDir(meta.filePath);
    if (existing) {
      rmSync(existing, { recursive: true, force: true });
    }

    const dir = join(this.baseDir, `${this.safeName(meta.filePath)}-${meta.timestamp}`);
    mkdirSync(dir, { recursive: true });

    writeFileSync(join(dir, "meta.json"), JSON.stringify(meta, null, 2));

    if (content !== null) {
      writeFileSync(join(dir, "original"), content);
    }
  }

  load(filePath: string): { meta: CheckpointMeta; content: Buffer | null } | null {
    const dir = this.findCheckpointDir(filePath);
    if (!dir) return null;

    const metaPath = join(dir, "meta.json");
    const originalPath = join(dir, "original");

    const meta: CheckpointMeta = JSON.parse(readFileSync(metaPath, "utf8"));
    const content = existsSync(originalPath) ? readFileSync(originalPath) : null;

    return { meta, content };
  }

  delete(filePath: string): void {
    const dir = this.findCheckpointDir(filePath);
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  list(): CheckpointMeta[] {
    if (!existsSync(this.baseDir)) return [];
    let entries;
    try { entries = readdirSync(this.baseDir, { withFileTypes: true }); } catch { return []; }
    const result: CheckpointMeta[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const metaPath = join(this.baseDir, entry.name, "meta.json");
      if (existsSync(metaPath)) {
        try {
          const meta: CheckpointMeta = JSON.parse(readFileSync(metaPath, "utf8"));
          // Deduplicate by filePath (latest wins via save() replacement)
          const idx = result.findIndex(m => m.filePath === meta.filePath);
          if (idx >= 0) result[idx] = meta;
          else result.push(meta);
        } catch { /* skip corrupt metadata */ }
      }
    }
    return result;
  }

  clear(): void {
    if (existsSync(this.baseDir)) {
      rmSync(this.baseDir, { recursive: true, force: true });
    }
  }
}
