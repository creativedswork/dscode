export type CompactionStrategy =
  | "drop-oldest"
  | "sliding-window"
  | "summarize-prefix";

export interface ContextConfig {
  strategy: CompactionStrategy;
  targetUtilization: number;
  minRetainedMessages: number;
}
