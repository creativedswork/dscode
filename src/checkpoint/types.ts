// --- Writer types ---

export type WriterType = "edit" | "write_file" | "overwrite_file" | "bash";
export type BaselineContinuity = "clean" | "mixed";

// --- Checkpoint metadata ---

export interface CheckpointMeta {
  filePath: string;
  baseCommit: string;
  writerType: WriterType;
  timestamp: number;
  fileVersion: string;
}
