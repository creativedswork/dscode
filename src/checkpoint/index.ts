import { homedir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";

import { CheckpointManager } from "./checkpoint-manager.js";
import { FileWriteTracker } from "./write-tracker.js";
import { FileSystemCheckpointStore } from "./store/fs-store.js";

// Re-export public types
export { CheckpointManager } from "./checkpoint-manager.js";
export { FileWriteTracker } from "./write-tracker.js";
export { FileSystemCheckpointStore } from "./store/fs-store.js";
export type { CheckpointStore } from "./store/interface.js";
export type { WriterType, BaselineContinuity, CheckpointMeta } from "./types.js";

// --- Singleton access (initialized by Harness) ---

let _checkpointManager: CheckpointManager | null = null;
let _fileWriteTracker: FileWriteTracker | null = null;

export function initCheckpointSystem(
  projectPath: string,
  sessionId: string,
): { checkpointManager: CheckpointManager; fileWriteTracker: FileWriteTracker } {
  const projectHash = createHash("sha256").update(projectPath).digest("hex").slice(0, 12);
  const baseDir = join(homedir(), ".dscode", "checkpoints", "per-project", projectHash, sessionId);
  const store = new FileSystemCheckpointStore(baseDir);
  _checkpointManager = new CheckpointManager(store, projectPath);
  _fileWriteTracker = new FileWriteTracker();
  return { checkpointManager: _checkpointManager, fileWriteTracker: _fileWriteTracker };
}

export function getCheckpointManager(): CheckpointManager | null {
  return _checkpointManager;
}

export function getFileWriteTracker(): FileWriteTracker | null {
  return _fileWriteTracker;
}

export function shutdownCheckpointSystem(): void {
  if (_checkpointManager) {
    _checkpointManager.cleanup();
    _checkpointManager = null;
  }
  _fileWriteTracker = null;
}
