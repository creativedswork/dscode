import { useState, useEffect, useRef, useCallback, useLayoutEffect } from "react";
import { useResizablePanel } from "../hooks/useResizablePanel";
import type { SessionInfo, McpServerInfo, ConfigData } from "../types";
import {
  X, Trash, CaretDown, CaretRight, Plus, Spinner,
  Gear, Chats, Plug, Star, PuzzlePiece,
} from "@phosphor-icons/react";

export type DetailPanel = "sessions" | "mcp" | "skills" | "settings" | null;

interface SidebarProps {
  open: boolean;
  onClose: () => void;
  sessions: SessionInfo[];
  currentSessionId: string | null;
  mcpServers: McpServerInfo[];
  config: ConfigData | null;
  onSessionAction: (action: "list" | "save" | "load" | "delete", id?: string) => void;
  onMcpAction: (action: "list" | "refresh" | "connect" | "disconnect", serverName?: string) => void;
  onConfigChange: (action: string, value: string) => void;
  onNewSession: () => void;
  isProcessing: boolean;
  onCacheAction?: (action: "size" | "clear") => void;
  cacheSize?: { totalBytes: number; fileCount: number; sessionCount: number } | null;
  cacheClearing?: boolean;
  activePanel: DetailPanel;
  onPanelChange: (panel: DetailPanel) => void;
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

export function Sidebar({
  open,
  onClose,
  sessions,
  currentSessionId,
  mcpServers,
  config,
  onSessionAction,
  onMcpAction,
  onConfigChange,
  onNewSession,
  isProcessing,
  onCacheAction,
  cacheSize,
  cacheClearing,
  activePanel,
  onPanelChange,
}: SidebarProps) {
  const { width, panelRef, handleProps } = useResizablePanel({
    storageKey: "dscode-sidebar-width",
  });

  const togglePanel = (panel: DetailPanel) => {
    onPanelChange(activePanel === panel ? null : panel);
  };

  const installedSkillCount = 5; // placeholder

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
          <span className="font-semibold text-sm" style={{ color: "var(--color-accent)" }}>
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

        {/* Nav body */}
        <div className="flex-1 flex flex-col min-h-0 overflow-y-auto p-3 gap-4">
          {/* Create section */}
          <div>
            <div
              className="text-[10px] font-semibold uppercase tracking-wider mb-1.5 px-1"
              style={{ color: "var(--color-text-muted)" }}
            >
              Create
            </div>
            <button
              onClick={() => togglePanel("sessions")}
              className="w-full flex items-center gap-2.5 px-2.5 py-1.5 text-sm rounded-lg transition-colors"
              style={{
                backgroundColor: activePanel === "sessions" ? "var(--color-surface-hover)" : "transparent",
                color: activePanel === "sessions" ? "var(--color-text)" : "var(--color-text-muted)",
              }}
            >
              <Chats size={15} weight={activePanel === "sessions" ? "bold" : "regular"} />
              <span className="flex-1 text-left">Sessions</span>
              {sessions.length > 0 && (
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ backgroundColor: "var(--color-surface-hover)", color: "var(--color-text-muted)" }}>
                  {sessions.length}
                </span>
              )}
            </button>
          </div>

          {/* Capabilities section */}
          <div>
            <div
              className="text-[10px] font-semibold uppercase tracking-wider mb-1.5 px-1"
              style={{ color: "var(--color-text-muted)" }}
            >
              Capabilities
            </div>
            <button
              onClick={() => togglePanel("mcp")}
              className="w-full flex items-center gap-2.5 px-2.5 py-1.5 text-sm rounded-lg transition-colors"
              style={{
                backgroundColor: activePanel === "mcp" ? "var(--color-surface-hover)" : "transparent",
                color: activePanel === "mcp" ? "var(--color-text)" : "var(--color-text-muted)",
              }}
            >
              <Plug size={15} weight={activePanel === "mcp" ? "bold" : "regular"} />
              <span className="flex-1 text-left">MCP</span>
              {mcpServers.length > 0 && (
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ backgroundColor: "var(--color-surface-hover)", color: "var(--color-text-muted)" }}>
                  {mcpServers.length}
                </span>
              )}
            </button>
            <button
              onClick={() => togglePanel("skills")}
              className="w-full flex items-center gap-2.5 px-2.5 py-1.5 text-sm rounded-lg transition-colors"
              style={{
                backgroundColor: activePanel === "skills" ? "var(--color-surface-hover)" : "transparent",
                color: activePanel === "skills" ? "var(--color-text)" : "var(--color-text-muted)",
              }}
            >
              <Star size={15} weight={activePanel === "skills" ? "bold" : "regular"} />
              <span className="flex-1 text-left">Skills</span>
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ backgroundColor: "var(--color-surface-hover)", color: "var(--color-text-muted)" }}>
                {installedSkillCount}
              </span>
            </button>
          </div>
        </div>

        {/* Settings footer */}
        <div
          className="shrink-0 p-3"
          style={{ borderTop: "1px solid var(--color-border)" }}
        >
          <button
            onClick={() => togglePanel("settings")}
            className="w-full flex items-center gap-2.5 px-2.5 py-1.5 text-sm rounded-lg transition-colors"
            style={{
              backgroundColor: activePanel === "settings" ? "var(--color-surface-hover)" : "transparent",
              color: activePanel === "settings" ? "var(--color-text)" : "var(--color-text-muted)",
            }}
          >
            <Gear size={15} weight={activePanel === "settings" ? "bold" : "regular"} />
            <span className="flex-1 text-left">Settings</span>
          </button>
        </div>

        <div className="resize-handle hidden md:block" {...handleProps} />
      </aside>

      {/* Detail panel (280px) */}
      {activePanel && (
        <aside
          className="hidden md:flex flex-col shrink-0"
          style={{
            width: "280px",
            minWidth: "280px",
            backgroundColor: "var(--color-surface)",
            borderRight: "1px solid var(--color-border)",
          }}
        >
          <div className="flex items-center justify-between px-4 py-2.5 shrink-0" style={{ borderBottom: "1px solid var(--color-border)" }}>
            <span
              className="text-[13px] font-medium"
              style={{ fontFamily: "var(--font-display)", color: "var(--color-text)" }}
            >
              {activePanel === "sessions" ? "Sessions" : activePanel === "mcp" ? "MCP Servers" : activePanel === "skills" ? "Skills" : "Settings"}
            </span>
            <button
              onClick={() => onPanelChange(null)}
              className="p-1 rounded hover:brightness-95 transition-[filter]"
              style={{ color: "var(--color-text-muted)" }}
            >
              <X size={14} weight="bold" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-3">
            {activePanel === "sessions" && (
              <DetailSessionsPanel
                sessions={sessions}
                currentSessionId={currentSessionId}
                onAction={onSessionAction}
                isProcessing={isProcessing}
                onNewSession={onNewSession}
              />
            )}
            {activePanel === "mcp" && (
              <DetailMcpPanel
                servers={mcpServers}
                onAction={onMcpAction}
              />
            )}
            {activePanel === "skills" && (
              <DetailSkillsPanel />
            )}
            {activePanel === "settings" && (
              <DetailSettingsPanel
                config={config}
                onChange={onConfigChange}
                onCacheAction={onCacheAction}
                cacheSize={cacheSize}
                cacheClearing={cacheClearing}
              />
            )}
          </div>
        </aside>
      )}
    </>
  );
}

/* ── Detail Panel: Sessions ── */

function DetailSessionsPanel({
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
        className="w-full text-left px-3 py-1.5 text-sm rounded-lg transition-colors flex items-center gap-2"
        style={{
          backgroundColor: "var(--color-accent-bg)",
          color: "var(--color-accent)",
          opacity: isProcessing ? 0.4 : 1,
          pointerEvents: isProcessing ? "none" : "auto",
        }}
      >
        <Plus size={14} weight="bold" />
        <span>New Session</span>
      </button>
      {sessions.length === 0 ? (
        <p className="text-xs text-center py-8" style={{ color: "var(--color-text-muted)" }}>No saved sessions</p>
      ) : (
        <div className="space-y-0.5">
          {sessions.map((s) => {
            const isActive = s.id === currentSessionId;
            const isDisabled = isProcessing && !isActive;
            return (
              <div
                key={s.id}
                className="flex items-center justify-between p-2 transition-colors group rounded-lg"
                style={{
                  backgroundColor: isActive ? "var(--color-surface-hover)" : "transparent",
                  borderLeft: isActive ? "2px solid var(--color-border)" : "2px solid transparent",
                  opacity: isDisabled ? 0.4 : 1,
                  pointerEvents: isDisabled ? "none" : "auto",
                }}
                onMouseEnter={(e) => { if (!isActive && !isDisabled) (e.currentTarget as HTMLElement).style.backgroundColor = "var(--color-surface-hover)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = isActive ? "var(--color-surface-hover)" : "transparent"; }}
              >
                <button onClick={() => { if (!isDisabled) onAction("load", s.id); }} className="flex-1 text-left min-w-0">
                  <div className="text-sm truncate" style={{ color: "var(--color-text)", fontFamily: "var(--font-display)" }}>{s.title}</div>
                  <div className="text-[10px] mt-0.5" style={{ color: "var(--color-text-muted)" }}>{formatDuration(s.totalActiveMs)} &middot; {s.messageCount} msgs</div>
                </button>
                {isActive && isProcessing && <Spinner size={14} weight="bold" style={{ color: "var(--color-accent)", opacity: 0.6, animation: "spin 1s linear infinite" }} />}
                <button onClick={() => { if (!isDisabled && !isProcessing) onAction("delete", s.id); }} className="opacity-0 group-hover:opacity-100 p-1 rounded transition-all" style={{ color: "var(--color-error-text)" }} title="Delete"><Trash size={14} weight="bold" /></button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ── Detail Panel: MCP ── */

function DetailMcpPanel({
  servers,
  onAction,
}: {
  onAction: (action: "list" | "refresh" | "connect" | "disconnect", serverName?: string) => void;
  servers: McpServerInfo[];
}) {
  const [expandedServer, setExpandedServer] = useState<string | null>(null);
  return (
    <div className="space-y-3">
      <button onClick={() => onAction("refresh")} className="btn-secondary w-full text-xs">Refresh</button>
      {servers.length === 0 ? (
        <p className="text-xs text-center py-8" style={{ color: "var(--color-text-muted)" }}>No MCP servers configured</p>
      ) : (
        <div className="space-y-1">
          {servers.map((s) => (
            <div key={s.name}>
              <button
                onClick={() => setExpandedServer(expandedServer === s.name ? null : s.name)}
                className="w-full flex items-center gap-2 p-2 text-left rounded-lg transition-colors"
                style={{ backgroundColor: "transparent" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "var(--color-surface-hover)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"; }}
              >
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: s.status === "connected" ? "var(--color-success-text)" : s.status === "connecting" ? "#f59e0b" : s.status === "error" ? "var(--color-error-text)" : "var(--color-text-muted)" }} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm truncate" style={{ color: "var(--color-text)" }}>{s.name}</div>
                  <div className="text-[10px]" style={{ color: "var(--color-text-muted)" }}>{s.toolCount} tools &middot; {s.status}</div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <div
                    role="button" tabIndex={0}
                    onClick={(ev) => { ev.stopPropagation(); if (s.status === "connected" || s.status === "connecting") onAction("disconnect", s.name); else onAction("connect", s.name); }}
                    onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); ev.stopPropagation(); if (s.status === "connected" || s.status === "connecting") onAction("disconnect", s.name); else onAction("connect", s.name); } }}
                    className="flex-shrink-0"
                    style={{ position: "relative", width: "36px", height: "22px", borderRadius: "11px", border: (s.status === "connected" || s.status === "connecting") ? "none" : "1px solid var(--color-border)", cursor: "pointer", backgroundColor: s.status === "connected" ? "var(--color-accent)" : s.status === "connecting" ? "var(--color-accent)" : s.status === "error" ? "var(--color-error-text)" : "var(--color-surface)", opacity: s.status === "connecting" ? 0.7 : 1, transition: "background-color 250ms ease, border-color 250ms ease, opacity 250ms ease" }}
                  >
                    <span style={{ position: "absolute", top: "3px", left: s.status === "connected" || s.status === "connecting" ? "18px" : "2px", width: "16px", height: "16px", borderRadius: "50%", backgroundColor: "#ffffff", boxShadow: "0 1px 2px rgba(0,0,0,0.12)", transition: "left 200ms cubic-bezier(0.34, 1.56, 0.64, 1)" }} />
                  </div>
                  {expandedServer === s.name ? <CaretDown size={12} style={{ color: "var(--color-text-muted)" }} /> : <CaretRight size={12} style={{ color: "var(--color-text-muted)" }} />}
                </div>
              </button>
              {expandedServer === s.name && (
                <div className="ml-4 mt-1 space-y-0.5 pl-3" style={{ borderLeft: "2px solid var(--color-border)" }}>
                  {s.tools.map((t) => (
                    <div key={t.name} className="text-xs py-1">
                      <span className="font-mono" style={{ color: "var(--color-accent)" }}>{t.name}</span>
                      {t.description && <span className="ml-1" style={{ color: "var(--color-text-muted)" }}>{t.description}</span>}
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

/* ── Detail Panel: Skills ── */

function DetailSkillsPanel() {
  return (
    <div className="space-y-3">
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--color-text-muted)" }}>Installed</div>
        <div className="space-y-2">
          {[
            { name: "game-engine", desc: "Build web-based games with HTML5 Canvas & WebGL", tags: ["game", "canvas"] },
            { name: "brandkit", desc: "Premium brand-kit image generation", tags: ["design", "brand"] },
            { name: "html-output", desc: "Rich self-contained HTML for specs", tags: ["html", "docs"] },
            { name: "minimalist-ui", desc: "Clean editorial interfaces", tags: ["design", "ui"] },
            { name: "design-taste-frontend", desc: "Anti-slop frontend skill", tags: ["design", "frontend"] },
          ].map((skill) => (
            <div key={skill.name} className="skill-card">
              <div className="skill-icon installed">S</div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold" style={{ color: "var(--color-text)" }}>{skill.name}</div>
                <div className="text-[10px] mt-0.5" style={{ color: "var(--color-text-muted)" }}>{skill.desc}</div>
                <div>{skill.tags.map((t) => <span key={t} className="skill-tag">{t}</span>)}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-wider mb-2 mt-4" style={{ color: "var(--color-text-muted)" }}>Available</div>
        <div className="space-y-2">
          {[
            { name: "web-game-design", desc: "Design principles for browser games", tags: ["game", "design"] },
            { name: "image-to-code", desc: "Convert design images to code", tags: ["code", "design"] },
          ].map((skill) => (
            <div key={skill.name} className="skill-card">
              <div className="skill-icon available">A</div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold" style={{ color: "var(--color-text)" }}>{skill.name}</div>
                <div className="text-[10px] mt-0.5" style={{ color: "var(--color-text-muted)" }}>{skill.desc}</div>
                <div>{skill.tags.map((t) => <span key={t} className="skill-tag">{t}</span>)}</div>
              </div>
              <button className="skill-action install">Install</button>
            </div>
          ))}
        </div>
      </div>
      <div className="market-banner">
        <PuzzlePiece size={18} style={{ color: "var(--color-text-muted)" }} />
        <div className="text-xs font-medium" style={{ color: "var(--color-text)" }}>Skill Marketplace</div>
        <div className="text-[10px]" style={{ color: "var(--color-text-muted)" }}>Discover and install community skills</div>
        <button className="market-btn">Browse Marketplace</button>
      </div>
    </div>
  );
}

/* ── Detail Panel: Settings ── */

function DetailSettingsPanel({
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

  useEffect(() => { onCacheAction?.("size"); }, []); // eslint-disable-line
  useEffect(() => {
    if (config && config !== prevConfigRef.current) {
      setProviderInput(config.provider); setModelInput(config.modelId); setThinkingLevel(config.thinkingLevel);
      prevConfigRef.current = config;
    }
  }, [config]);

  if (!config) return <p className="text-xs text-center py-8" style={{ color: "var(--color-text-muted)" }}>Loading...</p>;

  const sel: React.CSSProperties = { borderRadius: "8px", border: "1px solid var(--color-border)", backgroundColor: "var(--color-bg)", color: "var(--color-text)", fontSize: "0.75rem", width: "100%", padding: "0.5rem 0.75rem", outline: "none" };

  return (
    <div className="space-y-4">
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--color-text-muted)" }}>Appearance</div>
        <div className="settings-card text-xs" style={{ color: "var(--color-text-muted)" }}>Theme: Use the topbar sun/moon toggle. System preference is auto-detected.</div>
      </div>
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--color-text-muted)" }}>Model</div>
        <div className="space-y-2">
          <div><label className="text-xs mb-1 block" style={{ color: "var(--color-text-muted)" }}>Provider</label><select value={providerInput} onChange={(e) => { setProviderInput(e.target.value); onChange("set_provider", e.target.value); }} style={sel}>{config.providers.map((p) => <option key={p} value={p}>{p}</option>)}</select></div>
          <div><label className="text-xs mb-1 block" style={{ color: "var(--color-text-muted)" }}>Model</label><select value={modelInput} onChange={(e) => { setModelInput(e.target.value); onChange("set_model", e.target.value); }} style={sel}>{config.models.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></div>
          <div><label className="text-xs mb-1 block" style={{ color: "var(--color-text-muted)" }}>Thinking Level</label><select value={thinkingLevel} onChange={(e) => { setThinkingLevel(e.target.value); onChange("set_thinking", e.target.value); }} style={sel}>{["off","minimal","low","medium","high","xhigh"].map((l) => <option key={l} value={l}>{l}</option>)}</select></div>
        </div>
      </div>
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--color-text-muted)" }}>API Key</div>
        <div className="flex gap-2"><input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} className="input text-xs flex-1" placeholder={config.apiKey || "sk-..."} /><button onClick={() => { if (apiKey) onChange("set_key", apiKey); setApiKey(""); }} className="btn-primary text-xs px-3">Set</button></div>
      </div>
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--color-text-muted)" }}>Project Path</div>
        <div className="flex gap-2"><input type="text" value={projectPath} onChange={(e) => setProjectPath(e.target.value)} className="input text-xs flex-1" placeholder={config.projectPath} /><button onClick={() => { if (projectPath) onChange("set_project_path", projectPath.trim()); }} className="btn-primary text-xs px-3">Set</button></div>
      </div>
      {config.vision != null || showVisionForm ? (
        <div className="pt-2 space-y-3" style={{ borderTop: "1px solid var(--color-border)" }}>
          <div className="flex items-center justify-between"><span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--color-text-muted)" }}>Vision</span>{!showVisionForm && <button onClick={() => onChange("set_vision_delete", "")} className="text-xs px-2 py-1 rounded" style={{ color: "var(--color-error-text)" }}><Trash size={12} weight="bold" /></button>}</div>
          {(showVisionForm || config.vision) && (<><div><label className="text-xs mb-1 block" style={{ color: "var(--color-text-muted)" }}>Provider</label><select value={config.vision?.provider ?? ""} onChange={(e) => onChange("set_vision_provider", e.target.value)} style={sel}><option value="">Select...</option>{config.visionProviders.map((p) => <option key={p} value={p}>{p}</option>)}</select></div><div><label className="text-xs mb-1 block" style={{ color: "var(--color-text-muted)" }}>Model</label><select value={config.vision?.model ?? ""} onChange={(e) => onChange("set_vision_model", e.target.value)} style={sel}><option value="">Select...</option>{config.visionModels.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></div><div><label className="text-xs mb-1 block" style={{ color: "var(--color-text-muted)" }}>API Key</label><div className="flex gap-2"><input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} className="input text-xs flex-1" placeholder={config.vision?.key ? "••••••••" : "Enter vision API key"} /><button onClick={() => { if (apiKey) onChange("set_vision_key", apiKey); setApiKey(""); }} className="btn-primary text-xs px-3">Set</button></div></div></>)}
          {!config.vision && showVisionForm && <button onClick={() => setShowVisionForm(false)} className="text-xs" style={{ color: "var(--color-text-muted)" }}>Cancel</button>}
        </div>
      ) : (
        <button onClick={() => setShowVisionForm(true)} className="w-full text-left px-3 py-1.5 text-sm rounded-lg transition-colors flex items-center gap-2" onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "var(--color-surface-hover)"; }} onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"; }}><Plus size={14} weight="bold" style={{ color: "var(--color-accent)" }} /><span style={{ color: "var(--color-accent)" }}>Add Vision Model</span></button>
      )}
      <div className="pt-2" style={{ borderTop: "1px solid var(--color-border)" }}>
        <div className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--color-text-muted)" }}>Cache</div>
        <div className="settings-card">
          <div className="flex items-center justify-between">
            <div>
              <div style={{ fontFamily: "'Geist Mono', monospace", fontSize: "16px", fontWeight: 700, color: "var(--color-text)" }}>{cacheSize == null || cacheClearing ? "..." : cacheSize.totalBytes === 0 ? "0 B" : cacheSize.totalBytes < 1024 ? `${cacheSize.totalBytes} B` : cacheSize.totalBytes < 1024 * 1024 ? `${(cacheSize.totalBytes / 1024).toFixed(1)} KB` : `${(cacheSize.totalBytes / (1024 * 1024)).toFixed(1)} MB`}</div>
              <div className="text-[10px]" style={{ color: "var(--color-text-muted)" }}>{cacheSize == null || cacheClearing ? "calculating..." : cacheSize.totalBytes === 0 ? "no cached files" : `${cacheSize.fileCount} files · ${cacheSize.sessionCount} sessions`}</div>
            </div>
          </div>
        </div>
        <button onClick={() => onCacheAction?.("clear")} disabled={cacheSize == null || cacheSize.totalBytes === 0 || cacheClearing} className="settings-danger-btn mt-2">Clear All Cache</button>
      </div>
      <div className="pt-2" style={{ borderTop: "1px solid var(--color-border)" }}><p className="text-xs" style={{ color: "var(--color-text-muted)" }}>Max Tokens: {config.maxTokens.toLocaleString()}</p></div>
    </div>
  );
}
