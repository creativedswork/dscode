import { useState, useCallback, useRef, useEffect } from "react";
import type { UIMessage, ServerEvent, ConfigData, SessionInfo, McpServerInfo } from "../types";
import { useWebSocket } from "../hooks/useWebSocket";
import { ChatView } from "./ChatView";
import { MessageInput } from "./MessageInput";
import { Sidebar } from "./Sidebar";
import { ToastContainer, useToasts } from "./Toast";

const SLASH_COMMANDS = [
  { name: "help", description: "Show available commands" },
  { name: "reset", description: "Clear conversation history" },
  { name: "session", description: "Session management (list|save|load|delete)" },
  { name: "memory", description: "Memory management (list|add|remove|clear)" },
  { name: "skills", description: "Skill management (list|activate|deactivate)" },
  { name: "drivers", description: "List loaded drivers" },
  { name: "mcp", description: "Browse MCP servers and tools" },
  { name: "permissions", description: "Show session permission grants" },
  { name: "cost", description: "Show token usage for this session" },
  { name: "compact", description: "Force context compaction" },
  { name: "config", description: "Show or change user command config" },
  { name: "image", description: "Attach an image (file path or 'clipboard')" },
];

/** Always produce a new array; update last message immutably if streaming, else push new. */
function updateLastOrCreate(prev: UIMessage[], update: (msg: UIMessage) => Partial<UIMessage>): UIMessage[] {
  const next = [...prev];
  const last = next[next.length - 1];
  if (last?.isStreaming) {
    next[next.length - 1] = { ...last, ...update(last) };
  } else {
    next.push({
      id: `assistant-${Date.now()}`,
      role: "assistant",
      content: "",
      thinking: "",
      tools: [],
      isStreaming: true,
      ...update({} as UIMessage),
    });
  }
  return next;
}

export function App() {
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [processing, setProcessing] = useState(false);
  const [config, setConfig] = useState<ConfigData | null>(null);
  const [model, setModel] = useState("");
  const [permissionPrompt, setPermissionPrompt] = useState<{
    toolName: string;
    preview: string;
  } | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<"sessions" | "mcp" | "settings">("sessions");
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [mcpServers, setMcpServers] = useState<McpServerInfo[]>([]);
  const { toasts, addToast, removeToast } = useToasts();

  // Track when the current assistant turn started (for timer)
  const turnStartRef = useRef<number>(0);

  const handleEvent = useCallback((event: ServerEvent) => {
    switch (event.type) {
      case "ready": {
        setModel(event.model);
        setConfig(event.config);
        const msgs: UIMessage[] = event.messages.map((m, i) => ({
          id: `hist-${i}`,
          role: m.role,
          content: m.content,
          thinking: m.thinking,
          tools: m.tools,
        }));
        setMessages(msgs);
        break;
      }

      case "user_message": {
        setMessages((prev) => [...prev, {
          id: `user-${Date.now()}`,
          role: "user",
          content: event.text,
        }]);
        break;
      }

      case "assistant_start": {
        turnStartRef.current = Date.now();
        setProcessing(true);
        break;
      }

      case "thinking_delta": {
        setMessages((prev) => updateLastOrCreate(prev, (msg) => ({
          thinking: (msg.thinking ?? "") + event.delta,
        })));
        break;
      }

      case "text_delta": {
        setMessages((prev) => updateLastOrCreate(prev, (msg) => ({
          content: msg.content + event.delta,
        })));
        break;
      }

      case "tool_start": {
        setMessages((prev) => updateLastOrCreate(prev, (msg) => {
          const tools = [...(msg.tools ?? []), {
            name: event.name,
            args: typeof event.args === "string" ? event.args : JSON.stringify(event.args).slice(0, 80),
            result: "",
            isError: false,
          }];
          return { tools };
        }));
        break;
      }

      case "tool_end": {
        setMessages((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last?.isStreaming) {
            const tools = (last.tools ?? []).map((t) =>
              t.name === event.name && !t.result
                ? { ...t, result: event.result, isError: event.isError }
                : t
            );
            next[next.length - 1] = { ...last, tools };
          }
          return next;
        });
        break;
      }

      case "assistant_end": {
        setMessages((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last?.isStreaming) {
            next[next.length - 1] = { ...last, isStreaming: false };
          }
          return next;
        });
        // Keep processing=true — agent is still working between turns
        break;
      }

      case "info": {
        addToast({ type: "info", text: event.text });
        break;
      }

      case "error": {
        addToast({ type: "error", text: event.text });
        setProcessing(false);
        turnStartRef.current = 0;
        break;
      }

      case "permission_prompt": {
        setPermissionPrompt({ toolName: event.toolName, preview: event.preview });
        break;
      }

      case "loader": {
        setProcessing(event.state === "show");
        break;
      }

      case "config": {
        setConfig(event.data);
        break;
      }

      case "sessions": {
        setSessions(event.data);
        break;
      }

      case "mcp_state": {
        setMcpServers(event.servers);
        break;
      }

      case "model": {
        setModel(event.name);
        break;
      }
    }
  }, [addToast]);

  const { connected, send } = useWebSocket(handleEvent);

  const handleSend = useCallback(
    (text: string) => {
      if (!text.trim()) return;
      send({ type: "chat", text });
    },
    [send],
  );

  const handlePermission = useCallback(
    (decision: "allow" | "always_allow" | "deny") => {
      send({
        type: "permission",
        decision,
        persistRule: decision === "always_allow",
      });
      setPermissionPrompt(null);
    },
    [send],
  );

  const handleAbort = useCallback(() => {
    send({ type: "abort" });
  }, [send]);

  const handleSlashCommand = useCallback(
    (command: string) => {
      send({ type: "slash", command });
    },
    [send],
  );

  const handleConfigChange = useCallback(
    (action: string, value: string) => {
      send({ type: "config", action: action as any, value });
    },
    [send],
  );

  const handleSessionAction = useCallback(
    (action: "list" | "save" | "load" | "delete", id?: string) => {
      send({ type: "session", action, id });
    },
    [send],
  );

  const handleMcpAction = useCallback(
    (action: "list" | "refresh") => {
      send({ type: "mcp", action });
    },
    [send],
  );

  useEffect(() => {
    if (connected) {
      handleSessionAction("list");
      handleMcpAction("list");
    }
  }, [connected, handleSessionAction, handleMcpAction]);

  const hasStreaming = messages.some((m) => m.isStreaming);

  return (
    <div className="h-screen flex flex-col bg-dscode-bg">
      <header className="flex items-center justify-between px-4 py-2 border-b border-dscode-border bg-dscode-surface shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2 rounded-lg hover:bg-gray-700 transition-colors md:hidden"
            aria-label="Toggle sidebar"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <h1 className="font-bold text-dscode-accent text-lg">DSCode</h1>
          {model && (
            <span className="text-dscode-muted text-sm hidden sm:inline">
              · {model}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-full ${
              connected ? "bg-green-900/30 text-dscode-green" : "bg-red-900/30 text-dscode-red"
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${connected ? "bg-dscode-green" : "bg-dscode-red"}`} />
            {connected ? "Connected" : "Reconnecting..."}
          </span>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          activeTab={sidebarTab}
          onTabChange={setSidebarTab}
          sessions={sessions}
          mcpServers={mcpServers}
          config={config}
          onSessionAction={handleSessionAction}
          onMcpAction={handleMcpAction}
          onConfigChange={handleConfigChange}
        />

        <main className="flex-1 flex flex-col min-w-0">
          <ChatView
            messages={messages}
            processing={processing}
            hasStreaming={hasStreaming}
            permissionPrompt={permissionPrompt}
            onPermission={handlePermission}
          />
          <MessageInput
            onSend={handleSend}
            onAbort={handleAbort}
            onSlashCommand={handleSlashCommand}
            processing={processing}
            slashCommands={SLASH_COMMANDS}
          />
        </main>
      </div>

      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </div>
  );
}
