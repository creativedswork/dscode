/**
 * Memory-based LRU snapshot store for edit recovery.
 *
 * Retains recent full-text snapshots keyed by (filePath, fileVersion).
 * When an edit arrives with a stale expected_file_version, the recovery
 * system can look up the original snapshot, replay the operations, and
 * merge the result onto the current file (3-way merge).
 *
 * Design:
 *  - Per-file ring buffer of up to maxSnapshotsPerFile entries
 *  - Global LRU eviction when total entries exceed maxTotalSnapshots
 *  - Thread-safe: all operations are synchronous (Node.js single-threaded)
 */

interface SnapshotEntry {
  filePath: string;
  fileVersion: string;
  content: string;
  timestamp: number;
}

export class SnapshotStore {
  /** Per-file ring buffers: filePath → SnapshotEntry[] (newest first) */
  private byFile = new Map<string, SnapshotEntry[]>();

  /** Global LRU tracking: insertion-ordered keys */
  private lruKeys: string[] = []; // format: "filePath::fileVersion"

  constructor(
    private maxSnapshotsPerFile: number = 5,
    private maxTotalSnapshots: number = 500,
  ) {}

  /**
   * Record a snapshot of a file. Called after read_file returns hashed content
   * (so the model receives the file_version and can use it for later edits).
   */
  record(filePath: string, fileVersion: string, content: string): void {
    const key = this.makeKey(filePath, fileVersion);

    // Deduplicate: if this exact version already exists, update timestamp only
    const existing = this.lruKeys.indexOf(key);
    if (existing >= 0) {
      this.lruKeys.splice(existing, 1);
      this.lruKeys.push(key);
      const entries = this.byFile.get(filePath)!;
      const entry = entries.find(e => e.fileVersion === fileVersion);
      if (entry) entry.timestamp = Date.now();
      return;
    }

    const entry: SnapshotEntry = {
      filePath,
      fileVersion,
      content,
      timestamp: Date.now(),
    };

    // Add to per-file ring buffer
    let entries = this.byFile.get(filePath);
    if (!entries) {
      entries = [];
      this.byFile.set(filePath, entries);
    }
    entries.unshift(entry); // newest first
    while (entries.length > this.maxSnapshotsPerFile) {
      const removed = entries.pop()!;
      this.removeFromLru(this.makeKey(removed.filePath, removed.fileVersion));
    }

    // Add to global LRU
    this.lruKeys.push(key);

    // Evict oldest if over global limit
    while (this.lruKeys.length > this.maxTotalSnapshots) {
      const oldestKey = this.lruKeys.shift()!;
      const [fp, fv] = this.parseKey(oldestKey);
      const fileEntries = this.byFile.get(fp);
      if (fileEntries) {
        const idx = fileEntries.findIndex(e => e.fileVersion === fv);
        if (idx >= 0) fileEntries.splice(idx, 1);
        if (fileEntries.length === 0) this.byFile.delete(fp);
      }
    }
  }

  /**
   * Look up a snapshot by file path and version.
   * Returns the full file content or null if not found.
   */
  lookup(filePath: string, fileVersion: string): string | null {
    const entries = this.byFile.get(filePath);
    if (!entries) return null;
    const entry = entries.find(e => e.fileVersion === fileVersion);
    if (!entry) return null;

    // Touch LRU: move key to end
    const key = this.makeKey(filePath, fileVersion);
    const idx = this.lruKeys.indexOf(key);
    if (idx >= 0) {
      this.lruKeys.splice(idx, 1);
      this.lruKeys.push(key);
    }
    entry.timestamp = Date.now();

    return entry.content;
  }

  /**
   * Remove all snapshots for a file (called after successful write_file / overwrite_file).
   */
  invalidate(filePath: string): void {
    const entries = this.byFile.get(filePath);
    if (!entries) return;
    for (const e of entries) {
      this.removeFromLru(this.makeKey(e.filePath, e.fileVersion));
    }
    this.byFile.delete(filePath);
  }

  /** Remove all snapshots. */
  clear(): void {
    this.byFile.clear();
    this.lruKeys.length = 0;
  }

  /** Number of currently stored snapshots. */
  get size(): number {
    return this.lruKeys.length;
  }

  // --- Private helpers ---

  private makeKey(filePath: string, fileVersion: string): string {
    return `${filePath}::${fileVersion}`;
  }

  private parseKey(key: string): [string, string] {
    const idx = key.lastIndexOf("::");
    return [key.slice(0, idx), key.slice(idx + 2)];
  }

  private removeFromLru(key: string): void {
    const idx = this.lruKeys.indexOf(key);
    if (idx >= 0) this.lruKeys.splice(idx, 1);
  }
}

// --- Singleton access ---

let _snapshotStore: SnapshotStore | null = null;

export function initSnapshotStore(opts?: {
  maxSnapshotsPerFile?: number;
  maxTotalSnapshots?: number;
}): SnapshotStore {
  _snapshotStore = new SnapshotStore(
    opts?.maxSnapshotsPerFile ?? 5,
    opts?.maxTotalSnapshots ?? 500,
  );
  return _snapshotStore;
}

export function getSnapshotStore(): SnapshotStore | null {
  return _snapshotStore;
}

export function shutdownSnapshotStore(): void {
  if (_snapshotStore) {
    _snapshotStore.clear();
    _snapshotStore = null;
  }
}
