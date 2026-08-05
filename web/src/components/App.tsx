import { useState, useCallback, useRef, useEffect } from "react";
import type { UIMessage, ServerEvent, ConfigData, SessionInfo, McpServerInfo, SkillInfo, ImageAttachment, FileListItem, ContextWindowData, EvalDashboardServerEvent, ViewMode } from "../types";
import { conversationReducer } from "@dscode/shared/reducer";
import { useWebSocket } from "../hooks/useWebSocket";
import { ChatView } from "./ChatView";
import { MessageInput } from "./MessageInput";
import { Sidebar } from "./Sidebar";
import type { DetailPanel } from "./Sidebar";
import { ToastContainer, useToasts } from "./Toast";
import { CommandPanel } from "./CommandPanel";
import { ContextWindowBar } from "./ContextWindowBar";
import { ArtifactContainer } from "./ArtifactContainer";
import { EvalDashboardView } from "./EvalDashboardView";
import { TransitionCanvas } from "./TransitionCanvas";
import { ViewModeSelector } from "./ViewModeSelector";
import { List, Sun, Moon } from "@phosphor-icons/react";
import {
  cacheDashboardEntry,
  createDashboardCacheEntry,
  isDashboardCacheEntryValid,
  type DashboardCacheEntry,
} from "../utils/dashboardCache";
import {
  cacheCompletedEvalDashboard,
  evalDashboardCacheKey,
  getLatestEvalDashboardEntry,
  getLatestEvalDashboardEntryForTarget,
  loadEvalDashboardCache,
  saveEvalDashboardCache,
  touchEvalDashboardCacheEntry,
} from "../utils/evalDashboardCache";
import {
  evalDashboardStateFromCache,
  reduceEvalDashboardState,
  type EvalDashboardViewState,
} from "../utils/evalDashboardState";
import { openEvalDashboardHtml } from "../utils/evalExternalOpen";
import {
  canEnterSessionDashboard,
  evalCommandForSelection,
  sessionDashboardTransitionAction,
  shouldRenderMessageInput,
  viewModeAfterSessionChange,
  viewModeForMessageCount,
} from "../utils/viewMode";

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
  { name: "eval", description: "Evaluate a Session with CHIEF (/eval [session_id])" },
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

function loadDashCache(): Record<string, DashboardCacheEntry> {
  try {
    const raw = localStorage.getItem("dscode-dash-cache");
    if (raw) return JSON.parse(raw);
  } catch { /* ignore corrupt cache */ }
  return {};
}

function saveDashCache(cache: Record<string, DashboardCacheEntry>): void {
  try {
    localStorage.setItem("dscode-dash-cache", JSON.stringify(cache));
  } catch { /* ignore storage errors */ }
}

export function App() {
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [processing, setProcessing] = useState(false);
  const [config, setConfig] = useState<ConfigData | null>(null);
  const [model, setModel] = useState("");
  const [permissionPrompt, setPermissionPrompt] = useState<{ toolName: string; preview: string; fuzzyPattern?: string | null; fuzzyArgDesc?: string | null; llmSuggestions?: { label: string; toolPattern: string | null; argPattern: string | null }[] } | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activePanel, setActivePanel] = useState<DetailPanel>(null);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [mcpServers, setMcpServers] = useState<McpServerInfo[]>([]);
  const [fileListItems, setFileListItems] = useState<FileListItem[]>([]);
  const [fileListPrefix, setFileListPrefix] = useState("");
  const [theme, setTheme] = useState<"light" | "dark">(getInitialTheme);
  const [contextWindow, setContextWindow] = useState<ContextWindowData | null>(null);
  const [commandPanel, setCommandPanel] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("chat");
  const [sessionArtifactHtml, setSessionArtifactHtml] = useState("");
  const [sessionArtifactLoading, setSessionArtifactLoading] = useState(false);
  const [cacheSize, setCacheSize] = useState<{ totalBytes: number; fileCount: number; sessionCount: number } | null>(null);
  const [cacheClearing, setCacheClearing] = useState(false);
  const [skills, setSkills] = useState<SkillInfo[]>([]);

  const [transitionPhase, setTransitionPhase] = useState<"idle" | "animating">("idle");
  const viewModeRef = useRef(viewMode);
  viewModeRef.current = viewMode;
  const { toasts, addToast, removeToast } = useToasts();
  const turnStartRef = useRef<number>(0);
  const permissionPromptRef = useRef(permissionPrompt);
  permissionPromptRef.current = permissionPrompt;
  const currentSessionIdRef = useRef(currentSessionId);
  currentSessionIdRef.current = currentSessionId;
  const prevSessionIdRef = useRef<string | null>(null);
  const dashCacheRef = useRef<Record<string, DashboardCacheEntry>>(loadDashCache());
  const sessionArtifactHtmlRef = useRef(sessionArtifactHtml);
  sessionArtifactHtmlRef.current = sessionArtifactHtml;
  const sessionArtifactLoadingRef = useRef(sessionArtifactLoading);
  sessionArtifactLoadingRef.current = sessionArtifactLoading;
  const evalCacheRef = useRef(loadEvalDashboardCache());
  const initialEvalEntryRef = useRef(getLatestEvalDashboardEntry(evalCacheRef.current));
  const [latestSuccessfulEval, setLatestSuccessfulEval] = useState(initialEvalEntryRef.current);
  const [evalState, setEvalState] = useState<EvalDashboardViewState | null>(
    () => initialEvalEntryRef.current
      ? evalDashboardStateFromCache(initialEvalEntryRef.current)
      : null,
  );
  const evalStateRef = useRef(evalState);
  evalStateRef.current = evalState;
  const evalObjectUrlRef = useRef<string | null>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = document.documentElement;
    theme === "dark" ? root.classList.add("dark") : root.classList.remove("dark");
    localStorage.setItem("dscode-theme", theme);
  }, [theme]);

  useEffect(() => () => {
    if (evalObjectUrlRef.current) {
      URL.revokeObjectURL(evalObjectUrlRef.current);
    }
  }, []);

  // Session Dashboard is bound to the active Session; Eval keeps its own target.
  useEffect(() => {
    const prev = prevSessionIdRef.current;
    prevSessionIdRef.current = currentSessionId;
    const next = viewModeAfterSessionChange(viewMode, prev, currentSessionId);
    if (next !== viewMode) setViewMode(next);
  }, [currentSessionId, viewMode]);

  // Session Dashboard is unavailable when the active Session is empty.
  useEffect(() => {
    const next = viewModeForMessageCount(viewMode, messages.length);
    if (next !== viewMode) setViewMode(next);
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
      case "agent_activity":
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
      case "skill_state": setSkills(event.skills); break;
      case "mcp_state": setMcpServers(event.servers); break;
      case "mcp_open_browser": setSidebarOpen(true); setActivePanel("mcp"); break;
      case "model": setModel(event.name); break;
      case "context_window": setContextWindow(event); break;
      case "config": setConfig(event.data); break;
      case "file_list_result": setFileListItems(event.items); setFileListPrefix(event.prefix); break;
      case "artifact_start":
        setSessionArtifactHtml("");
        setSessionArtifactLoading(true);
        break;
      case "artifact_delta":
        setSessionArtifactHtml((prev) => prev + event.delta);
        break;
      case "artifact_end": {
        setSessionArtifactLoading(false);
        const csid = currentSessionIdRef.current;
        if (csid) {
          const session = sessions.find((s) => s.id === csid);
          if (session) {
            const cache = cacheDashboardEntry(
              dashCacheRef.current,
              csid,
              createDashboardCacheEntry(
                session.contentHash,
                sessionArtifactHtmlRef.current,
              ),
            );
            dashCacheRef.current = cache;
            saveDashCache(cache);
          }
        }
        break;
      }
      case "eval_dashboard": {
        const evalEvent = event as EvalDashboardServerEvent;
        const previous = evalStateRef.current;
        const next = reduceEvalDashboardState(previous, evalEvent);
        if (next === previous) break;
        evalStateRef.current = next;
        setEvalState(next);
        setTransitionPhase("idle");
        setViewMode("eval_dashboard");

        if (evalEvent.status === "completed") {
          const cache = cacheCompletedEvalDashboard(
            evalCacheRef.current,
            evalEvent,
          );
          evalCacheRef.current = cache;
          saveEvalDashboardCache(cache);
          setLatestSuccessfulEval(
            cache[evalDashboardCacheKey(
              evalEvent.targetSessionId,
              evalEvent.runId,
            )],
          );
        } else if (evalEvent.status === "failed") {
          const targetSessionId = next.targetSessionId;
          const latestForTarget = targetSessionId
            ? getLatestEvalDashboardEntryForTarget(
                evalCacheRef.current,
                targetSessionId,
              )
            : undefined;
          if (!latestForTarget) {
            setLatestSuccessfulEval(undefined);
          } else {
            const cache = touchEvalDashboardCacheEntry(
              evalCacheRef.current,
              latestForTarget.targetSessionId,
              latestForTarget.runId,
            );
            evalCacheRef.current = cache;
            saveEvalDashboardCache(cache);
            setLatestSuccessfulEval(
              cache[evalDashboardCacheKey(
                latestForTarget.targetSessionId,
                latestForTarget.runId,
              )],
            );
          }
        }
        break;
      }
      case "cache_size":
        setCacheSize({ totalBytes: event.totalBytes, fileCount: event.fileCount, sessionCount: event.sessionCount });
        setCacheClearing(false);
        break;
    }
  }, [addToast, sessions]);

  const { connected, send } = useWebSocket(handleEvent);

  const handleSend = useCallback((text: string, images?: ImageAttachment[], fileRefs?: string[], uploadedFiles?: { name: string; content: string }[]) => {
    if (!text.trim() && (!images || images.length === 0) && (!uploadedFiles || uploadedFiles.length === 0)) return;
    if (viewMode === "eval_dashboard") return;
    turnStartRef.current = Date.now();
    setProcessing(true);
    if (viewMode === "session_dashboard") {
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

  const handleCacheAction = useCallback((action: "size" | "clear") => {
    if (action === "clear") setCacheClearing(true);
    send({ type: "cache", action } as any);
  }, [send]);
  const handleToggleSkill = useCallback((name: string) => send({ type: "skill", action: "toggle", name } as any), [send]);
  const handleSessionAction = useCallback((action: "list" | "save" | "load" | "delete", id?: string) => send({ type: "session", action, id }), [send]);
  const handleMcpAction = useCallback((action: "list" | "refresh" | "connect" | "disconnect", serverName?: string) => send({ type: "mcp", action, serverName } as any), [send]);
  const handleNewSession = useCallback(() => send({ type: "slash", command: "/reset" }), [send]);

  const handleOpenEvalExternal = useCallback((html: string) => {
    if (evalObjectUrlRef.current) {
      URL.revokeObjectURL(evalObjectUrlRef.current);
    }
    evalObjectUrlRef.current = openEvalDashboardHtml(html);
  }, []);

  const handleRetryEval = useCallback(() => {
    const target = evalStateRef.current?.targetSessionId
      ?? evalStateRef.current?.requestedSessionId;
    send({
      type: "slash",
      command: target ? `/eval ${target}` : "/eval",
    });
  }, [send]);

  const handleViewModeChange = useCallback((mode: ViewMode) => {
    if (mode === "chat") {
      setViewMode("chat");
      return;
    }
    if (mode === "eval_dashboard") {
      const currentEval = evalStateRef.current;
      const evalCommand = evalCommandForSelection(currentEval?.status ?? null);
      if (evalCommand) {
        send(evalCommand);
        return;
      }
      setTransitionPhase("idle");
      setViewMode("eval_dashboard");
      return;
    }

    if (!canEnterSessionDashboard(viewModeRef.current, messages.length)) return;
    const csid = currentSessionIdRef.current;
    if (csid) {
      const cached = dashCacheRef.current[csid];
      const sessionHash = sessions.find((s) => s.id === csid)?.contentHash;
      if (isDashboardCacheEntryValid(cached, sessionHash)) {
        setSessionArtifactHtml(cached.html);
        setSessionArtifactLoading(false);
        setViewMode("session_dashboard");
        return;
      }
    }
    // Check reduced motion
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setViewMode("session_dashboard");
      setSessionArtifactHtml("");
      setSessionArtifactLoading(true);
      send({ type: "artifact", action: "generate", context: "session_dashboard" });
      return;
    }
    // Start cascade transition
    setSessionArtifactHtml("");
    setSessionArtifactLoading(true);
    send({ type: "artifact", action: "generate", context: "session_dashboard" });
    setTransitionPhase("animating");
  }, [send, sessions, messages]);
  const handleTransitionComplete = useCallback(() => {
    // Poll until artifactLoading is confirmed false before transitioning,
    // preventing a flash of "Generating dashboard..." in ArtifactContainer.
    const tryTransition = () => {
      const action = sessionDashboardTransitionAction(
        viewModeRef.current,
        sessionArtifactLoadingRef.current,
      );
      if (action === "cancel") {
        setTransitionPhase("idle");
        return;
      }
      if (action === "commit") {
        setTransitionPhase("idle");
        setViewMode("session_dashboard");
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
      <header
        className="flex items-center px-4 shrink-0 gap-3"
        style={{
          height: "var(--topbar-h)",
          backgroundColor: "var(--color-surface)",
          borderBottom: "1px solid var(--color-border)",
        }}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-1 rounded-btn hover:brightness-95 transition-[filter] duration-200 md:hidden" style={{ backgroundColor: "var(--color-surface-hover)" }} aria-label="Toggle sidebar">
            <List size={18} weight="bold" style={{ color: "var(--color-text)" }} />
          </button>
          <span style={{ width: "8px", height: "8px", borderRadius: "1.5px", transform: "rotate(45deg)", background: "var(--color-accent)", flexShrink: 0 }} />
          <span className="text-sm font-medium truncate hidden sm:inline" style={{ color: "var(--color-text)", fontFamily: "var(--font-display)" }}>
            {viewMode === "eval_dashboard" && evalState?.targetSessionId
              ? `eval · ${evalState.targetSessionId.slice(0, 8)}`
              : viewMode === "session_dashboard" && currentSessionId
              ? `dashboard · ${sessions.find((s) => s.id === currentSessionId)?.title || "Session"}`
              : "DSCode"}
          </span>
        </div>
        <div className="flex-1 flex items-center justify-center gap-3">
          <ViewModeSelector
            viewMode={viewMode}
            sessionDashboardAvailable={
              viewMode === "session_dashboard"
              || canEnterSessionDashboard(viewMode, messages.length)
            }
            evalReportAvailable={evalState?.status === "completed" || latestSuccessfulEval !== undefined}
            onChange={handleViewModeChange}
          />
          <div className="hidden md:flex"><ContextWindowBar data={contextWindow} /></div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={toggleTheme} className="p-1.5 rounded-btn hover:brightness-95 transition-[filter] duration-200" style={{ backgroundColor: "var(--color-surface-hover)" }} aria-label="Toggle theme">
            {theme === "light" ? <Moon size={16} weight="bold" style={{ color: "var(--color-text)" }} /> : <Sun size={16} weight="bold" style={{ color: "var(--color-text)" }} />}
          </button>
          <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-0.5" style={{ borderRadius: "8px", backgroundColor: connected ? "var(--color-success)" : "var(--color-error)", color: connected ? "var(--color-success-text)" : "var(--color-error-text)" }}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: connected ? "var(--color-success-text)" : "var(--color-error-text)" }} />
            {connected ? "Connected" : "Reconnecting..."}
          </span>
        </div>
      </header>
      <div className="flex flex-1 overflow-hidden">
        <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)}
          activePanel={activePanel} onPanelChange={setActivePanel}
          sessions={sessions} currentSessionId={currentSessionId} mcpServers={mcpServers} config={config}
          onSessionAction={handleSessionAction} onMcpAction={handleMcpAction}
          onConfigChange={handleConfigChange} isProcessing={processing} onNewSession={handleNewSession}
          onCacheAction={handleCacheAction} cacheSize={cacheSize} cacheClearing={cacheClearing}
          skills={skills} onToggleSkill={handleToggleSkill} />
        <main className="flex-1 flex flex-col min-w-0">
          <div className="flex-1 flex flex-col min-h-0" style={{ position: "relative" }}>
          {transitionPhase === "animating" && (
            <TransitionCanvas artifactReady={!sessionArtifactLoading && sessionArtifactHtml !== ""} onComplete={handleTransitionComplete} scrollContainerRef={chatContainerRef} />
          )}
          {viewMode === "session_dashboard" && transitionPhase === "idle" ? (
            <ArtifactContainer presentation={{ kind: "session_dashboard", html: sessionArtifactHtml, loading: sessionArtifactLoading }} />
          ) : viewMode === "eval_dashboard" && evalState ? (
            <EvalDashboardView
              state={evalState}
              latestSuccessful={latestSuccessfulEval}
              onBackToChat={() => handleViewModeChange("chat")}
              onRetry={handleRetryEval}
              onOpenExternal={handleOpenEvalExternal}
            />
          ) : (
            <ChatView messages={messages} processing={processing} hasStreaming={hasStreaming} sessionActiveMs={sessionActiveMs} permissionPrompt={permissionPrompt} onPermission={handlePermission} containerRef={chatContainerRef} scrollLocked={transitionPhase === "animating"} />
          )}
          {shouldRenderMessageInput(viewMode) && (
            <MessageInput onSend={handleSend} onAbort={handleAbort} onSlashCommand={handleSlashCommand} onCommand={handleCommand}
              processing={processing} slashCommands={SLASH_COMMANDS} fileListItems={fileListItems} fileListPrefix={fileListPrefix} viewMode={viewMode} projectPath={config?.projectPath ?? ""}
              onToast={(type, text) => addToast({ type, text })} />
          )}
          </div>
        </main>
      </div>
      <ToastContainer toasts={toasts} onRemove={removeToast} />
      {commandPanel && <CommandPanel text={commandPanel} onClose={() => setCommandPanel(null)} />}
    </div>
  );
}
