import type { ImageContent } from "@earendil-works/pi-ai";
import type { AppInstance } from "../mcp/app/types.js";
import type { Logger } from "../kernel/logger.js";
import type { ConfigChangeEvent } from "../config/types.js";
import type { McpStateEvent } from "../mcp/types.js";
import type { AgentProcessEvent } from "../agents/process/events.js";
import type { ToolExecutionEvent } from "../drivers/types.js";
import type { EvalDashboardEvent } from "../eval/events.js";
import type { SessionEvent } from "../session/types.js";
import type { ToolEffect } from "../kernel/tool-effects.js";
import type {
  PlanDecisionRequest,
  PlanApprovalRequest,
} from "./plan/plan-port.js";
import type { PlanConflict } from "./plan/store-types.js";
import type {
  PlanInteraction,
  PlanItemStatus,
  PlanRecord,
  PlanStatus,
} from "./plan/types.js";
import type { PlanRouteDecision } from "./plan/route.js";

export type {
  EvalDashboardEvidenceSummary,
  EvalDashboardStage,
  EvalDashboardState,
} from "../eval/events.js";

// ── HarnessEvent discriminated union ──

export type HarnessEvent =
  | ToolExecutionEvent
  | AgentProcessEvent
  | EvalDashboardEvent
  | SessionEvent
  | ConfigChangeEvent
  | McpStateEvent
  | {
      type: "plan:route";
      requestId: string;
      decision: Readonly<PlanRouteDecision>;
    }
  | {
      type: "plan:updated";
      planId: string;
      version: number;
      revision: number;
      plan: Readonly<PlanRecord>;
    }
  | {
      type: "plan:interaction";
      planId: string;
      version: number;
      revision: number;
      interaction: Readonly<PlanInteraction>;
      request?: Readonly<PlanDecisionRequest | PlanApprovalRequest>;
    }
  | {
      type: "plan:approval";
      planId: string;
      version: number;
      revision: number;
      digest: string;
      approved: boolean;
      approvedEffects: readonly ToolEffect[];
    }
  | {
      type: "plan:execution";
      planId: string;
      version: number;
      revision: number;
      status: PlanStatus;
      items: readonly {
        itemId: string;
        status: PlanItemStatus;
        evidenceCount: number;
      }[];
    }
  | {
      type: "plan:conflict";
      planId: string;
      expectedVersion: number;
      currentVersion: number;
      revision: number;
      conflict: PlanConflict;
      plan: Readonly<PlanRecord>;
    }
  // LLM streaming
  | { type: "llm:thinking:delta"; delta: string }
  | { type: "llm:text:delta"; delta: string }
  | { type: "llm:retry"; attempt: number; maxRetries: number; delayMs: number; error: string; level: "stream" | "turn" }
  | { type: "llm:usage"; inputTokens: number; outputTokens: number }

  // Turn lifecycle
  | { type: "turn:start" }
  | { type: "turn:streaming:start" }
  | { type: "turn:end"; stopReason?: string; usage?: { input: number; output: number; cacheRead: number; cacheWrite: number; total: number; cost: { total: number } } }
  | { type: "turn:abort"; reason: "user" | "system" }
  | { type: "turn:error"; error: string; attempt?: number; maxRetries?: number }

  // Processing state
  | { type: "processing:start" }
  | { type: "processing:stop" }

  // UI messages
  | { type: "message:user"; text: string; images?: ImageContent[] }
  | { type: "ui:info"; text: string; display?: "toast" | "panel" }
  | { type: "ui:error"; text: string }
  | { type: "ui:warning"; text: string }
  | { type: "ui:image:pending"; image: ImageContent }
  | { type: "ui:conversation:clear" }
  | { type: "ui:focus:editor" }

  // MCP
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
  private handlers = new Map<HarnessEventType, Set<(event: HarnessEvent) => void>>();

  constructor(logger: Logger) {
    this.logger = logger;
  }

  on<E extends HarnessEventType>(type: E, handler: EventHandler<E>): () => void {
    let set = this.handlers.get(type);
    if (!set) {
      set = new Set();
      this.handlers.set(type, set);
    }
    const wrapped = (event: HarnessEvent) =>
      handler(event as Extract<HarnessEvent, { type: E }>);
    set.add(wrapped);
    return () => {
      set?.delete(wrapped);
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
