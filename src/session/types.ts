// ── Session Data Layer Types ──
// Pure data model for session persistence and vision pipeline.
// Consumed by: harness.ts (inference), store.ts (I/O), display.ts (UI)

import type {
  AgentActivity,
  AgentToolActivity,
  ToolCallEntry,
} from "../ui/shared/types.js";

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

export type AgentSessionAttachment =
  | { type: "image"; data: ImageRef }
  | { type: "file"; uri: string }
  | { type: "text"; text: string };

export interface AgentSessionMessage {
  role: "subagent";
  agentId: string;
  parentAgentId?: string;
  application: string;
  description?: string;
  attachment?: "foreground" | "background";
  state: "completed" | "failed" | "terminated" | "killed";
  input: {
    prompt: string;
    attachments?: AgentSessionAttachment[];
  };
  output?: {
    text?: string;
    source?: string;
    error?: string;
  };
  tools?: AgentToolActivity[];
  messageIndex?: number;
  createdAt: number;
  startedAt?: number;
  endedAt: number;
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
  version: 1 | 2 | 3;
  metadata: SessionMetadata;
  messages: unknown[];
  agentMessages?: AgentSessionMessage[];
  /** Read-only compatibility with sessions written before generic SubAgents. */
  visionMessages?: VisionMessage[];
  compactedPrefix?: string;
}

export interface PreparedSessionLoad {
  id: string;
  metadata: SessionMetadata;
  messages: unknown[];
  agentMessages: AgentSessionMessage[];
}

export interface SwitchSessionRequest {
  sessionIdOrPrefix: string;
  pendingPermission?: PendingPermission;
}

export interface SwitchSessionResult {
  session: SessionMetadata;
  messages: unknown[];
  agentMessages: AgentSessionMessage[];
}

// --- Display (forward-declared, implemented in display.ts) ---

export interface DisplayMessage {
  role: "user" | "assistant" | "system" | "agent";
  content: string;
  images?: { data: string; mimeType: string }[];
  thinking?: string;
  tools?: ToolCallEntry[];
  createdAt?: number;
  agentActivity?: AgentActivity;
}
