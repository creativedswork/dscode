import type { WriterType, BaselineContinuity } from "./types.js";

/**
 * Tracks which writer last touched each file within a session.
 * In lenient mode: detects mixed writers but does not reject.
 */
export class FileWriteTracker {
  private writers = new Map<string, WriterType>();

  recordWrite(filePath: string, writerType: WriterType): void {
    this.writers.set(filePath, writerType);
  }

  getWriter(filePath: string): WriterType | null {
    return this.writers.get(filePath) ?? null;
  }

  getContinuity(filePath: string, currentWriter: WriterType): BaselineContinuity {
    const prev = this.writers.get(filePath);
    if (prev === undefined || prev === currentWriter) return "clean";
    return "mixed";
  }

  /** Mark a file as having been written by bash (external/black-box writer). */
  markExternalWrite(filePath: string): { anchorInvalidated: boolean } {
    this.writers.set(filePath, "bash");
    return { anchorInvalidated: true };
  }
}
