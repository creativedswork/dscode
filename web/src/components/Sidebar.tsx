import { useState, useEffect, useRef } from "react";
import type { SessionInfo, McpServerInfo, ConfigData } from "../types";
import { X, Trash, CaretDown, CaretRight, Plus } from "@phosphor-icons/react";

interface SidebarProps {
  open: boolean;
  onClose: () => void;
  activeTab: "sessions" | "mcp" | "settings";
  onTabChange: (tab: "sessions" | "mcp" | "settings") => void;
  sessions: SessionInfo[];
  mcpServers: McpServerInfo[];
  config: ConfigData | null;
  onSessionAction: (action: "list" | "save" | "load" | "delete", id?: string) => void;
  onMcpAction: (action: "list" | "refresh") => void;
  onConfigChange: (action: string, value: string) => void;
  onNewSession: () => void;
}

export function Sidebar({
  open,
  onClose,
  activeTab,
  onTabChange,
  sessions,
  mcpServers,
  config,
  onSessionAction,
  onMcpAction,
  onConfigChange,
  onNewSession,
}: SidebarProps) {
  return (
    <>
      {/* Mobile overlay */}
      {open && (
        <div className="fixed inset-0 bg-black/30 z-40 md:hidden" onClick={onClose} />
      )}

      <aside
        className={`fixed md:static inset-y-0 left-0 z-50 w-80 flex flex-col transform transition-transform duration-200 ${
          open ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        } ${!open && "hidden md:flex"}`}
        style={{
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
        <div className="flex-1 overflow-y-auto p-3">
          {activeTab === "sessions" && (
            <SessionsPanel
              sessions={sessions}
              onAction={onSessionAction}
              onNewSession={onNewSession}
            />
          )}
          {activeTab === "mcp" && (
            <McpPanel
              servers={mcpServers}
              onAction={onMcpAction}
            />
          )}
          {activeTab === "settings" && (
            <SettingsPanel
              config={config}
              onChange={onConfigChange}
            />
          )}
        </div>
      </aside>
    </>
  );
}

function SessionsPanel({
  sessions,
  onAction,
  onNewSession,
}: {
  sessions: SessionInfo[];
  onAction: (action: "list" | "save" | "load" | "delete", id?: string) => void;
  onNewSession: () => void;
}) {
  return (
    <div className="space-y-3">
      <button
        onClick={onNewSession}
        className="w-full text-left px-3 py-1.5 text-sm transition-colors duration-200 flex items-center gap-2"
        style={{ borderRadius: "8px" }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "var(--color-surface-hover)"; }}
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
          {sessions.map((s) => (
            <div
              key={s.id}
              className="flex items-center justify-between p-2 transition-colors group"
              style={{ borderRadius: "8px" }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.backgroundColor = "var(--color-surface-hover)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.backgroundColor = "transparent";
              }}
            >
              <button
                onClick={() => onAction("load", s.id)}
                className="flex-1 text-left min-w-0"
              >
                <div className="text-sm truncate" style={{ color: "var(--color-text)" }}>
                  {s.title}
                </div>
                <div className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                  {new Date(s.updatedAt).toLocaleDateString()} &middot; {s.messageCount} msgs
                </div>
              </button>
              <button
                onClick={() => onAction("delete", s.id)}
                className="opacity-0 group-hover:opacity-100 p-1 rounded transition-all"
                style={{ color: "var(--color-error-text)" }}
                title="Delete"
              >
                <Trash size={14} weight="bold" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function McpPanel({
  servers,
  onAction,
}: {
  servers: McpServerInfo[];
  onAction: (action: "list" | "refresh") => void;
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
                <StatusBadge status={s.status} />
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

function StatusBadge({ status }: { status: string }) {
  const styleMap: Record<string, React.CSSProperties> = {
    connected: {
      backgroundColor: "var(--color-success)",
      color: "var(--color-success-text)",
    },
    connecting: {
      backgroundColor: "var(--color-warning)",
      color: "var(--color-warning-text)",
    },
    error: {
      backgroundColor: "var(--color-error)",
      color: "var(--color-error-text)",
    },
    disconnected: {
      backgroundColor: "var(--color-surface-hover)",
      color: "var(--color-text-muted)",
    },
  };

  return (
    <span
      className="text-xs px-1.5 py-0.5"
      style={{
        borderRadius: "8px",
        ...(styleMap[status] || styleMap.disconnected),
      }}
    >
      {status}
    </span>
  );
}

function SettingsPanel({
  config,
  onChange,
}: {
  config: ConfigData | null;
  onChange: (action: string, value: string) => void;
}) {
  const [apiKey, setApiKey] = useState("");
  const [modelInput, setModelInput] = useState(config?.modelId ?? "");
  const [thinkingLevel, setThinkingLevel] = useState(config?.thinkingLevel ?? "off");
  const [providerInput, setProviderInput] = useState(config?.provider ?? "");
  const prevConfigRef = useRef(config);

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
            const value = e.target.value;
            setProviderInput(value);
            if (value) onChange("set_provider", value);
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
            const value = e.target.value;
            setModelInput(value);
            if (value) onChange("set_model", value);
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

      {/* Vision Model Section */}
      <div
        className="pt-2 space-y-3"
        style={{ borderTop: "1px solid var(--color-border)" }}
      >
        <p
          className="text-xs mb-2"
          style={{ color: "var(--color-text-muted)" }}
        >
          Vision Model
        </p>

        <div>
          <label
            className="text-xs mb-1 block"
            style={{ color: "var(--color-text-muted)" }}
          >
            Vision Provider
          </label>
          <select
            value={config.vision?.provider ?? ""}
            onChange={(e) => {
              if (e.target.value) onChange("set_vision_provider", e.target.value);
            }}
            style={selectStyle}
          >
            <option value="">(not set)</option>
            {config.visionProviders.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>

        <div>
          <label
            className="text-xs mb-1 block"
            style={{ color: "var(--color-text-muted)" }}
          >
            Vision Model
          </label>
          <select
            value={config.vision?.model ?? ""}
            onChange={(e) => {
              if (e.target.value) onChange("set_vision_model", e.target.value);
            }}
            style={selectStyle}
          >
            <option value="">(not set)</option>
            {config.visionModels.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label
            className="text-xs mb-1 block"
            style={{ color: "var(--color-text-muted)" }}
          >
            Vision Key
          </label>
          <div className="flex gap-2">
            <input
              type="password"
              id="vision-key-input"
              className="input text-xs flex-1"
              placeholder={config.vision?.key ? "sk-***hidden***" : "sk-..."}
            />
            <button
              onClick={() => {
                const input = document.getElementById("vision-key-input") as HTMLInputElement;
                if (input?.value) {
                  onChange("set_vision_key", input.value);
                  input.value = "";
                }
              }}
              className="btn-primary text-xs px-3"
            >
              Set
            </button>
          </div>
        </div>
      </div>

      {/* Info */}
      <div
        className="pt-2 space-y-1 text-xs"
        style={{
          borderTop: "1px solid var(--color-border)",
          color: "var(--color-text-muted)",
        }}
      >
        <div className="flex justify-between">
          <span>Provider</span>
          <span style={{ color: "var(--color-text)" }}>{config.provider}</span>
        </div>
        <div className="flex justify-between">
          <span>Project</span>
          <span
            className="font-mono truncate ml-2 max-w-[150px]"
            style={{ color: "var(--color-text)" }}
          >
            {config.projectPath}
          </span>
        </div>
        <div className="flex justify-between">
          <span>Max Tokens</span>
          <span style={{ color: "var(--color-text)" }}>{config.maxTokens}</span>
        </div>
      </div>
    </div>
  );
}
