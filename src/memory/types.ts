export interface MemoryConfig {
  enabled: boolean;
  autoExtract: boolean;
  maxGlobalEntries: number;
  maxProjectEntries: number;
}

export interface MemoryEntry {
  id: string;
  scope: "global" | "project";
  category: "preference" | "fact" | "instruction";
  content: string;
  source: { sessionId: string; timestamp: number };
}
