import type { UIMessage, ToolCallEntry, ConversationMessage, ServerEvent, ImageAttachment } from "./types.js";

function normalizeContent(c: unknown): string {
  if (typeof c === "string") return c;
  if (Array.isArray(c)) {
    return (c as any[]).filter((b) => b.type === "text").map((b) => b.text).join("\n");
  }
  return "";
}

function updateLastOrCreate(
  prev: UIMessage[],
  update: (msg: UIMessage) => Partial<UIMessage>,
): UIMessage[] {
  const next = [...prev];
  const last = next[next.length - 1];
  if (last?.isStreaming) {
    next[next.length - 1] = { ...last, ...update(last) };
  } else {
    next.push({
      id: `assistant-${Date.now()}`,
      role: "assistant" as const,
      content: "",
      thinking: "",
      tools: [],
      isStreaming: true,
      images: undefined,
      ...update({ id: "", role: "assistant" as const, content: "", thinking: "", tools: [] }),
    });
  }
  return next;
}

export function conversationReducer(prev: UIMessage[], event: ServerEvent): UIMessage[] {
  switch (event.type) {
    case "ready":
      return (event.messages as any[]).map((m: any, i) => ({
        id: `hist-${i}`,
        role: m.role,
        content: normalizeContent(m.content),
        thinking: typeof m.thinking === "string" ? m.thinking : "",
        tools: Array.isArray(m.tools) ? m.tools : [],
        images: Array.isArray(m.images) ? m.images : [],
      }));

    case "user_message":
      return [
        ...prev,
        {
          id: `user-${Date.now()}`,
          role: "user" as const,
          content: normalizeContent(event.text),
          images: (event as any).images ?? [],
        },
      ];

    case "assistant_start":
      return prev;

    case "thinking_delta":
      return updateLastOrCreate(prev, (msg) => ({
        thinking: (msg.thinking ?? "") + event.delta,
      }));

    case "text_delta":
      return updateLastOrCreate(prev, (msg) => ({
        content: msg.content + event.delta,
      }));

    case "tool_start":
      return updateLastOrCreate(prev, (msg) => {
        const tools: ToolCallEntry[] = [
          ...(msg.tools ?? []),
          {
            name: event.name,
            args: typeof event.args === "string" ? event.args : JSON.stringify(event.args).slice(0, 80),
            result: "",
            isError: false,
            images: [],
          },
        ];
        return { tools };
      });

    case "tool_end": {
      const next = [...prev];
      const last = next[next.length - 1];
      if (last?.isStreaming) {
        const tools = (last.tools ?? []).map((t) =>
          t.name === event.name && !t.result
            ? { ...t, result: event.result, isError: event.isError, images: (event as any).images ?? t.images }
            : t,
        );
        next[next.length - 1] = { ...last, tools };
      }
      return next;
    }

    case "mcp_app": {
      const next = [...prev];
      for (let i = next.length - 1; i >= 0; i--) {
        const msg = next[i];
        if (msg.tools) {
          const idx = msg.tools.findIndex((t) => t.name === event.app.toolName);
          if (idx >= 0) {
            const nt = [...msg.tools];
            nt[idx] = { ...nt[idx], mcpApp: event.app };
            next[i] = { ...msg, tools: nt };
            break;
          }
        }
      }
      return next;
    }

    case "assistant_end": {
      const next = [...prev];
      const last = next[next.length - 1];
      if (last?.isStreaming) {
        next[next.length - 1] = { ...last, isStreaming: false };
      }
      return next;
    }

    case "clear_conversation":
      return [];

    default:
      return prev;
  }
}
