import React, { useEffect, useRef, useState } from "react";
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
  turnStartRef: React.MutableRefObject<number>;
  permissionPrompt: ({ toolName: string; preview: string; fuzzyPattern?: string | null; fuzzyArgDesc?: string | null; llmSuggestions?: { label: string; toolPattern: string | null; argPattern: string | null }[] }) | null;
  onPermission: (decision: "allow" | "always_allow" | "always_allow_save" | "deny", explainText?: string, toolNamePattern?: string, fuzzyMode?: number) => void;
}
export function ChatView({ messages, processing, hasStreaming, turnStartRef, permissionPrompt, onPermission }: ChatViewProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const [elapsed, setElapsed] = useState(0);

  // Elapsed timer driven by turnStartRef (set on handleSend / loader:show, reset on loader:hide / error)
  // Uses requestAnimationFrame to continuously poll the ref value, since ref changes
  // don't trigger React re-renders and [turnStartRef.current] as a dependency is inert.
  useEffect(() => {
    let raf: number;
    const tick = () => {
      const start = turnStartRef.current;
      if (!start) {
        setElapsed(0);
      } else {
        setElapsed(Math.floor((Date.now() - start) / 1000));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [turnStartRef]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, processing, permissionPrompt]);

  if (messages.length === 0 && !permissionPrompt) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div
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
    <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
      {messages.map((msg) => (
        <ErrorBoundary key={msg.id} fallback={<FallbackBubble message={msg} />}>
          <MessageBubble message={msg} elapsed={elapsed} />
        </ErrorBoundary>
      ))}

      {processing && !hasStreaming && !permissionPrompt && (
        <WaitingBubble elapsed={elapsed} />
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

function WaitingBubble({ elapsed }: { elapsed: number }) {
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
          <span className="text-xs tabular-nums" style={{ color: "var(--color-text-muted)" }}>({formatTime(elapsed)})</span>
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

function MessageBubble({ message, elapsed }: { message: UIMessage; elapsed: number }) {
  const isUser = message.role === "user";
  const safeContent = typeof message.content === "string" ? message.content : "";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} animate-fade-up`}>
      <div
        className="max-w-[85%] md:max-w-[75%] px-4 py-3"
        style={
          isUser
            ? {
                borderRadius: "12px 12px 4px 12px",
                backgroundColor: "var(--color-user-bubble)",
                color: "var(--color-user-bubble-text)",
              }
            : {
                borderRadius: "12px 12px 12px 4px",
                border: "1px solid var(--color-border)",
                backgroundColor: "var(--color-surface)",
                color: "var(--color-text)",
              }
        }
      >
        {message.thinking && (
          <ThinkingBlock thinking={message.thinking} isStreaming={message.isStreaming} elapsed={elapsed} />
        )}

        {message.images && message.images.length > 0 && (
          <div className={`flex flex-wrap gap-2 mb-2 ${isUser ? "justify-end" : "justify-start"}`}>
            {message.images.map((img, i) => {
              // Backend restores ImageRef to ImageAttachment before sending.
              // Handle both types for type safety / cache miss fallback.
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

        <div style={{ color: isUser ? "var(--color-user-bubble-text)" : "var(--color-text)" }}>
          {safeContent || (message.images && message.images.length > 0) ? (
            <Markdown className="text-sm leading-relaxed">{safeContent}</Markdown>
          ) : (
            message.isStreaming && !message.thinking && (!message.images || message.images.length === 0) ? (
              <span className="inline-block w-2 h-4 animate-pulse rounded-sm" style={{ backgroundColor: "var(--color-accent)" }} />
            ) : null
          )}
        </div>

        {message.tools && message.tools.length > 0 && (
          <div className="mt-3 space-y-2">
            {message.tools.map((tool, i) => (
              <ToolCard key={`${tool.name}-${i}`} tool={tool} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ThinkingBlock({ thinking, isStreaming, elapsed }: { thinking: string; isStreaming?: boolean; elapsed: number }) {
  return (
    <details className="mb-2 group" open={isStreaming}>
      <summary className="text-xs cursor-pointer select-none" style={{ color: "var(--color-text-muted)" }}>
        {isStreaming ? `Thinking... (${formatTime(elapsed)})` : "Thought"}
      </summary>
      <div
        className="mt-1.5 text-xs italic leading-relaxed pl-3 max-h-60 overflow-y-auto"
        style={{ borderLeft: "2px solid var(--color-accent)", color: "var(--color-text-muted)" }}
      >
        {thinking}
      </div>
    </details>
  );
}
