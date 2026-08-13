export function toolResultText(value: unknown): string {
  if (typeof value === "string") return value;
  if (value == null) return "";
  if (typeof value === "object") {
    const content = (value as { content?: unknown }).content;
    if (Array.isArray(content)) {
      const text = content
        .filter((item): item is { type: "text"; text: string } =>
          Boolean(item)
          && typeof item === "object"
          && (item as { type?: unknown }).type === "text"
          && typeof (item as { text?: unknown }).text === "string",
        )
        .map((item) => item.text)
        .join("\n");
      if (text) return text;
    }
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function findToolResultText(
  messages: readonly unknown[],
  toolCallId: string,
): string | undefined {
  for (const candidate of messages) {
    if (!candidate || typeof candidate !== "object") continue;
    const message = candidate as {
      role?: unknown;
      toolCallId?: unknown;
      content?: unknown;
    };
    if (message.role !== "toolResult" || message.toolCallId !== toolCallId) {
      continue;
    }
    return toolResultText({ content: message.content });
  }
  return undefined;
}
