import type { CheckpointMeta } from "../types.js";

/**
 * Abstract store for checkpoint persistence.
 * Decouples CheckpointManager's orchestration logic from I/O.
 * Implementations: FileSystemCheckpointStore (local), future: DbCheckpointStore, S3CheckpointStore, etc.
 */
export interface CheckpointStore {
  /** Persist a checkpoint. content may be null if file did not exist at checkpoint time. */
  save(meta: CheckpointMeta, content: Buffer | null): void;

  /** Load a checkpoint. Returns null if no checkpoint exists for the given filePath. */
  load(filePath: string): { meta: CheckpointMeta; content: Buffer | null } | null;

  /** Delete a checkpoint for the given filePath (commit or rollback). */
  delete(filePath: string): void;

  /** List all checkpoint metadata entries. */
  list(): CheckpointMeta[];

  /** Remove all checkpoints (session cleanup). */
  clear(): void;
}
