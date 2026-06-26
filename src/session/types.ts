// ── Session Data Layer Types ──
// Pure data model for session persistence and vision pipeline.
// Consumed by: harness.ts (inference), store.ts (I/O), display.ts (UI)

// --- Image ---

export interface ImageRef {
  type: "image_ref";
  hash: string;
  mimeType: string;
}

export interface VisionMessage {
  turnIndex: number;
  messageIndex: number;
  images: ImageRef[];
  prompt: string;
  description: string;
  modelProvider: string;
  modelId: string;
  timestamp: number;
  latencyMs?: number;
  tokensUsed?: number;
}

// --- Session ---

export interface PendingPermission {
  toolName: string;
  preview: string;
  fuzzyPattern?: string | null;
  permissionArgs?: unknown;
}

export interface SessionMetadata {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  pendingPermission?: PendingPermission;
  modelProvider: string;
  modelId: string;
  messageCount: number;
  projectPath: string;
  preview: string;
  hasImages: boolean;
  imageCount: number;
  totalActiveMs: number;
  contentHash: string;
}

export interface SerializedSession {
  version: 1 | 2;
  metadata: SessionMetadata;
  messages: unknown[];
  visionMessages?: VisionMessage[];
  compactedPrefix?: string;
}

// --- Display (forward-declared, implemented in display.ts) ---

export interface DisplayMessage {
  role: "user" | "assistant" | "system";
  content: string;
  images?: { data: string; mimeType: string }[];
  thinking?: string;
  tools?: { name: string; args: string; result: string; isError: boolean }[];
}
