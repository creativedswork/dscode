import type { AgentSessionMessage, DisplayMessage } from "./types.js";
import { ImageCache } from "../utils/image-cache.js";
import { formatSubagentLabel } from "../ui/shared/agent-label.js";
import { formatToolArgsForDisplay } from "../ui/shared/tool-args-formatter.js";
import { createToolResultProjection } from "../ui/shared/tool-result-projection.js";

// ── Helpers ──

function extractText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((b: any) => b && b.type === "text")
    .map((b: any) => b.text)
    .join("\n");
}

function extractImagesFromBlocks(blocks: any[]): { data: string; mimeType: string }[] | undefined {
  const imageBlocks = blocks.filter((b: any) => b && b.type === "image" && b.data);
  if (imageBlocks.length === 0) return undefined;
  return imageBlocks.map((b: any) => ({
    data: b.data,
    mimeType: b.mimeType ?? "image/png",
  }));
}

function extractThinkingFromContent(blocks: any[]): string | undefined {
  const parts: string[] = [];
  for (const b of blocks) {
    if (b && b.type === "thinking" && typeof b.thinking === "string" && b.thinking) {
      parts.push(b.thinking);
    }
  }
  return parts.length > 0 ? parts.join("\n\n") : undefined;
}

function extractToolResultText(blocks: any[]): string {
  if (!Array.isArray(blocks)) return "";
  return blocks
    .filter((b: any) => b && b.type === "text")
    .map((b: any) => b.text)
    .join("\n");
}

function isInternalAgentNotification(message: any): boolean {
  return message?.role === "user"
    && extractText(message.content).trimStart().startsWith("<agent_notifications>");
}

function recoverSubagentDescriptions(messages: any[]): Map<string, string> {
  const descriptionsByCall = new Map<string, string>();
  const descriptionsByAgent = new Map<string, string>();

  for (const message of messages) {
    if (message?.role === "assistant" && Array.isArray(message.content)) {
      for (const block of message.content) {
        const description = block?.arguments?.description;
        if (
          block?.type === "toolCall"
          && block.name === "spawn_agent"
          && typeof block.id === "string"
          && typeof description === "string"
        ) {
          descriptionsByCall.set(block.id, description);
        }
      }
    }
    if (message?.role !== "toolResult") continue;
    const description = descriptionsByCall.get(message.toolCallId);
    const agentId = message.details?.agentId;
    if (description && typeof agentId === "string") {
      descriptionsByAgent.set(agentId, description);
    }
  }

  return descriptionsByAgent;
}

// ── Main ──

/**
 * Rebuild display-ready messages from raw Main Agent messages and child Agent logs.
 *
 * - agent.state.messages → the model's actual input (may contain <image_description>)
 * - agentMessages → links child Agent attachments to messages by messageIndex
 *
 * The display layer strips machine-generated descriptions and restores original images
 * from cache, so the user sees their own text + images instead of text descriptions.
 *
 * For AssistantMessage, tool calls and thinking are extracted from the content array
 * (pi-ai stores them as inline blocks). ToolResultMessage results are matched back
 * to their parent AssistantMessage's tool calls and the standalone result messages
 * are excluded from output.
 */
export function rebuildDisplayMessages(
  messages: any[],
  agentMessages: AgentSessionMessage[],
  parentSessionId = "unknown",
): DisplayMessage[] {
  const recoveredDescriptions = recoverSubagentDescriptions(messages);
  const agentMap = new Map<number, AgentSessionMessage>();
  for (const message of agentMessages) {
    if (message.messageIndex !== undefined) {
      agentMap.set(message.messageIndex, message);
    }
  }

  // Pass 1: sequential scan — extract tool calls, match results, collect output indices
  const output = new Set<number>(); // message indices to emit
  const pendingResults = new Map<number, Map<string, { rawResult: string; isError: boolean; toolName: string }>>();
  const parsedToolsByAssistant = new Map<number, { id: string; name: string; args: string }[]>();
  // pendingResults: assistantMsgIndex → (toolCallId → { result, isError, toolName })

  let lastAssistantIdx = -1;
  let lastAssistantToolIds: Map<string, number> | null = null; // toolCallId → tool entry index

  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    if (!m) continue;

    if (m.role === "assistant") {
      // Emit the previous assistant (if any) — all its tool results are now collected
      output.add(i);
      lastAssistantIdx = i;

      // Extract tool calls from this assistant's content
      const contentArr = Array.isArray(m.content) ? m.content : [];
      const toolCalls: { id: string; name: string; args: string }[] = [];
      for (const b of contentArr) {
        if (b && b.type === "toolCall" && b.name && b.id) {
          const args = formatToolArgsForDisplay(b.name, b.arguments);
          toolCalls.push({ id: b.id, name: b.name, args });
        }
      }

      if (toolCalls.length > 0) {
        lastAssistantToolIds = new Map<string, number>();
        for (let ti = 0; ti < toolCalls.length; ti++) {
          lastAssistantToolIds.set(toolCalls[ti].id, ti);
        }
        parsedToolsByAssistant.set(i, toolCalls);
      } else {
        lastAssistantToolIds = null;
      }
    } else if (m.role === "toolResult" && lastAssistantToolIds) {
      // Try to match to the last assistant's tool calls
      const toolCallId: string | undefined = m.toolCallId;
      if (toolCallId && lastAssistantToolIds.has(toolCallId)) {
        const toolIdx = lastAssistantToolIds.get(toolCallId)!;
        // Look up the tool name from the assistant's parsed tool calls
        const parsedTools = parsedToolsByAssistant.get(lastAssistantIdx);
        const toolName = parsedTools?.[toolIdx]?.name ?? "unknown";
        const rawResult = extractToolResultText(m.content);
        const isError = !!m.isError;

        let results = pendingResults.get(lastAssistantIdx);
        if (!results) {
          results = new Map();
          pendingResults.set(lastAssistantIdx, results);
        }
        results.set(toolCallId, { rawResult, isError, toolName });
        // Don't emit this ToolResultMessage — it's matched
      } else {
        // Unmatched ToolResultMessage: emit as standalone
        output.add(i);
      }
    } else {
      // UserMessage or any other role: always emit
      if (!isInternalAgentNotification(m)) output.add(i);
      lastAssistantToolIds = null;
    }
  }

  // Pass 2: build DisplayMessage[] for emitted indices
  const result: Array<{ message: DisplayMessage; sourceIndex: number }> = [];

  for (let i = 0; i < messages.length; i++) {
    if (!output.has(i)) continue;
    const m = messages[i];
    const agentMessage = agentMap.get(i);

    // Content
    let content = extractText(m.content);

    // Images
    let images: DisplayMessage["images"] = undefined;

    const imageLinkedAgent = agentMessage?.input.attachments?.some(
      (attachment) => attachment.type === "image",
    )
      ? agentMessage
      : undefined;

    if (imageLinkedAgent) {
      content = imageLinkedAgent.input.prompt;

      const restored: { data: string; mimeType: string }[] = [];
      const imageRefs = imageLinkedAgent.input.attachments
        ?.filter((attachment) => attachment.type === "image")
        .map((attachment) => attachment.data) ?? [];
      for (const ref of imageRefs) {
        const cached = ImageCache.getSync(ref);
        if (cached) {
          restored.push({ data: cached.data, mimeType: cached.mimeType });
        }
      }
      if (restored.length > 0) {
        images = restored;
      }
    } else if (Array.isArray(m.content)) {
      // Non-vision: extract inline image blocks
      images = extractImagesFromBlocks(m.content);
    }
    // Also check for stored images from native image models
    if (m.images && Array.isArray(m.images) && !images) {
      if (m.images.length > 0 && "data" in m.images[0]) {
        images = m.images as DisplayMessage["images"];
      }
    }

    // Thinking: extract from content blocks for assistant messages
    let thinking: string | undefined = m.thinking;
    if (m.role === "assistant" && Array.isArray(m.content)) {
      const extracted = extractThinkingFromContent(m.content);
      if (extracted) thinking = extracted;
    }

    // Tools: extract from content blocks for assistant messages, merge with results
    let tools: DisplayMessage["tools"] = Array.isArray(m.tools)
      ? m.tools.map((tool: NonNullable<DisplayMessage["tools"]>[number]) => ({ ...tool }))
      : undefined;
    if (m.role === "assistant" && Array.isArray(m.content)) {
      const parsedTools = parsedToolsByAssistant.get(i);
      if (parsedTools && parsedTools.length > 0) {
        const results = pendingResults.get(i);
        tools = parsedTools.map((tc) => {
          const r = results?.get(tc.id);
          const resultDetail = r
            ? createToolResultProjection(r.toolName, r.rawResult, {
                owner: "session",
                ownerId: parentSessionId,
                toolCallId: tc.id,
              })
            : undefined;
          return {
            toolCallId: tc.id,
            name: tc.name,
            args: tc.args,
            result: resultDetail?.summary ?? "",
            resultDetail,
            isError: r?.isError ?? false,
          };
        });
      }
    }

    // System messages with no content: preserve but with empty content
    if (m.role === "system" && !content && !images) {
      result.push({
        message: {
          role: "system",
          content: "",
          thinking,
          tools,
          createdAt: typeof m.createdAt === "number" ? m.createdAt : undefined,
        },
        sourceIndex: i,
      });
      continue;
    }

    result.push({
      message: {
        role: m.role ?? "assistant",
        content,
        images,
        thinking,
        tools,
        createdAt: typeof m.createdAt === "number" ? m.createdAt : undefined,
      },
      sourceIndex: i,
    });
  }

  const sortedAgentMessages = agentMessages
    .map((message, index) => ({ message, index }))
    .sort((a, b) => a.message.createdAt - b.message.createdAt || a.index - b.index);

  for (const { message: agentMessage } of sortedAgentMessages) {
    const displayMessage: DisplayMessage = {
      role: "agent",
      content: "",
      createdAt: agentMessage.createdAt,
      agentActivity: {
        agentId: agentMessage.agentId,
        executionId: agentMessage.agentId,
        parentAgentId: agentMessage.parentAgentId,
        parentSessionId,
        label: formatSubagentLabel(
          agentMessage.description
          ?? recoveredDescriptions.get(agentMessage.agentId),
          agentMessage.application,
        ),
        application: agentMessage.application,
        attachment: agentMessage.attachment ?? "foreground",
        state: agentMessage.state,
        input: agentMessage.input.prompt,
        output: agentMessage.output?.text,
        error: agentMessage.output?.error,
        tools: agentMessage.tools?.map((tool) => ({ ...tool })),
        createdAt: agentMessage.createdAt,
        startedAt: agentMessage.startedAt,
        endedAt: agentMessage.endedAt,
      },
    };

    if (agentMessage.messageIndex !== undefined) {
      let insertAt = -1;
      for (let i = result.length - 1; i >= 0; i--) {
        if (result[i].sourceIndex === agentMessage.messageIndex) {
          insertAt = i + 1;
          while (
            insertAt < result.length
            && result[insertAt].message.role === "agent"
          ) {
            insertAt++;
          }
          break;
        }
      }
      if (insertAt >= 0) {
        result.splice(insertAt, 0, {
          message: displayMessage,
          sourceIndex: agentMessage.messageIndex,
        });
        continue;
      }
    }

    const timestampInsertAt = result.findIndex(
      (entry) =>
        typeof entry.message.createdAt === "number"
        && entry.message.createdAt > agentMessage.createdAt,
    );
    if (timestampInsertAt >= 0) {
      result.splice(timestampInsertAt, 0, {
        message: displayMessage,
        sourceIndex: -1,
      });
    } else {
      result.push({ message: displayMessage, sourceIndex: -1 });
    }
  }

  return result.map((entry) => entry.message);
}
