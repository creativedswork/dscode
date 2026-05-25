import { useEffect, useRef } from "react";
import type { UIMessage } from "../types";
import { ToolCard } from "./ToolCard";

interface ChatViewProps {
  messages: UIMessage[];
}

export function ChatView({ messages }: ChatViewProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  if (messages.length === 0) {
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
        <MessageBubble key={msg.id} message={msg} />
      ))}
      <div ref={bottomRef} />
    </div>
  );
}

function MessageBubble({ message }: { message: UIMessage }) {
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
          <ThinkingBlock thinking={message.thinking} />
        )}

        {/* Content */}
        {message.content && (
          <div className="whitespace-pre-wrap break-words text-sm leading-relaxed">
            {message.content}
          </div>
        )}

        {/* Streaming cursor */}
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

function ThinkingBlock({ thinking }: { thinking: string }) {
  return (
    <details className="mb-2 group" open>
      <summary className="text-xs text-dscode-muted cursor-pointer hover:text-dscode-text transition-colors select-none">
        💭 Thinking...
      </summary>
      <div className="mt-1.5 text-xs text-dscode-muted italic leading-relaxed border-l-2 border-dscode-border pl-3 max-h-60 overflow-y-auto">
        {thinking}
      </div>
    </details>
  );
}
