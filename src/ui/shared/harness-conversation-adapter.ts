import type { HarnessEvent } from "../../application/events.js";
import type {
  ImageAttachment,
  ServerEvent,
  ToolResultRef,
} from "./types.js";
import { createToolResultProjection } from "./tool-result-projection.js";

export interface HarnessConversationContext {
  sessionId?: string;
  now?: () => number;
}

function resultImages(result: unknown): ImageAttachment[] | undefined {
  if (!result || typeof result !== "object") return undefined;
  const content = (result as { content?: unknown }).content;
  if (!Array.isArray(content)) return undefined;
  const images = content.flatMap((item) => {
    if (
      !item
      || typeof item !== "object"
      || (item as { type?: unknown }).type !== "image"
      || typeof (item as { data?: unknown }).data !== "string"
    ) {
      return [];
    }
    return [{
      data: (item as { data: string }).data,
      mimeType: typeof (item as { mimeType?: unknown }).mimeType === "string"
        ? (item as { mimeType: string }).mimeType
        : "image/png",
    }];
  });
  return images.length > 0 ? images : undefined;
}

export function harnessEventToConversationEvent(
  event: HarnessEvent,
  context: HarnessConversationContext = {},
): ServerEvent | undefined {
  const createdAt = (context.now ?? Date.now)();
  switch (event.type) {
    case "llm:thinking:delta":
      return { type: "thinking_delta", delta: event.delta, createdAt };
    case "llm:text:delta":
      return { type: "text_delta", delta: event.delta, createdAt };
    case "tool:start":
      return {
        type: "tool_start",
        toolCallId: event.toolCallId,
        name: event.name,
        args: event.args,
        createdAt,
      };
    case "tool:end": {
      const ref: ToolResultRef | undefined = context.sessionId
        ? {
            owner: "session",
            ownerId: context.sessionId,
            toolCallId: event.toolCallId,
          }
        : undefined;
      const resultDetail = createToolResultProjection(event.name, event.result, ref);
      return {
        type: "tool_end",
        toolCallId: event.toolCallId,
        name: event.name,
        result: resultDetail.summary,
        resultDetail,
        isError: event.isError,
        images: resultImages(event.result),
      };
    }
    case "turn:streaming:start":
      return {
        type: "assistant_start",
        messageId: `assistant-${createdAt}`,
        createdAt,
      };
    case "turn:end":
      return { type: "assistant_end" };
    case "message:user":
      return {
        type: "user_message",
        text: event.text,
        images: event.images as ImageAttachment[] | undefined,
        createdAt,
      };
    case "ui:conversation:clear":
      return { type: "clear_conversation" };
    default:
      return undefined;
  }
}
