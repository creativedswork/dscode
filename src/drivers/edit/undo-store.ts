import { getHostFacility } from "../../kernel/execution-context.js";

export const UNDO_STORE_FACILITY = Symbol("dscode.edit-undo");

export class UndoSnapshotStore {
  private readonly snapshots = new Map<string, string>();

  capture(filePath: string, content: string): void {
    this.snapshots.set(filePath, content);
  }

  get(filePath: string): string | undefined {
    return this.snapshots.get(filePath);
  }

  clear(filePath: string): void {
    this.snapshots.delete(filePath);
  }

  has(filePath: string): boolean {
    return this.snapshots.has(filePath);
  }

  clearAll(): void {
    this.snapshots.clear();
  }

  get size(): number {
    return this.snapshots.size;
  }
}

function currentStore(): UndoSnapshotStore | undefined {
  return getHostFacility<UndoSnapshotStore>(UNDO_STORE_FACILITY);
}

export function captureUndoSnapshot(
  filePath: string,
  content: string,
): void {
  currentStore()?.capture(filePath, content);
}

export function getUndoSnapshot(filePath: string): string | undefined {
  return currentStore()?.get(filePath);
}

export function clearUndoSnapshot(filePath: string): void {
  currentStore()?.clear(filePath);
}

export function hasUndoSnapshot(filePath: string): boolean {
  return currentStore()?.has(filePath) ?? false;
}

export function clearAllUndoSnapshots(): void {
  currentStore()?.clearAll();
}

export function getUndoSnapshotCount(): number {
  return currentStore()?.size ?? 0;
}
