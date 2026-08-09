import { homedir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";

import { CheckpointManager } from "./checkpoint-manager.js";
import { FileWriteTracker } from "./write-tracker.js";
import { FileSystemCheckpointStore } from "./store/fs-store.js";
import { SnapshotStore } from "./snapshot-store.js";
import {
  getExecutionContext,
  getHostFacility,
} from "../kernel/execution-context.js";

export { CheckpointManager } from "./checkpoint-manager.js";
export { FileWriteTracker } from "./write-tracker.js";
export { SnapshotStore } from "./snapshot-store.js";
export { FileSystemCheckpointStore } from "./store/fs-store.js";
export type { CheckpointStore } from "./store/interface.js";
export type { WriterType, BaselineContinuity, CheckpointMeta } from "./types.js";

interface CheckpointBundle {
  snapshotStore: SnapshotStore;
  checkpointManager: CheckpointManager;
  fileWriteTracker: FileWriteTracker;
}

export const CHECKPOINT_FACILITY = Symbol("dscode.checkpoints");

export class CheckpointSystem {
  private readonly bundles = new Map<string, CheckpointBundle>();

  constructor(
    private readonly hostId = "standalone",
    private readonly checkpointRoot = join(
      homedir(),
      ".dscode",
      "checkpoints",
    ),
  ) {}

  initialize(
    projectPath: string,
    sessionId: string,
  ): {
    checkpointManager: CheckpointManager;
    fileWriteTracker: FileWriteTracker;
  } {
    const bundle = this.createBundle(
      projectPath,
      join(this.hostId, sessionId),
    );
    this.bundles.set("__main__", bundle);
    return {
      checkpointManager: bundle.checkpointManager,
      fileWriteTracker: bundle.fileWriteTracker,
    };
  }

  checkpointManager(): CheckpointManager | null {
    return this.currentBundle()?.checkpointManager ?? null;
  }

  snapshotStore(): SnapshotStore | null {
    return this.currentBundle()?.snapshotStore ?? null;
  }

  fileWriteTracker(): FileWriteTracker | null {
    return this.currentBundle()?.fileWriteTracker ?? null;
  }

  shutdown(): void {
    for (const bundle of this.bundles.values()) {
      bundle.checkpointManager.cleanup();
      bundle.snapshotStore.clear();
    }
    this.bundles.clear();
  }

  private currentBundle(): CheckpointBundle | null {
    const context = getExecutionContext();
    const key = !context || context.application === "main"
      ? "__main__"
      : context.processId;
    const existing = this.bundles.get(key);
    if (existing) return existing;
    if (!context) return null;
    const created = this.createBundle(
      context.cwd,
      join(this.hostId, context.sessionId, context.processId),
    );
    this.bundles.set(key, created);
    return created;
  }

  private createBundle(
    projectPath: string,
    namespace: string,
  ): CheckpointBundle {
    const projectHash = createHash("sha256")
      .update(projectPath)
      .digest("hex")
      .slice(0, 12);
    const baseDir = join(
      this.checkpointRoot,
      "per-project",
      projectHash,
      namespace,
    );
    const snapshotStore = new SnapshotStore();
    const store = new FileSystemCheckpointStore(baseDir);
    return {
      snapshotStore,
      checkpointManager: new CheckpointManager(store, projectPath),
      fileWriteTracker: new FileWriteTracker(),
    };
  }
}

function currentSystem(explicit?: CheckpointSystem): CheckpointSystem | undefined {
  return explicit ?? getHostFacility<CheckpointSystem>(CHECKPOINT_FACILITY);
}

export function initCheckpointSystem(
  projectPath: string,
  sessionId: string,
  system?: CheckpointSystem,
) {
  const target = currentSystem(system);
  if (!target) throw new Error("CheckpointSystem facility is unavailable");
  return target.initialize(projectPath, sessionId);
}

export function getCheckpointManager(): CheckpointManager | null {
  return currentSystem()?.checkpointManager() ?? null;
}

export function getSnapshotStore(): SnapshotStore | null {
  return currentSystem()?.snapshotStore() ?? null;
}

export function getFileWriteTracker(): FileWriteTracker | null {
  return currentSystem()?.fileWriteTracker() ?? null;
}

export function shutdownCheckpointSystem(system?: CheckpointSystem): void {
  currentSystem(system)?.shutdown();
}
