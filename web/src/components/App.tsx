import { useState, useCallback, useRef, useEffect } from "react";
import type { UIMessage, ServerEvent, ConfigData, SessionInfo, McpServerInfo, ImageAttachment, FileListItem, ContextWindowData } from "../types";
import { conversationReducer } from "@dscode/shared/reducer";
import { useWebSocket } from "../hooks/useWebSocket";
import { ChatView } from "./ChatView";
import { MessageInput } from "./MessageInput";
import { Sidebar } from "./Sidebar";
import { ToastContainer, useToasts } from "./Toast";
import { CommandPanel } from "./CommandPanel";
import { ContextWindowBar } from "./ContextWindowBar";
import { ViewModeSwitcher } from "./ViewModeSwitcher";
import { ArtifactContainer } from "./ArtifactContainer";
import { TransitionCanvas } from "./TransitionCanvas";
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

function sessionsEqual(a: SessionInfo[], b: SessionInfo[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((s, i) =>
    s.id === b[i].id &&
    s.updatedAt === b[i].updatedAt &&
    s.messageCount === b[i].messageCount &&
    s.contentHash === b[i].contentHash
  );
}

function getInitialTheme(): "light" | "dark" {
  const saved = localStorage.getItem("dscode-theme");
  if (saved === "dark" || saved === "light") return saved;
  return "light";
}

function loadDashCache(): Record<string, { contentHash: string; html: string }> {
  try {
    const raw = localStorage.getItem("dscode-dash-cache");
    if (raw) return JSON.parse(raw);
  } catch { /* ignore corrupt cache */ }
  return {};
}

function saveDashCache(cache: Record<string, { contentHash: string; html: string }>): void {
  try {
    localStorage.setItem("dscode-dash-cache", JSON.stringify(cache));
  } catch { /* ignore storage errors */ }
}

const MAX_DASH_CACHE = 20;

export function App() {
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [processing, setProcessing] = useState(false);
  const [config, setConfig] = useState<ConfigData | null>(null);
  const [model, setModel] = useState("");
  const [permissionPrompt, setPermissionPrompt] = useState<{ toolName: string; preview: string; fuzzyPattern?: string | null; fuzzyArgDesc?: string | null; llmSuggestions?: { label: string; toolPattern: string | null; argPattern: string | null }[] } | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<"sessions" | "mcp" | "settings">("sessions");
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [mcpServers, setMcpServers] = useState<McpServerInfo[]>([]);
  const [fileListItems, setFileListItems] = useState<FileListItem[]>([]);
  const [fileListPrefix, setFileListPrefix] = useState("");
  const [theme, setTheme] = useState<"light" | "dark">(getInitialTheme);
  const [contextWindow, setContextWindow] = useState<ContextWindowData | null>(null);
  const [commandPanel, setCommandPanel] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"chat" | "dashboard">("chat");
  const [artifactHtml, setArtifactHtml] = useState("");
  const [artifactLoading, setArtifactLoading] = useState(false);
  const [transitionPhase, setTransitionPhase] = useState<"idle" | "animating">("idle");
  const { toasts, addToast, removeToast } = useToasts();
  const turnStartRef = useRef<number>(0);
  const permissionPromptRef = useRef(permissionPrompt);
  permissionPromptRef.current = permissionPrompt;
  const currentSessionIdRef = useRef(currentSessionId);
  currentSessionIdRef.current = currentSessionId;
  const prevSessionIdRef = useRef<string | null>(null);
  const dashCacheRef = useRef<Record<string, { contentHash: string; html: string }>>(loadDashCache());
  const artifactHtmlRef = useRef(artifactHtml);
  artifactHtmlRef.current = artifactHtml;
  const artifactLoadingRef = useRef(artifactLoading);
  artifactLoadingRef.current = artifactLoading;
  const chatContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = document.documentElement;
    theme === "dark" ? root.classList.add("dark") : root.classList.remove("dark");
    localStorage.setItem("dscode-theme", theme);
  }, [theme]);

  // Session switch in Dashboard mode resets to Chat
  useEffect(() => {
    const prev = prevSessionIdRef.current;
    prevSessionIdRef.current = currentSessionId;
    if (prev !== null && prev !== currentSessionId && viewMode === "dashboard") {
      setViewMode("chat");
    }
  }, [currentSessionId, viewMode]);

  // Dashboard unavailable when session is empty
  useEffect(() => {
    if (messages.length === 0 && viewMode === "dashboard") {
      setViewMode("chat");
    }
  }, [messages, viewMode]);

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
      case "tool_progress":
      case "tool_start":
      case "tool_end":
      case "mcp_app":
        setMessages((prev) => conversationReducer(prev, event));
        break;
      case "assistant_end":
        setMessages((prev) => conversationReducer(prev, event));
        break;
      case "clear_conversation":
        setMessages((prev) => conversationReducer(prev, event));
        setPermissionPrompt(null);
        break;
      case "assistant_start":
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
      case "warning": addToast({ type: "warning", text: event.text }); break;
      case "error": addToast({ type: "error", text: event.text }); setProcessing(false); turnStartRef.current = 0; break;
      case "permission_prompt": setPermissionPrompt({ toolName: event.toolName, preview: event.preview, fuzzyPattern: (event as any).fuzzyPattern ?? null, fuzzyArgDesc: (event as any).fuzzyArgDesc ?? null, llmSuggestions: (event as any).llmSuggestions ?? undefined }); break;
      case "loader":
        setProcessing(event.state === "show");
        if (event.state === "show") {
          if (!turnStartRef.current) turnStartRef.current = Date.now();
        } else {
          turnStartRef.current = 0;
        }
        break;
      case "sessions": { setSessions((p) => sessionsEqual(p, event.data) ? p : event.data); setCurrentSessionId(event.currentSessionId ?? null); if (event.currentSessionId) { const cs = event.data.find((s: SessionInfo) => s.id === event.currentSessionId); if (cs?.pendingPermission && !permissionPromptRef.current) { setPermissionPrompt({ toolName: cs.pendingPermission.toolName, preview: cs.pendingPermission.preview, fuzzyPattern: cs.pendingPermission.fuzzyPattern ?? null }); } } break; }
      case "session_time": { const csid = currentSessionIdRef.current; if (csid) { setSessions((prev) => prev.map((s) => s.id === csid ? { ...s, totalActiveMs: event.totalActiveMs } : s)); } break; }
        break;
      case "mcp_state": setMcpServers(event.servers); break;
      case "mcp_open_browser": setSidebarOpen(true); setSidebarTab("mcp"); break;
      case "model": setModel(event.name); break;
      case "context_window": setContextWindow(event); break;
      case "config": setConfig(event.data); break;
      case "file_list_result": setFileListItems(event.items); setFileListPrefix(event.prefix); break;
      case "artifact_start":
        setArtifactHtml("");
        setArtifactLoading(true);
        break;
      case "artifact_delta":
        setArtifactHtml((prev) => prev + event.delta);
        break;
      case "artifact_end": {
        setArtifactLoading(false);
        const csid = currentSessionIdRef.current;
        if (csid) {
          const session = sessions.find((s) => s.id === csid);
          if (session) {
            const cache = dashCacheRef.current;
            const entries = Object.keys(cache);
            if (entries.length >= MAX_DASH_CACHE && !cache[csid]) {
              // Evict oldest entry
              delete cache[entries[0]];
            }
            cache[csid] = { contentHash: session.contentHash, html: artifactHtmlRef.current };
            saveDashCache(cache);
          }
        }
        break;
      }
    }
  }, [addToast, sessions]);

  const { connected, send } = useWebSocket(handleEvent);

  const handleSend = useCallback((text: string, images?: ImageAttachment[], fileRefs?: string[], uploadedFiles?: { name: string; content: string }[]) => {
    if (!text.trim() && (!images || images.length === 0) && (!uploadedFiles || uploadedFiles.length === 0)) return;
    turnStartRef.current = Date.now();
    setProcessing(true);
    if (viewMode === "dashboard") {
      send({ type: "artifact", action: "update", instruction: text });
    } else {
      send({ type: "chat", text, images: images?.length ? images : undefined, fileRefs: fileRefs?.length ? fileRefs : undefined, uploadedFiles: uploadedFiles?.length ? uploadedFiles : undefined });
    }
  }, [send, viewMode]);

  const handlePermission = useCallback((decision: "allow" | "always_allow" | "always_allow_save" | "deny", explainText?: string, toolNamePattern?: string, fuzzyMode?: number) => {
    send({
      type: explainText ? "permission_response" : "permission",
      decision,
      persistRule: decision === "always_allow_save",
      denyReason: explainText,
      toolNamePattern,
      fuzzyMode,
      sessionGrantPattern: (decision === "always_allow" || (decision === "allow" && fuzzyMode === 1)) ? toolNamePattern : undefined,
    });
    setPermissionPrompt(null);
  }, [send]);
  const handleAbort = useCallback(() => send({ type: "abort" }), [send]);
  const handleSlashCommand = useCallback((command: string) => send({ type: "slash", command }), [send]);
  const handleCommand = useCallback((cmd: { type: "file_list"; prefix: string }) => send(cmd as any), [send]);
  const handleConfigChange = useCallback((action: string, value: string) => send({ type: "config", action: action as any, value }), [send]);
  const handleSessionAction = useCallback((action: "list" | "save" | "load" | "delete", id?: string) => send({ type: "session", action, id }), [send]);
  const handleMcpAction = useCallback((action: "list" | "refresh" | "connect" | "disconnect", serverName?: string) => send({ type: "mcp", action, serverName } as any), [send]);
  const handleNewSession = useCallback(() => send({ type: "slash", command: "/reset" }), [send]);

  const handleViewModeChange = useCallback((mode: "chat" | "dashboard") => {
    if (mode === "chat") {
      setViewMode("chat");
      return;
    }
    // mode === "dashboard"
    if (messages.length === 0) return;
    const csid = currentSessionIdRef.current;
    if (csid) {
      const cached = dashCacheRef.current[csid];
      const sessionHash = sessions.find((s) => s.id === csid)?.contentHash;
      if (cached && sessionHash !== undefined && sessionHash !== "" && cached.contentHash === sessionHash) {
        setArtifactHtml(cached.html);
        setArtifactLoading(false);
        setViewMode("dashboard");
        return;
      }
    }
    // Check reduced motion
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setViewMode("dashboard");
      setArtifactHtml("");
      setArtifactLoading(true);
      send({ type: "artifact", action: "generate", context: "session_dashboard" });
      return;
    }
    // Start cascade transition
    setArtifactHtml("");
    setArtifactLoading(true);
    send({ type: "artifact", action: "generate", context: "session_dashboard" });
    setTransitionPhase("animating");
  }, [send, sessions, messages]);
  const handleTransitionComplete = useCallback(() => {
    // Poll until artifactLoading is confirmed false before transitioning,
    // preventing a flash of "Generating dashboard..." in ArtifactContainer.
    const tryTransition = () => {
      if (!artifactLoadingRef.current) {
        setTransitionPhase("idle");
        setViewMode("dashboard");
      } else {
        requestAnimationFrame(tryTransition);
      }
    };
    requestAnimationFrame(tryTransition);
  }, []);

  useEffect(() => { if (connected) { handleSessionAction("list"); handleMcpAction("list"); } }, [connected, handleSessionAction, handleMcpAction]);

  const hasStreaming = messages.some((m) => m.isStreaming);

  const sessionActiveMs = sessions.find((s) => s.id === currentSessionId)?.totalActiveMs ?? 0;

  return (
    <div className="h-screen flex flex-col" style={{ backgroundColor: "var(--color-bg)" }}>
      <header className="flex items-center px-4 py-2 shrink-0" style={{ backgroundColor: "var(--color-surface)", borderBottom: "1px solid var(--color-border)" }}>
        <div className="flex items-center gap-3">
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-2 rounded-btn hover:brightness-95 transition-[filter] duration-200 md:hidden" style={{ backgroundColor: "var(--color-surface-hover)" }} aria-label="Toggle sidebar">
            <List size={20} weight="bold" style={{ color: "var(--color-text)" }} />
          </button>
          <h1 className="font-bold text-lg" style={{ color: "var(--color-accent)" }}>DSCode</h1>
          {model && <span className="text-sm hidden sm:inline" style={{ color: "var(--color-text-muted)" }}>{model}</span>}
        </div>
        <div className="flex-1 flex justify-center hidden md:flex">
          <ContextWindowBar data={contextWindow} />
        </div>
        <div className="flex items-center gap-3">
          <ViewModeSwitcher viewMode={viewMode} onChange={handleViewModeChange} disabled={messages.length === 0} />
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
          sessions={sessions} currentSessionId={currentSessionId} mcpServers={mcpServers} config={config}
          onSessionAction={handleSessionAction} onMcpAction={handleMcpAction} onMcpServerAction={handleMcpAction}
          onConfigChange={handleConfigChange} isProcessing={processing} onNewSession={handleNewSession} />
        <main className="flex-1 flex flex-col min-w-0">
          <div className="flex-1 flex flex-col min-h-0" style={{ position: "relative" }}>
          {transitionPhase === "animating" && (
            <TransitionCanvas artifactReady={!artifactLoading && artifactHtml !== ""} onComplete={handleTransitionComplete} scrollContainerRef={chatContainerRef} />
          )}
          {viewMode === "dashboard" && transitionPhase === "idle" ? (
            <ArtifactContainer html={artifactHtml} loading={artifactLoading} />
          ) : (
            <ChatView messages={messages} processing={processing} hasStreaming={hasStreaming} sessionActiveMs={sessionActiveMs} permissionPrompt={permissionPrompt} onPermission={handlePermission} containerRef={chatContainerRef} scrollLocked={transitionPhase === "animating"} />
          )}
          <MessageInput onSend={handleSend} onAbort={handleAbort} onSlashCommand={handleSlashCommand} onCommand={handleCommand}
            processing={processing} slashCommands={SLASH_COMMANDS} fileListItems={fileListItems} fileListPrefix={fileListPrefix} viewMode={viewMode} projectPath={config?.projectPath ?? ""} />
          </div>
        </main>
      </div>
      <ToastContainer toasts={toasts} onRemove={removeToast} />
      {commandPanel && <CommandPanel text={commandPanel} onClose={() => setCommandPanel(null)} />}
    </div>
  );
}
