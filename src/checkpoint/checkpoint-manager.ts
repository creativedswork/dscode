import { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync } from "node:fs";
import { dirname } from "node:path";

import type { WriterType } from "./types.js";
import type { CheckpointStore } from "./store/interface.js";
import { getBaseCommit } from "./base-commit.js";

/**
 * Orchestrates checkpoint lifecycle: save → validate → commit/rollback.
 * Delegates all I/O to a CheckpointStore implementation.
 */
export class CheckpointManager {
  private store: CheckpointStore;
  private baseCommit: string;

  constructor(store: CheckpointStore, projectPath: string) {
    this.store = store;
    this.baseCommit = getBaseCommit(projectPath);
  }

  getBaseCommit(): string {
    return this.baseCommit;
  }

  /** Save a checkpoint of the file before modification. */
  save(filePath: string, writerType: WriterType): void {
    const fileExists = existsSync(filePath);
    const content = fileExists ? readFileSync(filePath) : null;

    // Remove previous checkpoint for same file (keep only latest)
    this.store.delete(filePath);

    this.store.save(
      {
        filePath,
        baseCommit: this.baseCommit,
        writerType,
        timestamp: Date.now(),
        fileVersion: "", // computed by store
      },
      content,
    );
  }

  /** Restore file from its checkpoint and remove the checkpoint. */
  rollback(filePath: string): void {
    const entry = this.store.load(filePath);
    if (!entry) {
      throw new Error(`No checkpoint found for ${filePath}`);
    }

    if (entry.content !== null) {
      const parentDir = dirname(filePath);
      if (!existsSync(parentDir)) {
        mkdirSync(parentDir, { recursive: true });
      }
      writeFileSync(filePath, entry.content);
    } else {
      // File did not exist at checkpoint time — delete if it was created
      if (existsSync(filePath)) {
        unlinkSync(filePath);
      }
    }

    this.store.delete(filePath);
  }

  /** Commit (remove) the checkpoint after a successful write. */
  commit(filePath: string): void {
    this.store.delete(filePath);
  }

  /** Check if a file has an uncommitted checkpoint. */
  isDirty(filePath: string): boolean {
    return this.store.load(filePath) !== null;
  }

  /** List all file paths with uncommitted checkpoints. */
  listDirty(): string[] {
    return this.store.list().map(m => m.filePath);
  }

  /** Clean up all checkpoints for this session. */
  cleanup(): void {
    this.store.clear();
  }
}
