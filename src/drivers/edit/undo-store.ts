/**
 * In-memory undo snapshot store for the edit tool.
 *
 * Simple Map<string, string> keyed by absolute file path.
 * Stores complete pre-edit file content for one-level undo.
 * Overwrites existing snapshot when editing the same file again.
 * Cleared on edit_undo or session shutdown.
 */

const undoSnapshots = new Map<string, string>();

/** Capture a snapshot of pre-edit file content. */
export function captureUndoSnapshot(filePath: string, content: string): void {
  undoSnapshots.set(filePath, content);
}

/** Retrieve the stored snapshot for a file path. */
export function getUndoSnapshot(filePath: string): string | undefined {
  return undoSnapshots.get(filePath);
}

/** Clear the snapshot for a file path (after undo or on new edit). */
export function clearUndoSnapshot(filePath: string): void {
  undoSnapshots.delete(filePath);
}

/** Check if a snapshot exists for a file path. */
export function hasUndoSnapshot(filePath: string): boolean {
  return undoSnapshots.has(filePath);
}

/** Clear all undo snapshots (session shutdown). */
export function clearAllUndoSnapshots(): void {
  undoSnapshots.clear();
}

/** Number of stored snapshots. */
export function getUndoSnapshotCount(): number {
  return undoSnapshots.size;
}
