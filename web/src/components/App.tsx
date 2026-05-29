import { useState, useCallback, useRef, useEffect } from "react";
import type { UIMessage, ServerEvent, ConfigData, SessionInfo, McpServerInfo, ImageAttachment, FileListItem } from "../types";
import { conversationReducer } from "@dscode/shared/reducer";
import { useWebSocket } from "../hooks/useWebSocket";
import { ChatView } from "./ChatView";
import { MessageInput } from "./MessageInput";
import { Sidebar } from "./Sidebar";
import { ToastContainer, useToasts } from "./Toast";
import { CommandPanel } from "./CommandPanel";
import { List, Sun, Moon } from "@phosphor-icons/react";

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

function getInitialTheme(): "light" | "dark" {
  const saved = localStorage.getItem("dscode-theme");
  if (saved === "dark" || saved === "light") return saved;
  return "light";
}

export function App() {
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [processing, setProcessing] = useState(false);
  const [config, setConfig] = useState<ConfigData | null>(null);
  const [model, setModel] = useState("");
  const [permissionPrompt, setPermissionPrompt] = useState<{ toolName: string; preview: string } | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<"sessions" | "mcp" | "settings">("sessions");
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [mcpServers, setMcpServers] = useState<McpServerInfo[]>([]);
  const [fileListItems, setFileListItems] = useState<FileListItem[]>([]);
  const [fileListPrefix, setFileListPrefix] = useState("");
  const [theme, setTheme] = useState<"light" | "dark">(getInitialTheme);
  const [commandPanel, setCommandPanel] = useState<string | null>(null);
  const { toasts, addToast, removeToast } = useToasts();
  const turnStartRef = useRef<number>(0);

  useEffect(() => {
    const root = document.documentElement;
    theme === "dark" ? root.classList.add("dark") : root.classList.remove("dark");
    localStorage.setItem("dscode-theme", theme);
  }, [theme]);

  const toggleTheme = useCallback(() => setTheme((p) => (p === "light" ? "dark" : "light")), []);

  const handleEvent = useCallback((event: ServerEvent) => {
    switch (event.type) {
      case "ready": {
        setModel(event.model);
        setConfig(event.config);
        setMessages((prev) => conversationReducer(prev, event));
        break;
      }
      case "user_message":
      case "thinking_delta":
      case "text_delta":
      case "tool_start":
      case "tool_end":
      case "mcp_app":
      case "assistant_end":
      case "clear_conversation":
        setMessages((prev) => conversationReducer(prev, event));
        break;
      case "assistant_start":
        turnStartRef.current = Date.now();
        setProcessing(true);
        break;
      case "info": {
        const txt = event.text;
        if (txt.includes("\n") || txt.startsWith("Available") || txt.startsWith("Drivers") || txt.startsWith("Skills") || txt.startsWith("Configuration") || txt.startsWith("Memories") || txt.startsWith("Session grants")) {
          setCommandPanel(txt);
        } else {
          addToast({ type: "info", text: txt });
        }
        break;
      }
      case "error": addToast({ type: "error", text: event.text }); setProcessing(false); turnStartRef.current = 0; break;
      case "permission_prompt": setPermissionPrompt({ toolName: event.toolName, preview: event.preview }); break;
      case "processing": setProcessing(event.processing); break;
      case "loader": setProcessing(event.state === "show"); break;
      case "config": setConfig(event.data); break;
      case "sessions": setSessions(event.data); break;
      case "mcp_state": setMcpServers(event.servers); break;
      case "model": setModel(event.name); break;
      case "file_list_result": setFileListItems(event.items); setFileListPrefix(event.prefix); break;
    }
  }, [addToast]);

  const { connected, send } = useWebSocket(handleEvent);

  const handleSend = useCallback((text: string, images?: ImageAttachment[]) => {
    if (!text.trim() && (!images || images.length === 0)) return;
    send({ type: "chat", text, images: images?.length ? images : undefined });
  }, [send]);
  const handlePermission = useCallback((decision: "allow" | "always_allow" | "deny", explainText?: string) => {
    send({ type: explainText ? "permission_response" : "permission", decision, persistRule: decision === "always_allow", denyReason: explainText });
    setPermissionPrompt(null);
  }, [send]);
  const handleAbort = useCallback(() => send({ type: "abort" }), [send]);
  const handleSlashCommand = useCallback((command: string) => send({ type: "slash", command }), [send]);
  const handleCommand = useCallback((cmd: { type: "file_list"; prefix: string }) => send(cmd as any), [send]);
  const handleConfigChange = useCallback((action: string, value: string) => send({ type: "config", action: action as any, value }), [send]);
  const handleSessionAction = useCallback((action: "list" | "save" | "load" | "delete", id?: string) => send({ type: "session", action, id }), [send]);
  const handleMcpAction = useCallback((action: "list" | "refresh") => send({ type: "mcp", action }), [send]);
  const handleNewSession = useCallback(() => send({ type: "slash", command: "/reset" }), [send]);

  useEffect(() => { if (connected) { handleSessionAction("list"); handleMcpAction("list"); } }, [connected, handleSessionAction, handleMcpAction]);

  const hasStreaming = messages.some((m) => m.isStreaming);

  return (
    <div className="h-screen flex flex-col" style={{ backgroundColor: "var(--color-bg)" }}>
      <header className="flex items-center justify-between px-4 py-2 shrink-0" style={{ backgroundColor: "var(--color-surface)", borderBottom: "1px solid var(--color-border)" }}>
        <div className="flex items-center gap-3">
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-2 rounded-btn hover:brightness-95 transition-[filter] duration-200 md:hidden" style={{ backgroundColor: "var(--color-surface-hover)" }} aria-label="Toggle sidebar">
            <List size={20} weight="bold" style={{ color: "var(--color-text)" }} />
          </button>
          <h1 className="font-bold text-lg" style={{ color: "var(--color-accent)" }}>DSCode</h1>
          {model && <span className="text-sm hidden sm:inline" style={{ color: "var(--color-text-muted)" }}>{model}</span>}
        </div>
        <div className="flex items-center gap-3">
          <button onClick={toggleTheme} className="p-2 rounded-btn hover:brightness-95 transition-[filter] duration-200" style={{ backgroundColor: "var(--color-surface-hover)" }} aria-label="Toggle theme">
            {theme === "light" ? <Moon size={18} weight="bold" style={{ color: "var(--color-text)" }} /> : <Sun size={18} weight="bold" style={{ color: "var(--color-text)" }} />}
          </button>
          <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1" style={{ borderRadius: "8px", backgroundColor: connected ? "var(--color-success)" : "var(--color-error)", color: connected ? "var(--color-success-text)" : "var(--color-error-text)" }}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: connected ? "var(--color-success-text)" : "var(--color-error-text)" }} />
            {connected ? "Connected" : "Reconnecting..."}
          </span>
        </div>
      </header>
      <div className="flex flex-1 overflow-hidden">
        <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} activeTab={sidebarTab} onTabChange={setSidebarTab}
          sessions={sessions} mcpServers={mcpServers} config={config}
          onSessionAction={handleSessionAction} onMcpAction={handleMcpAction}
          onConfigChange={handleConfigChange} onNewSession={handleNewSession} />
        <main className="flex-1 flex flex-col min-w-0">
          <ChatView messages={messages} processing={processing} hasStreaming={hasStreaming} permissionPrompt={permissionPrompt} onPermission={handlePermission} />
          <MessageInput onSend={handleSend} onAbort={handleAbort} onSlashCommand={handleSlashCommand} onCommand={handleCommand}
            processing={processing} slashCommands={SLASH_COMMANDS} fileListItems={fileListItems} fileListPrefix={fileListPrefix} />
        </main>
      </div>
      <ToastContainer toasts={toasts} onRemove={removeToast} />
      {commandPanel && <CommandPanel text={commandPanel} onClose={() => setCommandPanel(null)} />}
    </div>
  );
}
