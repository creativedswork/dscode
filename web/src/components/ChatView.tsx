import React, { useEffect, useRef, useState, useCallback, useLayoutEffect } from "react";
import type { UIMessage } from "../types";
import { ToolCard } from "./ToolCard";
import { Markdown } from "./Markdown";
import { Warning } from "@phosphor-icons/react";

interface PermissionPrompt {
  toolName: string;
  preview: string;
  fuzzyPattern?: string | null;
  fuzzyArgDesc?: string | null;
  llmSuggestions?: { label: string; toolPattern: string | null; argPattern: string | null }[];
}

interface ChatViewProps {
  messages: UIMessage[];
  processing: boolean;
  hasStreaming: boolean;
  sessionActiveMs: number;
  permissionPrompt: ({ toolName: string; preview: string; fuzzyPattern?: string | null; fuzzyArgDesc?: string | null; llmSuggestions?: { label: string; toolPattern: string | null; argPattern: string | null }[] }) | null;
  onPermission: (decision: "allow" | "always_allow" | "always_allow_save" | "deny", explainText?: string, toolNamePattern?: string, fuzzyMode?: number) => void;
  containerRef?: React.RefObject<HTMLDivElement>;
  scrollLocked?: boolean;
}
export function ChatView({ messages, processing, hasStreaming, sessionActiveMs, permissionPrompt, onPermission, containerRef, scrollLocked = false }: ChatViewProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);
  // sessionTime is driven by backend's getTotalActiveMs() via sessionActiveMs prop.
  // The backend already returns live time when the timer is running, so we must
  // NOT add local wall time on top (that would double-count).
  // session_time events from agent_start/agent_end keep it synced mid-turn.
  const sessionTime = sessionActiveMs;

  // ── Auto-scroll to bottom, gated by user scroll position ──
  useLayoutEffect(() => {
    if (isAtBottomRef.current && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: hasStreaming ? "instant" : "smooth" });
    }
  }, [messages, processing, permissionPrompt]);

  const handleChatScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const wasAtBottom = isAtBottomRef.current;
    const nowAtBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 64;
    isAtBottomRef.current = nowAtBottom;

    // Immediate snap when user scrolls back to bottom during streaming
    if (!wasAtBottom && nowAtBottom && hasStreaming) {
      requestAnimationFrame(() => {
        bottomRef.current?.scrollIntoView({ behavior: "instant" });
      });
    }
  }, [hasStreaming]);

  if (messages.length === 0 && !permissionPrompt) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
      <div
        data-collider="message-card"
          className="text-center max-w-md p-8"
          style={{
            borderRadius: "12px",
            border: "1px solid var(--color-border)",
            backgroundColor: "var(--color-surface)",
          }}
        >
          <h2 className="text-2xl font-bold mb-3" style={{ color: "var(--color-accent)" }}>
            DSCode Web
          </h2>
          <p className="text-sm leading-relaxed mb-6" style={{ color: "var(--color-text-muted)" }}>
            DeepSeek-native AI coding agent. Ask me to write code, run commands,
            search files, or manage your project — all from the browser.
          </p>
          <div className="space-y-2 text-xs" style={{ color: "var(--color-text-muted)" }}>
            <p>
              Type{" "}
              <code
                className="px-1.5 py-0.5 rounded"
                style={{
                  backgroundColor: "var(--color-surface-hover)",
                  color: "var(--color-accent)",
                  fontFamily: "Geist Mono, JetBrains Mono, monospace",
                  fontSize: "0.75rem",
                }}
              >
                /help
              </code>{" "}
              for available commands
            </p>
            <p>
              Press{" "}
              <code
                className="px-1.5 py-0.5 rounded"
                style={{
                  backgroundColor: "var(--color-surface-hover)",
                  color: "var(--color-accent)",
                  fontFamily: "Geist Mono, JetBrains Mono, monospace",
                  fontSize: "0.75rem",
                }}
              >
                /
              </code>{" "}
              to see slash commands
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div ref={(el) => { (scrollContainerRef as React.MutableRefObject<HTMLDivElement | null>).current = el; if (containerRef) { (containerRef as React.MutableRefObject<HTMLDivElement | null>).current = el; } }} onScroll={handleChatScroll} className={"flex-1 overflow-y-auto min-h-0 px-4 py-4 space-y-4" + (scrollLocked ? " overflow-hidden pointer-events-none" : "")}>
      {messages.map((msg) => (
        <ErrorBoundary key={msg.id} fallback={<FallbackBubble message={msg} />}>
          {msg.role === "user" ? <UserBubble message={msg} /> : <AssistantMessage message={msg} sessionTime={sessionTime} />}
        </ErrorBoundary>
      ))}

      {processing && !hasStreaming && !permissionPrompt && (
        <WaitingBubble sessionTime={sessionTime} />
      )}

      {permissionPrompt && (
        <InlinePermission
          toolName={permissionPrompt.toolName}
          preview={permissionPrompt.preview}
          fuzzyPattern={permissionPrompt.fuzzyPattern}
          fuzzyArgDesc={permissionPrompt.fuzzyArgDesc}
          llmSuggestions={permissionPrompt.llmSuggestions}
          onDecision={onPermission}
        />
      )}

      <div ref={bottomRef} />
    </div>
  );
}

// ── Error Boundary ──

class ErrorBoundary extends React.Component<{ children: React.ReactNode; fallback: React.ReactNode }> {
  state = { hasError: false, error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      console.error("[ChatView] render error:", this.state.error?.message);
      return this.props.fallback;
    }
    return this.props.children;
  }
}

function FallbackBubble({ message }: { message: UIMessage }) {
  return (
    <div className="flex justify-start">
      <div
        data-collider="message-card"
        className="max-w-[85%] px-4 py-3"
        style={{
          borderRadius: "12px",
          border: "1px solid var(--color-error-text)",
          backgroundColor: "var(--color-error)",
          color: "var(--color-error-text)",
        }}
      >
        <div className="text-xs font-bold mb-1">Render Error</div>
        <div className="text-xs font-mono break-all">
          role={message.role} | content={String(message.content).slice(0, 60)}
        </div>
      </div>
    </div>
  );
}

// ── Helpers ──

function formatTime(s: number): string {
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

function WaitingBubble({ sessionTime }: { sessionTime: number }) {
  return (
    <div className="flex justify-start animate-fade-up">
      <div
        className="px-4 py-3"
        style={{
          borderRadius: "12px",
          border: "1px solid var(--color-border)",
          backgroundColor: "var(--color-surface)",
        }}
      >
        <div className="flex items-center gap-3">
          <div className="flex gap-1">
            <span className="w-2 h-2 rounded-full animate-bounce" style={{ backgroundColor: "var(--color-accent)", animationDelay: "0ms" }} />
            <span className="w-2 h-2 rounded-full animate-bounce" style={{ backgroundColor: "var(--color-accent)", animationDelay: "150ms" }} />
            <span className="w-2 h-2 rounded-full animate-bounce" style={{ backgroundColor: "var(--color-accent)", animationDelay: "300ms" }} />
          </div>
          <span className="text-sm" style={{ color: "var(--color-text-muted)" }}>Waiting...</span>
          <span className="text-xs tabular-nums" style={{ color: "var(--color-text-muted)" }}>({formatTime(Math.floor(sessionTime / 1000))})</span>
        </div>
      </div>
    </div>
  );
}

function InlinePermission({
  toolName,
  preview,
  fuzzyPattern,
  fuzzyArgDesc,
  llmSuggestions,
  onDecision,
}: {
  toolName: string;
  preview: string;
  fuzzyPattern?: string | null;
  fuzzyArgDesc?: string | null;
  llmSuggestions?: { label: string; toolPattern: string | null; argPattern: string | null }[];
  onDecision: (decision: "allow" | "always_allow" | "always_allow_save" | "deny", explainText?: string, toolNamePattern?: string, fuzzyMode?: number) => void;
}) {
  const [explainMode, setExplainMode] = useState(false);
  const [explainText, setExplainText] = useState("");
  const [showFuzzyOptions, setShowFuzzyOptions] = useState(false);
  const [subModeType, setSubModeType] = useState<"save" | "session" | "allow">("save");
  const handleFuzzySelect = (mode: number) => {
    setShowFuzzyOptions(false);
    if (subModeType === "session" || subModeType === "allow") {
      if (mode === 0) {
        onDecision("always_allow");
      } else {
        onDecision("always_allow", undefined, fuzzyPattern ?? undefined, mode);
      }
    } else {
      onDecision("always_allow_save", undefined, mode === 1 ? fuzzyPattern ?? undefined : undefined, mode);
    }
  };

  const handleSubmitExplain = () => {
    if (explainText.trim()) {
      onDecision("deny", explainText.trim());
      setExplainText("");
      setExplainMode(false);
    }
  };

  return (
    <div className="flex justify-start animate-fade-up">
      <div
        className="max-w-[85%] md:max-w-[75%] px-4 py-3"
        data-collider="message-card"
        style={{
          borderRadius: "12px",
          border: "1px solid var(--color-border)",
          backgroundColor: "var(--color-warning)",
        }}
      >
        <div className="flex items-center gap-2 mb-2">
          <Warning size={16} weight="bold" style={{ color: "var(--color-warning-text)" }} />
          <span className="text-sm font-medium" style={{ color: "var(--color-warning-text)" }}>Permission Required</span>
        </div>
        <div className="mb-2 text-xs font-mono" style={{ color: "var(--color-accent)" }}>{toolName}</div>
        <div
          className="mb-3 text-xs font-mono break-all max-h-24 overflow-y-auto rounded p-2"
          style={{ backgroundColor: "var(--color-bg)", color: "var(--color-text-muted)" }}
        >
          {preview}
        </div>
        {explainMode ? (
          <div className="space-y-2">
            <textarea
              value={explainText}
              onChange={(e) => setExplainText(e.target.value)}
              placeholder="Explain what you want the agent to do instead..."
              className="w-full text-xs p-2 resize-none focus:outline-none"
              style={{ borderRadius: "8px", backgroundColor: "var(--color-bg)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}
              rows={3}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmitExplain(); }
                if (e.key === "Escape") { setExplainText(""); setExplainMode(false); }
              }}
            />
            <div className="flex gap-2">
              <button onClick={handleSubmitExplain} disabled={!explainText.trim()} className="btn-primary text-xs">Submit</button>
              <button onClick={() => { setExplainText(""); setExplainMode(false); }} className="btn-secondary text-xs">Cancel</button>
            </div>
          </div>
        ) : showFuzzyOptions ? (
          <div className="flex gap-2 flex-wrap">
            {subModeType === "session" ? (
              <>
                <button onClick={() => handleFuzzySelect(0)} className="btn-secondary text-xs">
                  Exact: {toolName}
                </button>
                <button onClick={() => handleFuzzySelect(1)} className="btn-secondary text-xs">
                  Fuzzy: {fuzzyPattern}
                </button>
              </>
            ) : (
              <>
                <button onClick={() => handleFuzzySelect(0)} className="btn-secondary text-xs">
                  Exact: {toolName}{!toolName.startsWith("mcp__") ? " (this call)" : ""}
                </button>
                <button onClick={() => handleFuzzySelect(1)} className="btn-secondary text-xs">
                  {toolName.startsWith("mcp__") ? fuzzyPattern : "All calls"}
                </button>
                {fuzzyArgDesc && (
                  <button onClick={() => handleFuzzySelect(2)} className="btn-secondary text-xs">
                    {fuzzyArgDesc}
                  </button>
                )}
                {llmSuggestions && llmSuggestions.map((s, i) => (
                  <button key={i} onClick={() => handleFuzzySelect(3 + i)} className="btn-secondary text-xs">
                    [AI] {s.label}
                  </button>
                ))}
              </>
            )}
            <button onClick={() => setShowFuzzyOptions(false)} className="btn text-xs" style={{ backgroundColor: "var(--color-surface-hover)" }}>
              Cancel
            </button>
          </div>
        ) : (
          <div className="flex gap-2 flex-wrap">
            {(fuzzyPattern && fuzzyPattern !== toolName) ? (
              <button onClick={() => { setSubModeType("allow"); setShowFuzzyOptions(true); }} className="btn-primary text-xs">
                Allow ▸
              </button>
            ) : (
              <button onClick={() => onDecision("allow")} className="btn-primary text-xs">Allow</button>
            )}
            {(fuzzyPattern && fuzzyPattern !== toolName) ? (
              <button onClick={() => { setSubModeType("session"); setShowFuzzyOptions(true); }} className="btn-secondary text-xs">
                Always Allow ▸
              </button>
            ) : (
              <button onClick={() => onDecision("always_allow")} className="btn-secondary text-xs">Always Allow</button>
            )}
            <button onClick={() => { setSubModeType("save"); setShowFuzzyOptions(true); }} className="btn-secondary text-xs">
              Save to Settings ▸
            </button>
            <button
              onClick={() => setExplainMode(true)}
              className="btn text-xs"
              style={{ backgroundColor: "var(--color-warning)", color: "var(--color-warning-text)", borderColor: "var(--color-warning-text)" }}
            >
              Explain
            </button>
            <button onClick={() => onDecision("deny")} className="btn-danger text-xs">Deny</button>
          </div>
        )}
      </div>
    </div>
  );
}

function UserBubble({ message }: { message: UIMessage }) {
  const safeContent = typeof message.content === "string" ? message.content : "";

  return (
    <div className="user-msg">
      <div className="meta">You{message.createdAt ? ` · ${new Date(message.createdAt).toLocaleTimeString()}` : ""}</div>
      <div data-collider="message-card" className="content">
        {message.images && message.images.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2 justify-end">
            {message.images.map((img, i) => {
              const src = "data" in img
                ? `data:${img.mimeType};base64,${(img as any).data}`
                : undefined;
              return (
                <img
                  key={i}
                  src={src ?? "/placeholder-image.svg"}
                  alt={`Attached image ${i + 1}`}
                  className="max-w-[200px] max-h-[200px] object-cover rounded cursor-pointer hover:opacity-90 transition-opacity"
                  style={{ border: "1px solid var(--color-border)" }}
                  onClick={() => src && window.open(src, "_blank")}
                />
              );
            })}
          </div>
        )}

        {safeContent ? (
          safeContent.split('\n').map((line, i) => (
            <span key={i} data-collider="text-line">
              {line ? <Markdown className="text-sm leading-relaxed">{line}</Markdown> : <br />}
            </span>
          ))
        ) : (
          message.isStreaming && !message.thinking && (!message.images || message.images.length === 0) ? (
            <span className="inline-block w-2 h-4 animate-pulse rounded-sm" style={{ backgroundColor: "var(--color-accent)" }} />
          ) : null
        )}
      </div>
    </div>
  );
}

function AssistantMessage({ message, sessionTime }: { message: UIMessage; sessionTime: number }) {
  const safeContent = typeof message.content === "string" ? message.content : "";

  return (
    <div className="assistant-msg">
      <div className="meta">dscode{message.createdAt ? ` · ${new Date(message.createdAt).toLocaleTimeString()}` : ""}</div>

      {message.thinking && (
        <ThinkingBlock thinking={message.thinking} isStreaming={message.isStreaming} sessionTime={sessionTime} />
      )}

      {message.images && message.images.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {message.images.map((img, i) => {
            const src = "data" in img
              ? `data:${img.mimeType};base64,${(img as any).data}`
              : undefined;
            return (
              <img
                key={i}
                src={src ?? "/placeholder-image.svg"}
                alt={`Attached image ${i + 1}`}
                className="max-w-[200px] max-h-[200px] object-cover rounded cursor-pointer hover:opacity-90 transition-opacity"
                style={{ border: "1px solid var(--color-border)" }}
                onClick={() => src && window.open(src, "_blank")}
              />
            );
          })}
        </div>
      )}

      {message.tools && message.tools.length > 0 && (
        <div className="space-y-2">
          {message.tools.map((tool, i) => (
            <ToolCard key={`${tool.name}-${i}`} tool={tool} thinking={message.thinking} />
          ))}
        </div>
      )}

      <div className="text-response">
        {safeContent ? (
          safeContent.split('\n').map((line, i) => (
            <span key={i} data-collider="text-line">
              {line ? <Markdown className="text-sm leading-relaxed">{line}</Markdown> : <br />}
            </span>
          ))
        ) : (
          message.isStreaming && !message.thinking && (!message.images || message.images.length === 0) ? (
            <span className="inline-block w-2 h-4 animate-pulse rounded-sm" style={{ backgroundColor: "var(--color-accent)" }} />
          ) : null
        )}
      </div>
    </div>
  );
}

function ThinkingBlock({ thinking, isStreaming, sessionTime }: { thinking: string; isStreaming?: boolean; sessionTime: number }) {
  const [collapsed, setCollapsed] = useState(!isStreaming);

  // auto-expand when streaming starts
  useEffect(() => {
    if (isStreaming) setCollapsed(false);
  }, [isStreaming]);

  return (
    <div className={`thinking${collapsed ? " collapsed" : ""}`} data-collider="thinking-block">
      <div className="label" onClick={() => setCollapsed(!collapsed)}>
        <span className="dot" />
        Thinking
      </div>
      <div className="thinking-body">{thinking}</div>
    </div>
  );
}
