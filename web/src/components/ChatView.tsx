import { useEffect, useRef, useState } from "react";
import type { UIMessage } from "../types";
import { ToolCard } from "./ToolCard";

interface PermissionPrompt {
  toolName: string;
  preview: string;
}

interface ChatViewProps {
  messages: UIMessage[];
  processing: boolean;
  hasStreaming: boolean;
  permissionPrompt: PermissionPrompt | null;
  onPermission: (decision: "allow" | "always_allow" | "deny") => void;
}

export function ChatView({ messages, processing, hasStreaming, permissionPrompt, onPermission }: ChatViewProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!processing) {
      setElapsed(0);
      return;
    }
    const start = Date.now();
    const timer = setInterval(() => {
      setElapsed(Math.floor((Date.now() - start) / 1000));
    }, 500);
    return () => clearInterval(timer);
  }, [processing]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, processing, permissionPrompt]);

  if (messages.length === 0 && !permissionPrompt) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center max-w-md">
          <h2 className="text-2xl font-bold text-dscode-accent mb-3">DSCode Web</h2>
          <p className="text-dscode-muted text-sm leading-relaxed">
            DeepSeek-native AI coding agent. Ask me to write code, run commands,
            search files, or manage your project — all from the browser.
          </p>
          <div className="mt-6 space-y-2 text-xs text-dscode-muted">
            <p>Type <code className="bg-dscode-surface px-1.5 py-0.5 rounded text-dscode-accent">/help</code> for available commands</p>
            <p>Press <code className="bg-dscode-surface px-1.5 py-0.5 rounded text-dscode-accent">/</code> to see slash commands</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
      {messages.map((msg) => (
        <MessageBubble key={msg.id} message={msg} elapsed={elapsed} />
      ))}

      {processing && !hasStreaming && !permissionPrompt && (
        <WaitingBubble elapsed={elapsed} />
      )}

      {permissionPrompt && (
        <InlinePermission
          toolName={permissionPrompt.toolName}
          preview={permissionPrompt.preview}
          onDecision={onPermission}
        />
      )}

      <div ref={bottomRef} />
    </div>
  );
}

function formatTime(s: number): string {
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

function WaitingBubble({ elapsed }: { elapsed: number }) {
  return (
    <div className="flex justify-start">
      <div className="bg-dscode-surface border border-dscode-border rounded-2xl rounded-bl-md px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex gap-1">
            <span className="w-2 h-2 bg-dscode-accent rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
            <span className="w-2 h-2 bg-dscode-accent rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
            <span className="w-2 h-2 bg-dscode-accent rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
          </div>
          <span className="text-sm text-dscode-muted">Waiting...</span>
          <span className="text-xs text-dscode-muted tabular-nums">({formatTime(elapsed)})</span>
        </div>
      </div>
    </div>
  );
}

function InlinePermission({
  toolName,
  preview,
  onDecision,
}: {
  toolName: string;
  preview: string;
  onDecision: (decision: "allow" | "always_allow" | "deny") => void;
}) {
  return (
    <div className="flex justify-start">
      <div className="max-w-[85%] md:max-w-[75%] bg-yellow-900/20 border border-yellow-700/40 rounded-2xl rounded-bl-md px-4 py-3">
        <div className="flex items-center gap-2 mb-2">
          <svg className="w-4 h-4 text-dscode-yellow shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m0 0v2m0-2h2m-2 0H10m9.364-6.364a9 9 0 11-12.728 0 9 9 0 0112.728 0z" />
          </svg>
          <span className="text-sm font-medium text-dscode-yellow">Permission Required</span>
        </div>

        <div className="mb-2 text-xs font-mono text-dscode-accent">{toolName}</div>
        <div className="mb-3 text-xs text-dscode-muted font-mono break-all max-h-24 overflow-y-auto bg-dscode-bg/50 rounded p-2">
          {preview}
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => onDecision("allow")}
            className="px-3 py-1.5 text-xs font-medium bg-dscode-accent text-white rounded-lg hover:bg-blue-600 transition-colors"
          >
            Allow
          </button>
          <button
            onClick={() => onDecision("always_allow")}
            className="px-3 py-1.5 text-xs font-medium bg-dscode-surface border border-dscode-border text-dscode-text rounded-lg hover:bg-gray-700 transition-colors"
          >
            Always Allow
          </button>
          <button
            onClick={() => onDecision("deny")}
            className="px-3 py-1.5 text-xs font-medium bg-red-900/30 text-dscode-red border border-dscode-red/30 rounded-lg hover:bg-red-900/50 transition-colors"
          >
            Deny
          </button>
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ message, elapsed }: { message: UIMessage; elapsed: number }) {
  const isUser = message.role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] md:max-w-[75%] rounded-2xl px-4 py-3 ${
          isUser
            ? "bg-dscode-accentDim text-white rounded-br-md"
            : "bg-dscode-surface border border-dscode-border rounded-bl-md"
        }`}
      >
        {/* Thinking block */}
        {message.thinking && (
          <ThinkingBlock thinking={message.thinking} isStreaming={message.isStreaming} elapsed={elapsed} />
        )}

        {/* Content */}
        {message.content && (
          <div className="whitespace-pre-wrap break-words text-sm leading-relaxed">
            {message.content}
          </div>
        )}

        {/* Streaming cursor — only when no content and no thinking yet */}
        {message.isStreaming && !message.content && !message.thinking && (
          <span className="inline-block w-2 h-4 bg-dscode-accent animate-pulse rounded-sm" />
        )}

        {/* Tool calls */}
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
      <summary className="text-xs text-dscode-muted cursor-pointer hover:text-dscode-text transition-colors select-none">
        {isStreaming
          ? `💭 Thinking... (${formatTime(elapsed)})`
          : "💭 Thought"}
      </summary>
      <div className="mt-1.5 text-xs text-dscode-muted italic leading-relaxed border-l-2 border-dscode-border pl-3 max-h-60 overflow-y-auto">
        {thinking}
      </div>
    </details>
  );
}
