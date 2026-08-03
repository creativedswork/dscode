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

  constructor(readonly agent: PiAgentRuntime) {}

  async start(input: AgentProcessInput, signal: AbortSignal): Promise<AgentProcessOutput> {
    const onAbort = () => this.agent.abort();
    let activeTools = 0;
    const unsubscribe = this.agent.subscribe(async (event) => {
      if (event.type === "tool_execution_start" && activeTools++ === 0) {
        await input.onStateChange?.("waiting");
      } else if (event.type === "tool_execution_end" && --activeTools === 0) {
        await input.onStateChange?.("running");
      } else if (event.type === "turn_end") {
        await input.onCheckpoint?.(this.snapshot());
      }
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
