import type { UIMessage, ToolCallEntry, ServerEvent } from "./types.js";
import { formatToolArgsForDisplay } from "./tool-args-formatter.js";

function normalizeContent(c: unknown): string {
  if (typeof c === "string") return c;
  if (Array.isArray(c)) {
    return (c as any[]).filter((b) => b.type === "text").map((b) => b.text).join("\n");
  }
  return "";
}

function toolHasEnded(tool: ToolCallEntry): boolean {
  return tool.resultDetail !== undefined || tool.result !== "";
}

function updateLastOrCreate(
  prev: UIMessage[],
  update: (msg: UIMessage) => Partial<UIMessage>,
  options: { messageId?: string; createdAt?: number } = {},
): UIMessage[] {
  const next = [...prev];
  const last = next[next.length - 1];
  if (last?.isStreaming) {
    next[next.length - 1] = { ...last, ...update(last) };
  } else {
    next.push({
      id: options.messageId ?? `assistant-${options.createdAt ?? Date.now()}`,
      role: "assistant" as const,
      content: "",
      thinking: "",
      tools: [],
      isStreaming: true,
      images: undefined,
      createdAt: options.createdAt ?? Date.now(),
      ...update({ id: "", role: "assistant" as const, content: "", thinking: "", tools: [] }),
    });
  }
  return next;
}

export function conversationReducer(prev: UIMessage[], event: ServerEvent): UIMessage[] {
  switch (event.type) {
    case "ready":
      return (event.messages as any[]).map((m: any, i) => ({
        id: typeof m.id === "string"
          ? m.id
          : m.role === "agent" && m.agentActivity?.agentId
            ? `agent-${m.agentActivity.agentId}`
            : `hist-${i}`,
        role: m.role,
        content: normalizeContent(m.content),
        thinking: typeof m.thinking === "string" ? m.thinking : "",
        tools: Array.isArray(m.tools)
          ? m.tools.map((tool: ToolCallEntry) => ({ ...tool }))
          : [],
        createdAt: typeof m.createdAt === "number" ? m.createdAt : undefined,
        images: Array.isArray(m.images) ? m.images : [],
        agentActivity: m.role === "agent" ? m.agentActivity : undefined,
      }));

    case "agent_activity": {
      const index = prev.findIndex(
        (message) =>
          message.role === "agent"
          && message.agentActivity?.agentId === event.activity.agentId,
      );
      const message: UIMessage = {
        id: `agent-${event.activity.agentId}`,
        role: "agent",
        content: "",
        agentActivity: event.activity,
        createdAt: event.activity.createdAt,
      };
      if (index < 0) return [...prev, message];
      return prev.map((item, itemIndex) => itemIndex === index
        ? { ...item, ...message }
        : item);
    }

    case "user_message":
      return [
        ...prev,
        {
          id: `user-${event.createdAt ?? Date.now()}-${prev.length}`,
          role: "user" as const,
          content: normalizeContent(event.text),
          images: (event as any).images ?? [],
          createdAt: event.createdAt,
        },
      ];

    case "assistant_start": {
      if (prev.at(-1)?.isStreaming) return prev;
      return [
        ...prev,
        {
          id: event.messageId ?? `assistant-${event.createdAt ?? Date.now()}`,
          role: "assistant",
          content: "",
          thinking: "",
          tools: [],
          isStreaming: true,
          createdAt: event.createdAt,
        },
      ];
    }

    case "thinking_delta":
      return updateLastOrCreate(prev, (msg) => {
        const now = event.createdAt ?? Date.now();
        return {
          thinking: (msg.thinking ?? "") + event.delta,
          thinkingStartedAt: msg.thinkingStartedAt ?? now,
          thinkingUpdatedAt: now,
        };
      }, { createdAt: event.createdAt });

    case "text_delta":
      return updateLastOrCreate(prev, (msg) => ({
        content: msg.content + event.delta,
        thinkingStartedAt: undefined,
      }), { createdAt: event.createdAt });

    case "tool_start":
      return updateLastOrCreate(prev, (msg) => {
        const entry: ToolCallEntry = {
          toolCallId: event.toolCallId,
          name: event.name,
          args: formatToolArgsForDisplay(event.name, event.args),
          result: "",
          isError: false,
          images: [],
        };
        const existing = (msg.tools ?? []).findIndex(
          (tool) => tool.toolCallId === event.toolCallId,
        );
        const tools = existing < 0
          ? [...(msg.tools ?? []), entry]
          : (msg.tools ?? []).map((tool, index) =>
              index === existing ? { ...tool, ...entry } : tool
            );
        return { tools, thinkingStartedAt: undefined };
      }, { createdAt: event.createdAt });

    case "tool_progress": {
      const next = [...prev];
      const last = next[next.length - 1];
      if (last?.isStreaming && last.tools) {
        const tools = last.tools.map((t) =>
          (event.toolCallId
            ? t.toolCallId === event.toolCallId
            : t.name === event.name && !toolHasEnded(t))
            ? { ...t, progress: event.progress, progressTotal: event.total, progressMessage: event.message }
            : t,
        );
        next[next.length - 1] = { ...last, tools };
      }
      return next;
    }

    case "tool_end": {
      const next = [...prev];
      const last = next[next.length - 1];
      if (last?.isStreaming) {
        const tools = (last.tools ?? []).map((t) =>
          t.toolCallId === event.toolCallId
            ? {
                ...t,
                result: event.result,
                resultDetail: event.resultDetail,
                isError: event.isError,
                images: event.images ?? t.images,
              }
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
          const idx = event.toolCallId
            ? msg.tools.findIndex((tool) => tool.toolCallId === event.toolCallId)
            : msg.tools.findIndex((tool) => tool.name === event.app.toolName);
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
