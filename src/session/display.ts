import type { DisplayMessage, ImageRef, VisionMessage } from "./types.js";
import { ImageCache } from "../utils/image-cache.js";

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

function extractToolsFromContent(blocks: any[]): { name: string; args: string; result: string; isError: boolean }[] | undefined {
  const tools: { name: string; args: string; result: string; isError: boolean }[] = [];
  for (const b of blocks) {
    if (b && b.type === "toolCall" && b.name) {
      let args = "";
      try {
        args = JSON.stringify(b.arguments ?? {}).slice(0, 80);
      } catch {
        args = String(b.arguments ?? "").slice(0, 80);
      }
      tools.push({ name: b.name, args, result: "", isError: false });
    }
  }
  return tools.length > 0 ? tools : undefined;
}

function extractToolResultText(blocks: any[]): string {
  if (!Array.isArray(blocks)) return "";
  return blocks
    .filter((b: any) => b && b.type === "text")
    .map((b: any) => b.text)
    .join("\n");
}

// ── Main ──

/**
 * Rebuild display-ready messages from raw agent messages and vision message logs.
 *
 * - agent.state.messages → the model's actual input (may contain <image_description>)
 * - visionMessages → links ImageRef to messages by messageIndex
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
  visionMessages: VisionMessage[],
): DisplayMessage[] {
  // Build a lookup: messageIndex → VisionMessage
  const visionMap = new Map<number, VisionMessage>();
  for (const vm of visionMessages) {
    visionMap.set(vm.messageIndex, vm);
  }

  // Pass 1: sequential scan — extract tool calls, match results, collect output indices
  const output = new Set<number>(); // message indices to emit
  const pendingResults = new Map<number, Map<string, { result: string; isError: boolean }>>();
  // pendingResults: assistantMsgIndex → (toolCallId → { result, isError })

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
          let args = "";
          try {
            args = JSON.stringify(b.arguments ?? {}).slice(0, 80);
          } catch {
            args = String(b.arguments ?? "").slice(0, 80);
          }
          toolCalls.push({ id: b.id, name: b.name, args });
        }
      }

      if (toolCalls.length > 0) {
        lastAssistantToolIds = new Map<string, number>();
        for (let ti = 0; ti < toolCalls.length; ti++) {
          lastAssistantToolIds.set(toolCalls[ti].id, ti);
        }
        // Store tool call metadata for later use when building output
        (m as any).__parsedTools = toolCalls;
      } else {
        lastAssistantToolIds = null;
      }
    } else if (m.role === "toolResult" && lastAssistantToolIds) {
      // Try to match to the last assistant's tool calls
      const toolCallId: string | undefined = m.toolCallId;
      if (toolCallId && lastAssistantToolIds.has(toolCallId)) {
        const toolIdx = lastAssistantToolIds.get(toolCallId)!;
        const resultText = extractToolResultText(m.content);
        const isError = !!m.isError;

        let results = pendingResults.get(lastAssistantIdx);
        if (!results) {
          results = new Map();
          pendingResults.set(lastAssistantIdx, results);
        }
        results.set(toolCallId, { result: resultText, isError });
        // Don't emit this ToolResultMessage — it's matched
      } else {
        // Unmatched ToolResultMessage: emit as standalone
        output.add(i);
      }
    } else {
      // UserMessage or any other role: always emit
      output.add(i);
      lastAssistantToolIds = null;
    }
  }

  // Pass 2: build DisplayMessage[] for emitted indices
  const result: DisplayMessage[] = [];

  for (let i = 0; i < messages.length; i++) {
    if (!output.has(i)) continue;
    const m = messages[i];
    const vm = visionMap.get(i);

    // Content
    let content = extractText(m.content);

    // Images
    let images: DisplayMessage["images"] = undefined;

    if (vm) {
      // Vision-associated message: strip <image_description>, restore images from cache
      content = content.replace(/<image_description>[\s\S]*?<\/image_description>/g, "").trim();

      const restored: { data: string; mimeType: string }[] = [];
      for (const ref of vm.images) {
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
    let tools: DisplayMessage["tools"] = m.tools;
    if (m.role === "assistant" && Array.isArray(m.content)) {
      const parsedTools = (m as any).__parsedTools as { id: string; name: string; args: string }[] | undefined;
      if (parsedTools && parsedTools.length > 0) {
        const results = pendingResults.get(i);
        tools = parsedTools.map((tc) => {
          const r = results?.get(tc.id);
          return {
            name: tc.name,
            args: tc.args,
            result: r?.result ?? "",
            isError: r?.isError ?? false,
          };
        });
      }
    }

    // Clean up temp field
    delete (m as any).__parsedTools;

    // System messages with no content: preserve but with empty content
    if (m.role === "system" && !content && !images) {
      result.push({ role: "system", content: "", thinking, tools });
      continue;
    }

    result.push({
      role: m.role ?? "assistant",
      content,
      images,
      thinking,
      tools,
    });
  }

  return result;
}
