import type { ImageContent } from "@mariozechner/pi-ai";
import type { McpServerInfo } from "../ui/shared/types.js";
import type { AppInstance } from "../mcp/app/types.js";
import type { ConfigData } from "../ui/shared/types.js";

// ── HarnessEvent discriminated union ──

export type HarnessEvent =
  // LLM streaming
  | { type: "llm:thinking:delta"; delta: string }
  | { type: "llm:text:delta"; delta: string }
  | { type: "llm:retry"; attempt: number; maxRetries: number; delayMs: number; error: string; level: "stream" | "turn" }
  | { type: "llm:usage"; inputTokens: number; outputTokens: number }

  // Tool execution
  | { type: "tool:start"; name: string; args: unknown }
  | { type: "tool:end"; name: string; result: unknown; isError: boolean }

  // Turn lifecycle
  | { type: "turn:start" }
  | { type: "turn:streaming:start" }
  | { type: "turn:end"; stopReason?: string; usage?: { inputTokens: number; outputTokens: number } }
  | { type: "turn:abort"; reason: "user" | "system" }
  | { type: "turn:error"; error: string; attempt?: number; maxRetries?: number }

  // Processing state
  | { type: "processing:start" }
  | { type: "processing:stop" }

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
  | { type: "mcp:app:registered"; app: AppInstance };

export type HarnessEventType = HarnessEvent["type"];

export type EventHandler<E extends HarnessEventType = HarnessEventType> = (
  event: Extract<HarnessEvent, { type: E }>,
) => void;

// ── HarnessEventBus ──

export class HarnessEventBus {
  private handlers = new Map<string, Set<EventHandler<any>>>();

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
        console.error(`[HarnessEventBus] handler error for "${event.type}":`, err);
      }
    }
  }

  /** Remove all handlers. */
  clear(): void {
    this.handlers.clear();
  }
}
