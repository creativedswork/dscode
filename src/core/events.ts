import type { ImageContent } from "@earendil-works/pi-ai";
import type { McpServerInfo } from "../ui/shared/types.js";
import type { AppInstance } from "../mcp/app/types.js";
import type { ConfigData } from "../ui/shared/types.js";
import type { Logger } from "../utils/logger.js";
import type { AgentExitResult, AgentProcessState } from "../agents/process/types.js";

export type EvalDashboardStage =
  | "prepare"
  | "graph"
  | "oracle"
  | "backtrack"
  | "attribution"
  | "rules"
  | "dashboard";

export interface EvalDashboardEvidenceSummary {
  totalActors: number;
  subagentCount: number;
  fullTranscripts: number;
  summaryTranscripts: number;
  missingTranscripts: number;
  completeness: "complete" | "partial";
  affectedAgentIds: string[];
}

export type EvalDashboardState =
  | {
      status: "starting";
      requestedSessionId?: string;
      startedAt: number;
    }
  | {
      status: "running";
      targetSessionId: string;
      runId: string;
      stage: EvalDashboardStage;
      stageStatus: "running" | "done" | "failed";
      index: number;
      total: number;
      application: string;
      workerAgentId?: string;
      retryCount?: number;
      durationMs?: number;
      message: string;
      startedAt: number;
      actorCount: number;
      stepCount: number;
      evidence: EvalDashboardEvidenceSummary;
    }
  | {
      status: "completed";
      targetSessionId: string;
      runId: string;
      html: string;
      outputPath: string;
      generatedAt: number;
    }
  | {
      status: "failed";
      requestedSessionId?: string;
      targetSessionId?: string;
      runId?: string;
      stage?: EvalDashboardStage;
      error: string;
    };

// ── HarnessEvent discriminated union ──

export type HarnessEvent =
  // LLM streaming
  | { type: "llm:thinking:delta"; delta: string }
  | { type: "llm:text:delta"; delta: string }
  | { type: "llm:retry"; attempt: number; maxRetries: number; delayMs: number; error: string; level: "stream" | "turn" }
  | { type: "llm:usage"; inputTokens: number; outputTokens: number }

  // Tool execution
  | { type: "tool:start"; executionId?: string; toolCallId: string; name: string; args: unknown }
  | { type: "tool:end"; executionId?: string; toolCallId: string; name: string; result: unknown; isError: boolean }

  // Turn lifecycle
  | { type: "turn:start" }
  | { type: "turn:streaming:start" }
  | { type: "turn:end"; stopReason?: string; usage?: { input: number; output: number; cacheRead: number; cacheWrite: number; total: number; cost: { total: number } } }
  | { type: "turn:abort"; reason: "user" | "system" }
  | { type: "turn:error"; error: string; attempt?: number; maxRetries?: number }

  // Processing state
  | { type: "processing:start" }
  | { type: "processing:stop" }

  // Agent process lifecycle
  | { type: "agent:spawned"; agentId: string; parentAgentId?: string; application: string; description?: string; attachment: "foreground" | "background"; input: string }
  | { type: "agent:state"; agentId: string; previous: AgentProcessState; state: AgentProcessState }
  | { type: "agent:progress"; agentId: string; phase: string; progress?: number; total?: number; message?: string; details?: unknown }
  | { type: "agent:output"; agentId: string; text: string }
  | { type: "agent:exit"; result: AgentExitResult }

  // Eval Dashboard lifecycle
  | { type: "eval:dashboard"; state: EvalDashboardState }

  // Session lifecycle
  | { type: "session:created"; id: string }
  | { type: "session:loaded"; id: string }
  | { type: "session:saved"; id: string }
  | { type: "session:deleted"; id: string }

  // UI messages
  | { type: "message:user"; text: string; images?: ImageContent[] }
  | { type: "ui:info"; text: string; display?: "toast" | "panel" }
  | { type: "ui:error"; text: string }
  | { type: "ui:warning"; text: string }
  | { type: "ui:image:pending"; image: ImageContent }
  | { type: "ui:conversation:clear" }
  | { type: "ui:focus:editor" }

  // Config
  | { type: "config:change"; data: ConfigData }

  // MCP
  | { type: "mcp:state"; servers: McpServerInfo[] }
  | { type: "mcp:browser:open" }
  | { type: "mcp:tool:progress"; toolName: string; serverName: string; progress: number; total?: number; message?: string }
  | { type: "mcp:app:registered"; app: AppInstance };

export type HarnessEventType = HarnessEvent["type"];

export type EventHandler<E extends HarnessEventType = HarnessEventType> = (
  event: Extract<HarnessEvent, { type: E }>,
) => void;

// ── HarnessEventBus ──

export class HarnessEventBus {
  private logger: Logger;
  private handlers = new Map<string, Set<EventHandler<any>>>();

  constructor(logger: Logger) {
    this.logger = logger;
  }

  on<E extends HarnessEventType>(type: E, handler: EventHandler<E>): () => void {
    let set = this.handlers.get(type);
    if (!set) {
      set = new Set();
      this.handlers.set(type, set);
    }
    set.add(handler);
    return () => {
      set?.delete(handler);
    };
  }

  emit(event: HarnessEvent): void {
    const set = this.handlers.get(event.type);
    if (!set || set.size === 0) return;
    for (const handler of set) {
      try {
        handler(event);
      } catch (err) {
        this.logger.error("EventBus", `handler error for "${event.type}": ${String(err)}`);
      }
    }
  }

  /** Remove all handlers. */
  clear(): void {
    this.handlers.clear();
  }
}
