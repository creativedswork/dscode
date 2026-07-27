/**
 * Per-message registry of file paths attached to the current message,
 * maintained independently of editor text. Files enter via drag-and-drop
 * (Web UI and TUI) and are passed as `fileRefs` at submit time.
 *
 * Browser-compatible — uses no Node.js APIs.
 */
export class FileTracker {
  private entries: Map<string, string> = new Map(); // absolutePath → displayPath

  /**
   * Register a file path. Name-only display path (last segment).
   * No-ops if path already registered.
   * Returns the display path.
   */
  add(absPath: string, projectPath: string): string {
    if (this.entries.has(absPath)) {
      return this.entries.get(absPath)!;
    }

    const displayPath = computeDisplayPath(absPath);
    this.entries.set(absPath, displayPath);
    return displayPath;
  }

  /** Remove a tracked file by absolute path. */
  remove(absPath: string): void {
    this.entries.delete(absPath);
  }

  /** Return all stored absolute paths in insertion order. */
  getAll(): string[] {
    return [...this.entries.keys()];
  }

  /** Return all display paths in insertion order. */
  getDisplayPaths(): string[] {
    return [...this.entries.values()];
  }

  /** Reverse lookup: return the absolute path for a given display path, or undefined. */
  getAbsPath(displayPath: string): string | undefined {
    for (const [absPath, dp] of this.entries) {
      if (dp === displayPath) return absPath;
    }
    return undefined;
  }

  /** Clear all tracked files. */
  clear(): void {
    this.entries.clear();
  }

  /** Atomically get all absolute paths and clear. */
  drain(): string[] {
    const paths = this.getAll();
    this.entries.clear();
    return paths;
  }

  /** Number of currently tracked file entries. */
  get count(): number {
    return this.entries.size;
  }
}

// ── Browser-compatible path helpers ──

function normalizePath(p: string): string {
  let result = p.replace(/\/+/g, "/").replace(/\\+/g, "/");
  if (result.length > 1 && result.endsWith("/")) {
    result = result.slice(0, -1);
  }
  return result;
}

function computeDisplayPath(absPath: string): string {
  const normalized = normalizePath(absPath);
  const segments = normalized.split("/");
  return segments[segments.length - 1] || absPath;
}
