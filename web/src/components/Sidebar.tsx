import type { SessionInfo, McpServerInfo, ConfigData } from "../types";

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
}: SidebarProps) {
  return (
    <>
      {/* Mobile overlay */}
      {open && (
        <div className="fixed inset-0 bg-black/50 z-40 md:hidden" onClick={onClose} />
      )}

      <aside
        className={`fixed md:static inset-y-0 left-0 z-50 w-80 bg-dscode-surface border-r border-dscode-border flex flex-col transform transition-transform duration-200 ${
          open ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        } ${!open && "hidden md:flex"}`}
      >
        {/* Close button (mobile) */}
        <div className="flex items-center justify-between p-3 border-b border-dscode-border md:hidden">
          <span className="font-semibold text-sm">DSCode</span>
          <button onClick={onClose} className="p-1 hover:bg-gray-700 rounded-lg">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-dscode-border">
          {(["sessions", "mcp", "settings"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => onTabChange(tab)}
              className={`flex-1 py-2.5 text-xs font-medium transition-colors capitalize ${
                activeTab === tab
                  ? "text-dscode-accent border-b-2 border-dscode-accent"
                  : "text-dscode-muted hover:text-dscode-text"
              }`}
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
}: {
  sessions: SessionInfo[];
  onAction: (action: "list" | "save" | "load" | "delete", id?: string) => void;
}) {
  return (
    <div className="space-y-3">
      <button onClick={() => onAction("save")} className="btn-primary w-full text-xs">
        Save Current Session
      </button>

      {sessions.length === 0 ? (
        <p className="text-xs text-dscode-muted text-center py-8">No saved sessions</p>
      ) : (
        <div className="space-y-1">
          {sessions.map((s) => (
            <div
              key={s.id}
              className="flex items-center justify-between p-2 rounded-lg hover:bg-gray-700/50 transition-colors group"
            >
              <button
                onClick={() => onAction("load", s.id)}
                className="flex-1 text-left min-w-0"
              >
                <div className="text-sm truncate">{s.title}</div>
                <div className="text-xs text-dscode-muted">
                  {new Date(s.updatedAt).toLocaleDateString()} · {s.messageCount} msgs
                </div>
              </button>
              <button
                onClick={() => onAction("delete", s.id)}
                className="opacity-0 group-hover:opacity-100 p-1 text-dscode-red hover:bg-red-900/30 rounded transition-all"
                title="Delete"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
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
        <p className="text-xs text-dscode-muted text-center py-8">No MCP servers configured</p>
      ) : (
        <div className="space-y-1">
          {servers.map((s) => (
            <div key={s.name}>
              <button
                onClick={() => setExpandedServer(expandedServer === s.name ? null : s.name)}
                className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-gray-700/50 transition-colors text-left"
              >
                <div className="min-w-0">
                  <div className="text-sm truncate">{s.name}</div>
                  <div className="text-xs text-dscode-muted">{s.toolCount} tools</div>
                </div>
                <StatusBadge status={s.status} />
              </button>

              {expandedServer === s.name && (
                <div className="ml-3 mt-1 space-y-0.5 border-l-2 border-dscode-border pl-3">
                  {s.tools.map((t) => (
                    <div key={t.name} className="text-xs py-1">
                      <span className="font-mono text-dscode-accent">{t.name}</span>
                      {t.description && (
                        <span className="text-dscode-muted ml-1">— {t.description}</span>
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
  const colors: Record<string, string> = {
    connected: "bg-green-900/30 text-dscode-green",
    connecting: "bg-yellow-900/30 text-dscode-yellow",
    error: "bg-red-900/30 text-dscode-red",
    disconnected: "bg-gray-700/50 text-dscode-muted",
  };

  return (
    <span className={`text-xs px-1.5 py-0.5 rounded-full ${colors[status] || colors.disconnected}`}>
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
    return <p className="text-xs text-dscode-muted text-center py-8">Loading...</p>;
  }

  return (
    <div className="space-y-4">
      {/* Provider */}
      <div>
        <label className="text-xs text-dscode-muted mb-1 block">Provider</label>
        <select
          value={providerInput}
          onChange={(e) => {
            const value = e.target.value;
            setProviderInput(value);
            if (value) onChange("set_provider", value);
          }}
          className="input text-xs w-full"
        >
          {config.providers.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
      </div>

      {/* Model */}
      <div>
        <label className="text-xs text-dscode-muted mb-1 block">Model</label>
        <select
          value={modelInput}
          onChange={(e) => {
            const value = e.target.value;
            setModelInput(value);
            if (value) onChange("set_model", value);
          }}
          className="input text-xs w-full"
        >
          {config.models.map((m) => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
      </div>

      {/* Thinking Level */}
      <div>
        <label className="text-xs text-dscode-muted mb-1 block">Thinking Level</label>
        <select
          value={thinkingLevel}
          onChange={(e) => {
            setThinkingLevel(e.target.value);
            onChange("set_thinking", e.target.value);
          }}
          className="input text-xs"
        >
          {["off", "minimal", "low", "medium", "high", "xhigh"].map((l) => (
            <option key={l} value={l}>{l}</option>
          ))}
        </select>
      </div>

      {/* API Key */}
      <div>
        <label className="text-xs text-dscode-muted mb-1 block">API Key</label>
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

      {/* Info */}
      <div className="pt-2 border-t border-dscode-border space-y-1 text-xs text-dscode-muted">
        <div className="flex justify-between">
          <span>Provider</span>
          <span className="text-dscode-text">{config.provider}</span>
        </div>
        <div className="flex justify-between">
          <span>Project</span>
          <span className="text-dscode-text font-mono truncate ml-2 max-w-[150px]">{config.projectPath}</span>
        </div>
        <div className="flex justify-between">
          <span>Max Tokens</span>
          <span className="text-dscode-text">{config.maxTokens}</span>
        </div>
      </div>
    </div>
  );
}

import { useState, useEffect, useRef } from "react";
