import type { DisplayMessage, ImageRef, VisionMessage } from "./types.js";
import { ImageCache } from "../utils/image-cache.js";

/**
 * Rebuild display-ready messages from raw agent messages and vision message logs.
 *
 * - agent.state.messages → the model's actual input (may contain <image_description>)
 * - visionMessages → links ImageRef to messages by messageIndex
 *
 * The display layer strips machine-generated descriptions and restores original images
 * from cache, so the user sees their own text + images instead of text descriptions.
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

  return messages.map((m, i) => {
    const vm = visionMap.get(i);

    // Default: content as-is, no images
    let content: string = typeof m.content === "string"
      ? m.content
      : Array.isArray(m.content)
        ? m.content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n")
        : "";
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
    } else {
      // Non-vision message: extract inline image blocks if present
      if (Array.isArray(m.content)) {
        const imageBlocks = m.content.filter((b: any) => b.type === "image" && b.data);
        if (imageBlocks.length > 0) {
          images = imageBlocks.map((b: any) => ({
            data: b.data,
            mimeType: b.mimeType ?? "image/png",
          }));
        }
      }
      // Also check for stored images from native image models
      if (m.images && Array.isArray(m.images) && !images) {
        if (m.images.length > 0 && "data" in m.images[0]) {
          images = m.images as DisplayMessage["images"];
        }
      }
    }

    // Skip system messages that have no content
    if (m.role === "system" && !content && !images) {
      return { role: "system", content: "", thinking: m.thinking, tools: m.tools };
    }

    return {
      role: m.role ?? "assistant",
      content,
      images,
      thinking: m.thinking,
      tools: m.tools,
    };
  });
}
