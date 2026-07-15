import { useState, useEffect, useRef, useCallback, useLayoutEffect } from "react";
import { useResizablePanel } from "../hooks/useResizablePanel";
import type { SessionInfo, McpServerInfo, ConfigData } from "../types";
import { X, Trash, CaretDown, CaretRight, Plus, Spinner } from "@phosphor-icons/react";

interface SidebarProps {
  open: boolean;
  onClose: () => void;
  activeTab: "sessions" | "mcp" | "settings";
  onTabChange: (tab: "sessions" | "mcp" | "settings") => void;
  sessions: SessionInfo[];
  currentSessionId: string | null;
  mcpServers: McpServerInfo[];
  config: ConfigData | null;
  onSessionAction: (action: "list" | "save" | "load" | "delete", id?: string) => void;
  onMcpAction: (action: "list" | "refresh") => void;
  onMcpServerAction: (action: "connect" | "disconnect", serverName: string) => void;
  onConfigChange: (action: string, value: string) => void;
  onNewSession: () => void;
  isProcessing: boolean;
  onCacheAction?: (action: "size" | "clear") => void;
  cacheSize?: { totalBytes: number; fileCount: number; sessionCount: number } | null;
  cacheClearing?: boolean;
}

export function Sidebar({
  open,
  onClose,
  activeTab,
  onTabChange,
  sessions,
  currentSessionId,
  mcpServers,
  config,
  onSessionAction,
  onMcpAction,
  onConfigChange,
  onNewSession,
  onMcpServerAction,
  isProcessing,
  onCacheAction,
  cacheSize,
  cacheClearing,
}: SidebarProps) {
  const { width, panelRef, handleProps } = useResizablePanel({
    storageKey: "dscode-sidebar-width",
  });

  // ── Scroll position preservation ──
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const savedScrollTopRef = useRef(0);
  const prevActiveTabRef = useRef(activeTab);

  const handleScroll = useCallback(() => {
    if (scrollContainerRef.current) {
      savedScrollTopRef.current = scrollContainerRef.current.scrollTop;
    }
  }, []);

  // Reset saved scroll position on tab switch
  useLayoutEffect(() => {
    if (prevActiveTabRef.current !== activeTab) {
      savedScrollTopRef.current = 0;
      prevActiveTabRef.current = activeTab;
    }
  }, [activeTab]);

  // Restore scroll position when sessions change (only when sessions tab is active)
  useLayoutEffect(() => {
    if (
      activeTab === "sessions" &&
      scrollContainerRef.current &&
      savedScrollTopRef.current > 0
    ) {
      scrollContainerRef.current.scrollTop = savedScrollTopRef.current;
    }
  }, [sessions, activeTab]);


  return (
    <>
      {/* Mobile overlay */}
      {open && (
        <div className="fixed inset-0 bg-black/30 z-40 md:hidden" onClick={onClose} />
      )}

      <aside
        ref={panelRef}
        className={`fixed md:static inset-y-0 left-0 z-50 flex flex-col transform transition-transform duration-200 ${
          open ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        } ${!open && "hidden md:flex"}`}
        style={{
          width: `${width}px`,
          minWidth: `${width}px`,
          backgroundColor: "var(--color-surface)",
          borderRight: "1px solid var(--color-border)",
        }}
      >
        {/* Close button (mobile) */}
        <div
          className="flex items-center justify-between p-3 md:hidden"
          style={{ borderBottom: "1px solid var(--color-border)" }}
        >
          <span
            className="font-semibold text-sm"
            style={{ color: "var(--color-accent)" }}
          >
            DSCode
          </span>
          <button
            onClick={onClose}
            className="p-1 rounded-btn hover:brightness-95 transition-[filter] duration-200"
            style={{ backgroundColor: "var(--color-surface-hover)" }}
          >
            <X size={18} weight="bold" style={{ color: "var(--color-text)" }} />
          </button>
        </div>

        {/* Tabs */}
        <div
          className="flex"
          style={{ borderBottom: "1px solid var(--color-border)" }}
        >
          {(["sessions", "mcp", "settings"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => onTabChange(tab)}
              className="flex-1 py-2.5 text-xs font-medium transition-colors capitalize"
              style={{
                color: activeTab === tab ? "var(--color-accent)" : "var(--color-text-muted)",
                borderBottom: activeTab === tab ? "2px solid var(--color-accent)" : "2px solid transparent",
              }}
            >
              {tab === "sessions" ? "Sessions" : tab === "mcp" ? "MCP" : "Settings"}
            </button>
          ))}
        </div>

        {/* Content */}
        <div ref={scrollContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto p-3">
          {activeTab === "sessions" && (
            <SessionsPanel
              sessions={sessions}
              currentSessionId={currentSessionId}
              onAction={onSessionAction}
              isProcessing={isProcessing}              onNewSession={onNewSession}
            />
          )}
          {activeTab === "mcp" && (
            <McpPanel
              servers={mcpServers}
              onAction={onMcpAction}
              onServerAction={onMcpServerAction}
            />
          )}
          {activeTab === "settings" && (
            <SettingsPanel
              config={config}
              onChange={onConfigChange}
              onCacheAction={onCacheAction}
              cacheSize={cacheSize}
              cacheClearing={cacheClearing}
            />
          )}
        </div>

        <div className="resize-handle hidden md:block" {...handleProps} />
      </aside>
    </>
  );
}

function formatDuration(ms: number): string {
  if (ms < 1000) return "<1s";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}h ${m}m`;
}

function SessionsPanel({
  sessions,
  currentSessionId,
  onAction,
  onNewSession,
  isProcessing,
}: {
  sessions: SessionInfo[];
  currentSessionId: string | null;
  onAction: (action: "list" | "save" | "load" | "delete", id?: string) => void;
  onNewSession: () => void;
  isProcessing: boolean;
}) {
  return (
    <div className="space-y-3">
      <button
        onClick={() => { if (!isProcessing) onNewSession(); }}
        className="w-full text-left px-3 py-1.5 text-sm transition-colors duration-200 flex items-center gap-2"
        style={{ borderRadius: "8px", opacity: isProcessing ? 0.4 : 1, pointerEvents: isProcessing ? "none" : "auto" }}
        onMouseEnter={(e) => { if (!isProcessing) (e.currentTarget as HTMLElement).style.backgroundColor = "var(--color-surface-hover)"; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"; }}
      >
        <Plus size={14} weight="bold" style={{ color: "var(--color-accent)" }} />
        <span style={{ color: "var(--color-accent)" }}>New Session</span>
      </button>

      {sessions.length === 0 ? (
        <p
          className="text-xs text-center py-8"
          style={{ color: "var(--color-text-muted)" }}
        >
          No saved sessions
        </p>
      ) : (
        <div className="space-y-1">
          {sessions.map((s) => {
            const isActive = s.id === currentSessionId;
            const isDisabled = isProcessing && !isActive;
            return (
            <div
              key={s.id}
              className={`flex items-center justify-between p-2 transition-colors group`}
              style={{
                borderRadius: "8px",
                backgroundColor: isActive ? "var(--color-accent-bg)" : "transparent",
                opacity: isDisabled ? 0.4 : 1,
                pointerEvents: isDisabled ? "none" : "auto",
              }}
              onMouseEnter={(e) => {
                if (!isActive && !isDisabled) (e.currentTarget as HTMLElement).style.backgroundColor = "var(--color-surface-hover)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.backgroundColor = isActive ? "var(--color-accent-bg)" : "transparent";
              }}
            >
              <button
                onClick={() => { if (isActive && isProcessing) return; if (!isDisabled) onAction("load", s.id); }}
                className="flex-1 text-left min-w-0"
              >
                <div className="text-sm truncate flex items-center gap-1.5" style={{ color: "var(--color-text)" }}>
                  {s.title}
                </div>
                <div className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                  {formatDuration(s.totalActiveMs)} &middot; {s.messageCount} msgs
                </div>
              </button>
              {isActive && isProcessing && (
                <Spinner size={14} weight="bold" style={{ color: "var(--color-accent)", opacity: 0.6, animation: "spin 1s linear infinite" }} />
              )}
              <button
              onClick={() => { if (!isDisabled && !isProcessing) onAction("delete", s.id); }}
                className={`opacity-0 group-hover:opacity-100 p-1 rounded transition-all ${isProcessing ? "!opacity-0" : ""}`}
                style={{ color: "var(--color-error-text)" }}
                title="Delete"
              >
                <Trash size={14} weight="bold" />
              </button>
            </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function McpPanel({
  servers,
  onServerAction,
  onAction,
}: {
  onAction: (action: "list" | "refresh") => void;
  onServerAction: (action: "connect" | "disconnect", serverName: string) => void;
  servers: McpServerInfo[];
}) {
  const [expandedServer, setExpandedServer] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      <button onClick={() => onAction("refresh")} className="btn-secondary w-full text-xs">
        Refresh
      </button>

      {servers.length === 0 ? (
        <p
          className="text-xs text-center py-8"
          style={{ color: "var(--color-text-muted)" }}
        >
          No MCP servers configured
        </p>
      ) : (
        <div className="space-y-1">
          {servers.map((s) => (
            <div key={s.name}>
              <button
                onClick={() => setExpandedServer(expandedServer === s.name ? null : s.name)}
                className="w-full flex items-center justify-between p-2 transition-colors text-left"
                style={{ borderRadius: "8px" }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.backgroundColor = "var(--color-surface-hover)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.backgroundColor = "transparent";
                }}
              >
                <div className="min-w-0">
                  <div className="text-sm truncate" style={{ color: "var(--color-text)" }}>
                    {s.name}
                  </div>
                  <div className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                    {s.toolCount} tools
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <div
                  role="button"
                  tabIndex={0}
                  onClick={(ev) => {
                    ev.stopPropagation();
                    if (s.status === "connected" || s.status === "connecting") {
                      onServerAction("disconnect", s.name);
                    } else {
                      onServerAction("connect", s.name);
                    }
                  }}
                  onKeyDown={(ev) => {
                    if (ev.key === "Enter" || ev.key === " ") {
                      ev.preventDefault();
                      ev.stopPropagation();
                      if (s.status === "connected" || s.status === "connecting") {
                        onServerAction("disconnect", s.name);
                      } else {
                        onServerAction("connect", s.name);
                      }
                    }
                  }}
                  className="flex-shrink-0"
                  style={{
                    position: "relative",
                    width: "36px",
                    height: "22px",
                    borderRadius: "11px",
                    border:
                      (s.status === "connected" || s.status === "connecting")
                        ? "none"
                        : "1px solid var(--color-border)",
                    cursor: "pointer",
                    backgroundColor:
                      s.status === "connected" ? "var(--color-accent)" :
                      s.status === "connecting" ? "var(--color-accent)" :
                      s.status === "error" ? "var(--color-error-text)" :
                      "var(--color-surface)",
                    opacity: s.status === "connecting" ? 0.7 : 1,
                    transition: "background-color 250ms ease, border-color 250ms ease, opacity 250ms ease",
                  }}
                  title={
                    s.status === "connected" || s.status === "connecting"
                      ? `Disconnect ${s.name}`
                      : `Connect ${s.name}`
                  }
                >
                  <span
                    style={{
                      position: "absolute",
                      top: "3px",
                      left: s.status === "connected" || s.status === "connecting" ? "18px" : "2px",
                      width: "16px",
                      height: "16px",
                      borderRadius: "50%",
                      backgroundColor: "#ffffff",
                      boxShadow: "0 1px 2px rgba(0,0,0,0.12)",
                      transition: "left 200ms cubic-bezier(0.34, 1.56, 0.64, 1)",
                    }}
                  />
                </div>
                </div>
              </button>

              {expandedServer === s.name && (
                <div
                  className="ml-3 mt-1 space-y-0.5 pl-3"
                  style={{ borderLeft: "2px solid var(--color-border)" }}
                >
                  {s.tools.map((t) => (
                    <div key={t.name} className="text-xs py-1">
                      <span
                        className="font-mono"
                        style={{ color: "var(--color-accent)" }}
                      >
                        {t.name}
                      </span>
                      {t.description && (
                        <span
                          className="ml-1"
                          style={{ color: "var(--color-text-muted)" }}
                        >
                          {t.description}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SettingsPanel({
  config,
  onChange,
  onCacheAction,
  cacheSize,
  cacheClearing,
}: {
  config: ConfigData | null;
  onChange: (action: string, value: string) => void;
  onCacheAction?: (action: "size" | "clear") => void;
  cacheSize?: { totalBytes: number; fileCount: number; sessionCount: number } | null;
  cacheClearing?: boolean;
}) {
  const [apiKey, setApiKey] = useState("");
  const [modelInput, setModelInput] = useState(config?.modelId ?? "");
  const [thinkingLevel, setThinkingLevel] = useState(config?.thinkingLevel ?? "off");
  const [providerInput, setProviderInput] = useState(config?.provider ?? "");
  const [projectPath, setProjectPath] = useState(config?.projectPath ?? "");
  const [showVisionForm, setShowVisionForm] = useState(false);
  const prevConfigRef = useRef(config);

  // Request cache size on mount
  useEffect(() => {
    onCacheAction?.("size");
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (config && config !== prevConfigRef.current) {
      setProviderInput(config.provider);
      setModelInput(config.modelId);
      setThinkingLevel(config.thinkingLevel);
      prevConfigRef.current = config;
    }
  }, [config]);

  if (!config) {
    return (
      <p
        className="text-xs text-center py-8"
        style={{ color: "var(--color-text-muted)" }}
      >
        Loading...
      </p>
    );
  }

  const selectStyle: React.CSSProperties = {
    borderRadius: "8px",
    border: "1px solid var(--color-border)",
    backgroundColor: "var(--color-bg)",
    color: "var(--color-text)",
    fontSize: "0.75rem",
    width: "100%",
    padding: "0.5rem 0.75rem",
    outline: "none",
  };

  return (
    <div className="space-y-4">
      {/* Provider */}
      <div>
        <label
          className="text-xs mb-1 block"
          style={{ color: "var(--color-text-muted)" }}
        >
          Provider
        </label>
        <select
          value={providerInput}
          onChange={(e) => {
            setProviderInput(e.target.value);
            onChange("set_provider", e.target.value);
          }}
          style={selectStyle}
        >
          {config.providers.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
      </div>

      {/* Model */}
      <div>
        <label
          className="text-xs mb-1 block"
          style={{ color: "var(--color-text-muted)" }}
        >
          Model
        </label>
        <select
          value={modelInput}
          onChange={(e) => {
            setModelInput(e.target.value);
            onChange("set_model", e.target.value);
          }}
          style={selectStyle}
        >
          {config.models.map((m) => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
      </div>

      {/* Thinking Level */}
      <div>
        <label
          className="text-xs mb-1 block"
          style={{ color: "var(--color-text-muted)" }}
        >
          Thinking Level
        </label>
        <select
          value={thinkingLevel}
          onChange={(e) => {
            setThinkingLevel(e.target.value);
            onChange("set_thinking", e.target.value);
          }}
          style={selectStyle}
        >
          {["off", "minimal", "low", "medium", "high", "xhigh"].map((l) => (
            <option key={l} value={l}>{l}</option>
          ))}
        </select>
      </div>

      {/* API Key */}
      <div>
        <label
          className="text-xs mb-1 block"
          style={{ color: "var(--color-text-muted)" }}
        >
          API Key
        </label>
        <div className="flex gap-2">
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            className="input text-xs flex-1"
            placeholder={config.apiKey || "sk-..."}
          />
          <button
            onClick={() => {
              if (apiKey) onChange("set_key", apiKey);
              setApiKey("");
            }}
            className="btn-primary text-xs px-3"
          >
            Set
          </button>
        </div>
      </div>

      {/* Project Path */}
      <div>
        <label
          className="text-xs mb-1 block"
          style={{ color: "var(--color-text-muted)" }}
        >
          Project Path
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            value={projectPath}
            onChange={(e) => setProjectPath(e.target.value)}
            className="input text-xs flex-1"
            placeholder={config.projectPath}
          />
          <button
            onClick={() => {
              if (projectPath) onChange("set_project_path", projectPath.trim());
            }}
            className="btn-primary text-xs px-3"
          >
            Set
          </button>
        </div>
      </div>

      {/* Upload Cache */}
      <div
        className="pt-2"
        style={{ borderTop: "1px solid var(--color-border)" }}
      >
        <label
          className="text-xs mb-1 block"
          style={{ color: "var(--color-text-muted)" }}
        >
          Upload Cache
        </label>
        <div
          className="flex items-center justify-between px-3 py-2"
          style={{
            borderRadius: "8px",
            border: cacheSize != null && cacheSize.totalBytes > 40 * 1024 * 1024
              ? "1px solid var(--color-error-text)"
              : "1px solid var(--color-border)",
            backgroundColor: "var(--color-bg)",
          }}
        >
          <div>
            <div
              style={{
                fontFamily: "'Geist Mono', monospace",
                fontSize: "16px",
                fontWeight: 700,
                color: "var(--color-text)",
              }}
            >
              {cacheSize == null || cacheClearing
                ? "..."
                : cacheSize.totalBytes === 0
                ? "0 B"
                : cacheSize.totalBytes < 1024
                ? `${cacheSize.totalBytes} B`
                : cacheSize.totalBytes < 1024 * 1024
                ? `${(cacheSize.totalBytes / 1024).toFixed(1)} KB`
                : `${(cacheSize.totalBytes / (1024 * 1024)).toFixed(1)} MB`}
            </div>
            <div
              className="text-xs"
              style={{ color: "var(--color-text-muted)" }}
            >
              {cacheSize == null || cacheClearing
                ? "calculating..."
                : cacheSize.totalBytes === 0
                ? "no cached files"
                : `${cacheSize.fileCount} files · ${cacheSize.sessionCount} sessions`}
            </div>
          </div>
          <button
            onClick={() => onCacheAction?.("clear")}
            disabled={cacheSize == null || cacheSize.totalBytes === 0 || cacheClearing}
            className="text-xs px-3 py-1 rounded-btn transition-colors"
            style={{
              color: "var(--color-error-text)",
              opacity: (cacheSize == null || cacheSize.totalBytes === 0 || cacheClearing) ? 0.4 : 1,
              cursor: (cacheSize == null || cacheSize.totalBytes === 0 || cacheClearing) ? "not-allowed" : "pointer",
            }}
          >
            Clear
          </button>
        </div>
        {cacheSize != null && cacheSize.totalBytes > 40 * 1024 * 1024 && (
          <p
            className="text-xs mt-1"
            style={{ color: "var(--color-error-text)" }}
          >
            Consider clearing to free disk space
          </p>
        )}
        <p
          className="text-xs mt-1"
          style={{ color: "var(--color-text-muted)" }}
        >
          Files in .dscode/uploads/
        </p>
      </div>

      {/* Vision Model Section */}
      {config.vision != null || showVisionForm ? (
        <div
          className="pt-2 space-y-3"
          style={{ borderTop: "1px solid var(--color-border)" }}
        >
          <div className="flex items-center justify-between">
            <p
              className="text-xs"
              style={{ color: "var(--color-text-muted)" }}
            >
              Vision Model
            </p>
            {!showVisionForm && (
              <button
                onClick={() => onChange("set_vision_delete", "")}
                className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-btn transition-colors"
                style={{ color: "var(--color-error-text)" }}
              >
                <Trash size={12} weight="bold" />
                Delete
              </button>
            )}
          </div>

          {(showVisionForm || config.vision) ? (
            <>
              <div>
                <label className="text-xs mb-1 block" style={{ color: "var(--color-text-muted)" }}>Provider</label>
                <select
                  value={config.vision?.provider ?? ""}
                  onChange={(e) => onChange("set_vision_provider", e.target.value)}
                  style={selectStyle}
                >
                  <option value="">Select...</option>
                  {config.visionProviders.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs mb-1 block" style={{ color: "var(--color-text-muted)" }}>Model</label>
                <select
                  value={config.vision?.model ?? ""}
                  onChange={(e) => onChange("set_vision_model", e.target.value)}
                  style={selectStyle}
                >
                  <option value="">Select...</option>
                  {config.visionModels.map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs mb-1 block" style={{ color: "var(--color-text-muted)" }}>API Key</label>
                <div className="flex gap-2">
                  <input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    className="input text-xs flex-1"
                    placeholder={config.vision?.key ? "••••••••" : "Enter vision API key"}
                  />
                  <button
                    onClick={() => {
                      if (apiKey) onChange("set_vision_key", apiKey);
                      setApiKey("");
                    }}
                    className="btn-primary text-xs px-3"
                  >
                    Set
                  </button>
                </div>
              </div>
            </>
          ) : null}

          {!config.vision && showVisionForm && (
            <button
              onClick={() => setShowVisionForm(false)}
              className="text-xs"
              style={{ color: "var(--color-text-muted)" }}
            >
              Cancel
            </button>
          )}
        </div>
      ) : (
        <button
          onClick={() => setShowVisionForm(true)}
          className="w-full text-left px-3 py-1.5 text-sm transition-colors duration-200 flex items-center gap-2"
          style={{ borderRadius: "8px" }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "var(--color-surface-hover)"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"; }}
        >
          <Plus size={14} weight="bold" style={{ color: "var(--color-accent)" }} />
          <span style={{ color: "var(--color-accent)" }}>Add Vision Model</span>
        </button>
      )}

      {/* Max Tokens (read-only) */}
      <div
        className="pt-2"
        style={{ borderTop: "1px solid var(--color-border)" }}
      >
        <p
          className="text-xs"
          style={{ color: "var(--color-text-muted)" }}
        >
          Max Tokens: {config.maxTokens.toLocaleString()}
        </p>
      </div>
    </div>
  );
}
