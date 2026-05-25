import { useState, useRef, useCallback } from "react";

interface MessageInputProps {
  onSend: (text: string) => void;
  onAbort: () => void;
  onSlashCommand: (command: string) => void;
  processing: boolean;
  slashCommands: { name: string; description: string }[];
}

export function MessageInput({
  onSend,
  onAbort,
  onSlashCommand,
  processing,
  slashCommands,
}: MessageInputProps) {
  const [text, setText] = useState("");
  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const [slashFilter, setSlashFilter] = useState("");
  const [slashIndex, setSlashIndex] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const filteredCommands = slashCommands.filter(
    (c) => !slashFilter || c.name.startsWith(slashFilter.slice(1)),
  );

  const handleSubmit = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed) return;
    if (trimmed.startsWith("/") && !trimmed.includes(" ")) {
      // It's a slash command without args via the menu
      onSlashCommand(trimmed);
    } else {
      onSend(trimmed);
    }
    setText("");
    setShowSlashMenu(false);
  }, [text, onSend, onSlashCommand]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (showSlashMenu) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSlashIndex((i) => Math.min(i + 1, filteredCommands.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSlashIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        const cmd = filteredCommands[slashIndex];
        if (cmd) {
          setText(`/${cmd.name} `);
          setShowSlashMenu(false);
          textareaRef.current?.focus();
        }
      } else if (e.key === "Escape") {
        setShowSlashMenu(false);
      }
      return;
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!processing) handleSubmit();
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setText(val);

    // Slash command detection
    if (val === "/") {
      setShowSlashMenu(true);
      setSlashFilter("");
      setSlashIndex(0);
    } else if (val.startsWith("/") && !val.includes(" ")) {
      setShowSlashMenu(true);
      setSlashFilter(val);
      setSlashIndex(0);
    } else {
      setShowSlashMenu(false);
    }
  };

  // Auto-resize textarea
  const adjustHeight = () => {
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = "auto";
      ta.style.height = Math.min(ta.scrollHeight, 200) + "px";
    }
  };

  return (
    <div className="border-t border-dscode-border bg-dscode-surface px-4 py-3 relative">
      {/* Slash command dropdown */}
      {showSlashMenu && filteredCommands.length > 0 && (
        <div className="absolute bottom-full left-4 mb-1 w-72 bg-dscode-surface border border-dscode-border rounded-xl shadow-2xl overflow-hidden z-50">
          <div className="px-3 py-2 text-xs text-dscode-muted border-b border-dscode-border">
            Commands
          </div>
          <div className="max-h-48 overflow-y-auto">
            {filteredCommands.map((cmd, i) => (
              <button
                key={cmd.name}
                className={`w-full text-left px-3 py-2 text-sm transition-colors flex items-center gap-2 ${
                  i === slashIndex
                    ? "bg-dscode-accentDim/30 text-white"
                    : "text-dscode-text hover:bg-gray-700/50"
                }`}
                onMouseEnter={() => setSlashIndex(i)}
                onClick={() => {
                  setText(`/${cmd.name} `);
                  setShowSlashMenu(false);
                  textareaRef.current?.focus();
                }}
              >
                <span className="font-mono text-dscode-accent text-xs">/{cmd.name}</span>
                <span className="text-dscode-muted text-xs truncate">{cmd.description}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-end gap-2 max-w-4xl mx-auto">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => {
            handleChange(e);
            adjustHeight();
          }}
          onKeyDown={handleKeyDown}
          placeholder={processing ? "Processing..." : "Type a message... (Enter to send, Shift+Enter for new line)"}
          disabled={processing}
          rows={1}
          className="input flex-1 resize-none font-mono text-sm min-h-[40px] max-h-[200px]"
        />
        {processing ? (
          <button
            onClick={onAbort}
            className="btn-danger shrink-0"
            title="Abort (Esc)"
          >
            Stop
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={!text.trim()}
            className="btn-primary shrink-0"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        )}
      </div>
      <div className="text-xs text-dscode-muted text-center mt-1.5">
        DSCode Web · {processing ? "Press Stop to abort" : "Type / for commands"}
      </div>
    </div>
  );
}
