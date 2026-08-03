import type { ImageContent } from "@earendil-works/pi-ai";

import type { AgentFailureCode } from "../application/types.js";
import type { ImageRef } from "../../session/types.js";

export type AgentAttachment =
  | { type: "image"; data: ImageContent | ImageRef }
  | { type: "file"; uri: string }
  | { type: "text"; text: string };

export interface AgentProcessInput {
  prompt: string;
  attachments?: AgentAttachment[];
  onStateChange?: (state: "running" | "waiting") => void | Promise<void>;
  onCheckpoint?: (snapshot: AgentRuntimeSnapshot) => void | Promise<void>;
}

export class AgentRuntimeFailure extends Error {
  constructor(
    readonly code: AgentFailureCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "AgentRuntimeFailure";
  }
}

export interface AgentProcessOutput<T = unknown> {
  text: string;
  details?: T;
}

export interface AgentMessage {
  content: string;
}

export interface AgentRuntimeCapabilities {
  suspend: boolean;
  messaging: boolean;
}

export interface AgentRuntimeSnapshot {
  messages?: unknown[];
  usage?: unknown;
}

export interface AgentProcessRuntime<T = unknown> {
  readonly capabilities: AgentRuntimeCapabilities;
  start(input: AgentProcessInput, signal: AbortSignal): Promise<AgentProcessOutput<T>>;
  terminate(): Promise<void>;
  kill(): void;
  suspend?(): Promise<void>;
  continue?(): Promise<void>;
  sendMessage?(message: AgentMessage): void;
  snapshot?(): AgentRuntimeSnapshot;
}

export class FailedAgentRuntime implements AgentProcessRuntime {
  readonly capabilities = { suspend: false, messaging: false } as const;

  constructor(private readonly failure: AgentRuntimeFailure) {}

  async start(): Promise<never> {
    throw this.failure;
  }

  async terminate(): Promise<void> {}
  kill(): void {}
}
