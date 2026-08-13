import type { AgentToolExecutionRecord } from "./types.js";

export function extractAgentToolExecutions(
  messages: readonly unknown[],
): AgentToolExecutionRecord[] | undefined {
  const tools = new Map<string, AgentToolExecutionRecord>();

  for (const candidate of messages) {
    if (!candidate || typeof candidate !== "object") continue;
    const message = candidate as {
      role?: unknown;
      content?: unknown;
      toolCallId?: unknown;
      isError?: unknown;
      timestamp?: unknown;
    };
    if (message.role === "assistant" && Array.isArray(message.content)) {
      for (const block of message.content) {
        if (
          !block
          || typeof block !== "object"
          || (block as { type?: unknown }).type !== "toolCall"
        ) continue;
        const call = block as {
          id?: unknown;
          name?: unknown;
          arguments?: unknown;
        };
        if (typeof call.id !== "string" || typeof call.name !== "string") {
          continue;
        }
        tools.set(call.id, {
          toolCallId: call.id,
          name: call.name,
          status: "running",
          args: structuredClone(call.arguments),
          startedAt: typeof message.timestamp === "number"
            ? message.timestamp
            : 0,
        });
      }
      continue;
    }
    if (
      message.role !== "toolResult"
      || typeof message.toolCallId !== "string"
    ) continue;
    const previous = tools.get(message.toolCallId);
    if (!previous) continue;
    const isError = message.isError === true;
    tools.set(message.toolCallId, {
      ...previous,
      status: isError ? "failed" : "completed",
      result: structuredClone(message.content),
      isError,
      endedAt: typeof message.timestamp === "number"
        ? message.timestamp
        : previous.startedAt,
    });
  }

  return tools.size > 0 ? [...tools.values()] : undefined;
}
