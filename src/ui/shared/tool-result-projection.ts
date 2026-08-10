import type {
  AgentToolActivity,
  ToolResultProjection,
  ToolResultRef,
} from "./types.js";
import {
  findToolResultText,
  toolResultText,
} from "../../application/tool-result-text.js";
import { formatToolArgsForDisplay } from "./tool-args-formatter.js";
import { formatToolResultForUI } from "./tool-result-formatter.js";

export const TOOL_RESULT_INLINE_CHAR_LIMIT = 16_000;
export { findToolResultText, toolResultText };

export function createToolResultProjection(
  toolName: string,
  value: unknown,
  ref?: ToolResultRef,
): ToolResultProjection {
  const text = toolResultText(value);
  const summary = formatToolResultForUI(toolName, text);
  const counts = {
    charCount: text.length,
    lineCount: text.length === 0 ? 0 : text.split("\n").length,
  };
  if (text.length <= TOOL_RESULT_INLINE_CHAR_LIMIT || !ref) {
    return { summary, text, ...counts };
  }
  return { summary, ref, ...counts };
}

export type ToolResultRefResolver = (ref: ToolResultRef) => string | undefined;

export function resolveToolResultText(
  projection: ToolResultProjection | undefined,
  resolveRef?: ToolResultRefResolver,
): string | undefined {
  if (!projection) return undefined;
  if (projection.text !== undefined) return projection.text;
  return projection.ref && resolveRef
    ? resolveRef(projection.ref)
    : undefined;
}

export function projectTranscriptToolActivities(
  messages: readonly unknown[],
  ownerId: string,
): AgentToolActivity[] | undefined {
  const tools = new Map<string, AgentToolActivity>();
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
          || typeof (block as { id?: unknown }).id !== "string"
          || typeof (block as { name?: unknown }).name !== "string"
        ) {
          continue;
        }
        const call = block as {
          id: string;
          name: string;
          arguments?: unknown;
        };
        tools.set(call.id, {
          toolCallId: call.id,
          name: call.name,
          status: "running",
          args: formatToolArgsForDisplay(call.name, call.arguments),
          summary: formatToolArgsForDisplay(call.name, call.arguments),
          startedAt: typeof message.timestamp === "number" ? message.timestamp : 0,
        });
      }
      continue;
    }
    if (
      message.role !== "toolResult"
      || typeof message.toolCallId !== "string"
    ) {
      continue;
    }
    const previous = tools.get(message.toolCallId);
    if (!previous) continue;
    const endedAt = typeof message.timestamp === "number"
      ? message.timestamp
      : previous.startedAt;
    const ref: ToolResultRef = {
      owner: "agent-process",
      ownerId,
      toolCallId: message.toolCallId,
    };
    const resultDetail = createToolResultProjection(
      previous.name,
      { content: message.content },
      ref,
    );
    tools.set(message.toolCallId, {
      ...previous,
      status: message.isError ? "failed" : "completed",
      resultDetail,
      endedAt,
      isError: Boolean(message.isError),
    });
  }
  return tools.size > 0 ? [...tools.values()] : undefined;
}
