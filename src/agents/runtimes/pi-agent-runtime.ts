import type {
  Agent as PiAgentRuntime,
  AgentMessage as PiAgentMessage,
} from "@earendil-works/pi-agent-core";
import type { ImageContent } from "@earendil-works/pi-ai";

import { ImageCache } from "../../drivers/vision/cache.js";
import type { ImageRef } from "../../session/types.js";
import type {
  AgentMessage,
  AgentProcessInput,
  AgentProcessOutput,
  AgentProcessRuntime,
  AgentRuntimeSnapshot,
} from "./runtime.js";
import { AgentRuntimeFailure } from "./runtime.js";

function sanitize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitize);
  if (!value || typeof value !== "object") return value;
  const record = value as Record<string, unknown>;
  if (record.type === "image") {
    return { type: "image_omitted", mimeType: record.mimeType };
  }
  return Object.fromEntries(
    Object.entries(record).map(([key, item]) => [key, sanitize(item)]),
  );
}

function messageText(message: PiAgentMessage | undefined): string {
  if (!message || message.role !== "assistant") return "";
  const content = (message as { content?: unknown }).content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((item): item is { type: "text"; text: string } =>
      Boolean(item) && typeof item === "object"
      && (item as { type?: unknown }).type === "text"
      && typeof (item as { text?: unknown }).text === "string",
    )
    .map((item) => item.text)
    .join("");
}

export class PiAgentRuntimeAdapter implements AgentProcessRuntime {
  readonly capabilities = {
    suspend: false,
    messaging: true,
  } as const;

  constructor(
    readonly agent: PiAgentRuntime,
    private readonly processId?: string,
  ) {}

  async start(input: AgentProcessInput, signal: AbortSignal): Promise<AgentProcessOutput> {
    const onAbort = () => this.agent.abort();
    const activeToolsById = new Map<string, { name: string; startedAt: number }>();
    const handleEvent = async (event: Parameters<Parameters<PiAgentRuntime["subscribe"]>[0]>[0]) => {
      if (event.type === "tool_execution_start") {
        const startedAt = Date.now();
        const wasIdle = activeToolsById.size === 0;
        activeToolsById.set(event.toolCallId, {
          name: event.toolName,
          startedAt,
        });
        if (wasIdle) await input.onStateChange?.("waiting");
        await input.onProgress?.({
          phase: "tool",
          message: `Running ${event.toolName}`,
          details: {
            kind: "tool",
            status: "running",
            toolCallId: event.toolCallId,
            toolName: event.toolName,
            args: summarizeToolArgs(event.args),
            startedAt,
          },
        });
      } else if (event.type === "tool_execution_end") {
        const active = activeToolsById.get(event.toolCallId);
        activeToolsById.delete(event.toolCallId);
        const remaining = [...activeToolsById.values()].map((tool) => tool.name);
        const endedAt = Date.now();
        await input.onProgress?.({
          phase: remaining.length > 0 ? "tool" : "model",
          message: remaining.length > 0
            ? `Running ${remaining.join(", ")}`
            : `Finished ${event.toolName}; preparing result`,
          details: {
            kind: "tool",
            status: event.isError ? "failed" : "completed",
            toolCallId: event.toolCallId,
            toolName: event.toolName,
            startedAt: active?.startedAt ?? endedAt,
            endedAt,
            isError: event.isError,
            result: sanitize(event.result),
            resultOwnerId: this.processId,
          },
        });
        if (active && activeToolsById.size === 0) {
          await input.onStateChange?.("running");
        }
      } else if (event.type === "turn_end") {
        await input.onCheckpoint?.(this.snapshot());
      }
    };
    let eventQueue = Promise.resolve();
    const unsubscribe = this.agent.subscribe((event) => {
      const operation = eventQueue.then(() => handleEvent(event));
      eventQueue = operation.catch(() => {});
      return operation;
    });
    signal.addEventListener("abort", onAbort, { once: true });
    try {
      const imageAttachments = input.attachments?.filter(
        (attachment) => attachment.type === "image",
      ) ?? [];
      const images = (await Promise.all(imageAttachments.map(async (attachment) => {
        const data = attachment.data;
        return data.type === "image"
          ? data as ImageContent
          : await ImageCache.get(data as ImageRef);
      }))).filter((image): image is ImageContent => image !== null);
      await this.agent.prompt(input.prompt, images);
      // Pi's event emitter does not require subscribers to be awaited. Drain our
      // serialized queue so Process state and checkpoints cannot lag behind prompt().
      await eventQueue;
      const messages = this.agent.state.messages;
      const lastAssistant = [...messages].reverse().find((message) => message.role === "assistant");
      const assistant = lastAssistant as {
        stopReason?: string;
        errorMessage?: string;
      } | undefined;
      if (assistant?.stopReason === "error") {
        throw new AgentRuntimeFailure(
          "model_error",
          assistant.errorMessage ?? "Agent model request failed",
        );
      }
      const text = messageText(lastAssistant);
      if (!text.trim()) {
        throw new AgentRuntimeFailure("empty_output", "Agent model returned empty output");
      }
      return {
        text,
        details: { messageCount: messages.length },
      };
    } finally {
      unsubscribe();
      signal.removeEventListener("abort", onAbort);
    }
  }

  async terminate(): Promise<void> {
    this.agent.abort();
    await this.agent.waitForIdle();
  }

  kill(): void {
    this.agent.abort();
  }

  sendMessage(message: AgentMessage): void {
    this.agent.steer({
      role: "user",
      content: message.content,
      timestamp: Date.now(),
    } as PiAgentMessage);
  }

  snapshot(): AgentRuntimeSnapshot {
    const messages = this.agent.state.messages;
    const lastAssistant = [...messages].reverse().find((message) => message.role === "assistant");
    return {
      messages: sanitize(messages) as unknown[],
      usage: lastAssistant && "usage" in lastAssistant
        ? (lastAssistant as { usage?: unknown }).usage
        : undefined,
    };
  }
}

function summarizeToolArgs(args: unknown): string | undefined {
  if (args == null) return undefined;
  try {
    const value = typeof args === "string" ? args : JSON.stringify(args);
    const normalized = value.replace(/\s+/g, " ").trim();
    return normalized.length > 160
      ? `${normalized.slice(0, 157).trimEnd()}...`
      : normalized;
  } catch {
    return undefined;
  }
}
