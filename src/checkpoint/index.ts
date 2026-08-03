import { homedir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";

import { CheckpointManager } from "./checkpoint-manager.js";
import { FileWriteTracker } from "./write-tracker.js";
import { FileSystemCheckpointStore } from "./store/fs-store.js";
import { SnapshotStore } from "./snapshot-store.js";
import { getAgentContext } from "../agents/process/context.js";

// Re-export public types
export { CheckpointManager } from "./checkpoint-manager.js";
export { FileWriteTracker } from "./write-tracker.js";
export { SnapshotStore } from "./snapshot-store.js";
export { FileSystemCheckpointStore } from "./store/fs-store.js";
export type { CheckpointStore } from "./store/interface.js";
export type { WriterType, BaselineContinuity, CheckpointMeta } from "./types.js";

// --- Singleton access (initialized by Harness) ---

interface CheckpointBundle {
  snapshotStore: SnapshotStore;
  checkpointManager: CheckpointManager;
  fileWriteTracker: FileWriteTracker;
}

const bundles = new Map<string, CheckpointBundle>();

function contextKey(): string {
  return getAgentContext()?.agentId || "__main__";
}

function createBundle(projectPath: string, namespace: string): CheckpointBundle {
  const projectHash = createHash("sha256").update(projectPath).digest("hex").slice(0, 12);
  const baseDir = join(homedir(), ".dscode", "checkpoints", "per-project", projectHash, namespace);
  const snapshotStore = new SnapshotStore();
  const store = new FileSystemCheckpointStore(baseDir);
  return {
    snapshotStore,
    checkpointManager: new CheckpointManager(store, projectPath),
    fileWriteTracker: new FileWriteTracker(),
  };
}

function currentBundle(): CheckpointBundle | null {
  const key = contextKey();
  const existing = bundles.get(key);
  if (existing) return existing;
  const context = getAgentContext();
  if (!context) return null;
  const created = createBundle(context.cwd, join(context.parentSessionId, context.agentId));
  bundles.set(key, created);
  return created;
}

export function initCheckpointSystem(
  projectPath: string,
  sessionId: string,
): { checkpointManager: CheckpointManager; fileWriteTracker: FileWriteTracker } {
  const bundle = createBundle(projectPath, sessionId);
  bundles.set("__main__", bundle);
  return {
    checkpointManager: bundle.checkpointManager,
    fileWriteTracker: bundle.fileWriteTracker,
  };
}

export function getCheckpointManager(): CheckpointManager | null {
  return currentBundle()?.checkpointManager ?? null;
}

export function getSnapshotStore(): SnapshotStore | null {
  return currentBundle()?.snapshotStore ?? null;
}

export function getFileWriteTracker(): FileWriteTracker | null {
  return currentBundle()?.fileWriteTracker ?? null;
}

export function shutdownCheckpointSystem(): void {
  for (const bundle of bundles.values()) {
    bundle.checkpointManager.cleanup();
    bundle.snapshotStore.clear();
  }
  bundles.clear();
}
