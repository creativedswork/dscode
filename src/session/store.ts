import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { SerializedSession, SessionMetadata } from "../core/types.js";

export class SessionStore {
  private dir: string;

  constructor(dataDir: string) {
    this.dir = join(dataDir, "sessions");
    if (!existsSync(this.dir)) {
      mkdirSync(this.dir, { recursive: true });
    }
  }

  save(session: SerializedSession): boolean {
    const filePath = join(this.dir, `${session.metadata.id}.json`);
    const tmp = filePath + ".tmp";
    try {
      writeFileSync(tmp, JSON.stringify(session, null, 2));
      renameSync(tmp, filePath);
      this.updateIndex(session.metadata);
      return true;
    } catch (err) {
      // If atomic write fails, try direct write as fallback
      try {
        writeFileSync(filePath, JSON.stringify(session, null, 2));
        this.updateIndex(session.metadata);
        return true;
      } catch {
        console.error(`[session] Failed to save session ${session.metadata.id}:`, err);
        return false;
      }
    }
  }

  load(id: string): SerializedSession | null {
    const filePath = join(this.dir, `${id}.json`);
    if (!existsSync(filePath)) return null;
    try {
      return JSON.parse(readFileSync(filePath, "utf8"));
    } catch (err) {
      console.error(`[session] Failed to load session ${id}:`, err);
      return null;
    }
  }

  list(): SessionMetadata[] {
    const indexPath = join(this.dir, "index.json");
    if (!existsSync(indexPath)) return [];
    try {
      return JSON.parse(readFileSync(indexPath, "utf8"));
    } catch {
      return [];
    }
  }

  delete(id: string): void {
    const filePath = join(this.dir, `${id}.json`);
    if (existsSync(filePath)) {
      try {
        unlinkSync(filePath);
      } catch {
        // Ignore deletion errors
      }
    }
    const index = this.list().filter((m) => m.id !== id);
    this.writeIndex(index);
  }

  private updateIndex(metadata: SessionMetadata): void {
    const index = this.list();
    const existing = index.findIndex((m) => m.id === metadata.id);
    if (existing >= 0) {
      index[existing] = metadata;
    } else {
      index.unshift(metadata);
    }
    this.writeIndex(index.slice(0, 100));
  }

  private writeIndex(index: SessionMetadata[]): void {
    const indexPath = join(this.dir, "index.json");
    try {
      writeFileSync(indexPath, JSON.stringify(index, null, 2));
    } catch {
      // Ignore index write failures; the session file is the source of truth
    }
  }
}
