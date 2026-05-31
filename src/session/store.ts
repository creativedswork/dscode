import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmdirSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { SerializedSession, SessionMetadata } from "../core/types.js";

const MAX_INDEX_ENTRIES = 100;

function projectSlug(projectPath: string): string {
  const sanitized = projectPath
    .replace(/^[\/\\]+/, "")
    .replace(/[\/\\:]/g, "_");
  const hash = createHash("sha256").update(projectPath).digest("hex").slice(0, 8);
  return `${sanitized}-${hash}`;
}

class SessionValidateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SessionValidateError";
  }
}

function validateSession(raw: unknown, expectedId: string): SerializedSession {
  if (raw === null || raw === undefined) {
    throw new SessionValidateError("Session file is empty");
  }
  if (typeof raw !== "object") {
    throw new SessionValidateError("Session file is corrupted: invalid JSON");
  }

  const data = raw as Record<string, unknown>;

  if (typeof data.version !== "number") {
    throw new SessionValidateError("Session file is corrupted: missing required field 'version'");
  if (data.version !== 1 && data.version !== 2) {
    throw new SessionValidateError(
      `Session file has unsupported version: ${data.version}. Expected 1 or 2.`,
    );
  }
  }
  if (data.metadata === null || typeof data.metadata !== "object") {
    throw new SessionValidateError("Session file is corrupted: missing required field 'metadata'");
  }
  if (!Array.isArray(data.messages)) {
    throw new SessionValidateError("Session file is corrupted: missing required field 'messages'");
  }

  const meta = data.metadata as Record<string, unknown>;

  const requiredFields = ["id", "title", "createdAt", "updatedAt"];
  for (const field of requiredFields) {
    if (!(field in meta)) {
      throw new SessionValidateError(
        `Session file is corrupted: missing required field 'metadata.${field}'`,
      );
    }
  }

  if (meta.id !== expectedId) {
    throw new SessionValidateError(
      `Session file is corrupted: ID mismatch (expected ${expectedId}, got ${meta.id})`,
    );
  }

  return data as unknown as SerializedSession;
}

export class SessionStore {
  private projectDir: string;
  private globalDir: string;

  constructor(dataDir: string, projectPath: string) {
    const slug = projectSlug(projectPath);
    this.globalDir = join(dataDir, "sessions");
    this.projectDir = join(dataDir, "sessions", "by-project", slug);

    if (!existsSync(this.globalDir)) {
      mkdirSync(this.globalDir, { recursive: true });
    }
    if (!existsSync(this.projectDir)) {
      mkdirSync(this.projectDir, { recursive: true });
    }
  }

  save(session: SerializedSession): void {
    const id = session.metadata.id;
    const projPath = join(this.projectDir, `${id}.json`);
    const tmp = projPath + ".tmp";

    mkdirSync(this.projectDir, { recursive: true });
    writeFileSync(tmp, JSON.stringify(session, null, 2));
    renameSync(tmp, projPath);

    this.updateIndex(this.projectDir, session.metadata);
    this.updateIndex(this.globalDir, session.metadata);
  }

  load(id: string): SerializedSession {
    const projPath = join(this.projectDir, `${id}.json`);
    const globalPath = join(this.globalDir, `${id}.json`);

    let raw: unknown;
    let filePath: string;

    if (existsSync(projPath)) {
      filePath = projPath;
    } else if (existsSync(globalPath)) {
      filePath = globalPath;
    } else {
      throw new SessionValidateError(`Session not found: ${id}`);
    }

    const stat = existsSync(filePath);
    if (!stat) {
      throw new SessionValidateError(`Session not found: ${id}`);
    }

    try {
      raw = JSON.parse(readFileSync(filePath, "utf8"));
    } catch {
      throw new SessionValidateError("Session file is corrupted: invalid JSON");
    }

    return validateSession(raw, id);
  }

  list(): SessionMetadata[] {
    return this.readIndex(this.projectDir);
  }

  listAll(): SessionMetadata[] {
    return this.readIndex(this.globalDir);
  }

  delete(id: string): void {
    const projPath = join(this.projectDir, `${id}.json`);
    const globalPath = join(this.globalDir, `${id}.json`);

    let deleted = false;
    if (existsSync(projPath)) {
      unlinkSync(projPath);
      deleted = true;
    }
    if (existsSync(globalPath)) {
      unlinkSync(globalPath);
      deleted = true;
    }

    if (!deleted) {
      throw new SessionValidateError(`Session not found: ${id}`);
    }

    const projIndex = this.readIndex(this.projectDir).filter((m) => m.id !== id);
    this.writeIndex(this.projectDir, projIndex);

    const globalIndex = this.readIndex(this.globalDir).filter((m) => m.id !== id);
    this.writeIndex(this.globalDir, globalIndex);

    try {
      const remaining = readdirSync(this.projectDir).filter(
        (f) => f !== "index.json" && !f.endsWith(".tmp"),
      );
      if (remaining.length === 0) {
        unlinkSync(join(this.projectDir, "index.json"));
        rmdirSync(this.projectDir);
      }
    } catch {
      // Best-effort cleanup
    }
  }

  globalDirPath(): string {
    return this.globalDir;
  }

  // ── Private helpers ──

  private readIndex(dir: string): SessionMetadata[] {
    const indexPath = join(dir, "index.json");
    if (!existsSync(indexPath)) return this.rebuildIndex(dir);
    try {
      const raw = JSON.parse(readFileSync(indexPath, "utf8"));
      if (!Array.isArray(raw)) return this.rebuildIndex(dir);
      return raw as SessionMetadata[];
    } catch {
      return this.rebuildIndex(dir);
    }
  }
  private writeIndex(dir: string, index: SessionMetadata[]): void {
    const indexPath = join(dir, "index.json");
    try {
      writeFileSync(indexPath, JSON.stringify(index, null, 2));
    } catch {
      // Ignore index write failures; the session files are the source of truth
    }
  }

  private updateIndex(dir: string, metadata: SessionMetadata): void {
    const index = this.readIndex(dir);
    const existing = index.findIndex((m) => m.id === metadata.id);
    if (existing >= 0) {
      index[existing] = metadata;
    } else {
      index.unshift(metadata);
    }
    this.writeIndex(dir, index.slice(0, MAX_INDEX_ENTRIES));
  }

  private rebuildIndex(dir: string): SessionMetadata[] {
    try {
      const files = readdirSync(dir).filter(
        (f) => f.endsWith(".json") && f !== "index.json",
      );
      const entries: SessionMetadata[] = [];
      for (const file of files) {
        try {
          const raw = JSON.parse(readFileSync(join(dir, file), "utf8"));
          if (raw?.metadata && typeof raw.metadata.id === "string") {
            const meta = raw.metadata as SessionMetadata;
            // Fix-up: recalculate messageCount from actual messages
            // (fixes sessions that were corrupted by saveSession with empty messages)
            if (meta.messageCount === 0 && Array.isArray(raw.messages) && raw.messages.length > 0) {
              meta.messageCount = raw.messages.filter((m: any) => m.role === "user" || m.role === "assistant").length;
            }
            // Skip sessions that have no messages at all (empty/corrupted)
            if (Array.isArray(raw.messages) && raw.messages.length > 0) {
              entries.push(meta);
            }
          }
        } catch {
          // Skip corrupted files during rebuild
        }
      }
      entries.sort((a, b) => b.updatedAt - a.updatedAt);
      this.writeIndex(dir, entries.slice(0, MAX_INDEX_ENTRIES));
      return entries.slice(0, MAX_INDEX_ENTRIES);
    } catch {
      return [];
    }
  }
}
