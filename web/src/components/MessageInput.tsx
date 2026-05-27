import { useState, useRef, useCallback } from "react";
import type { ImageAttachment } from "../types";

interface MessageInputProps {
  onSend: (text: string, images?: ImageAttachment[]) => void;
  onAbort: () => void;
  onSlashCommand: (command: string) => void;
  processing: boolean;
  slashCommands: { name: string; description: string }[];
}

/** Convert a File to a base64 ImageAttachment */
function fileToImageAttachment(file: File): Promise<ImageAttachment> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      // data:image/png;base64,xxxx
      const commaIdx = dataUrl.indexOf(",");
      const mimeType = dataUrl.slice(5, dataUrl.indexOf(";"));
      const data = dataUrl.slice(commaIdx + 1);
      resolve({ data, mimeType });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/** Check if clipboard DataTransferItem is an image */
function isImageItem(item: DataTransferItem): boolean {
  return item.type.startsWith("image/");
}

export function MessageInput({
  onSend,
  onAbort,
  onSlashCommand,
  processing,
  slashCommands,
}: MessageInputProps) {
  const [text, setText] = useState("");
  const [images, setImages] = useState<ImageAttachment[]>([]);
  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const [slashFilter, setSlashFilter] = useState("");
  const [slashIndex, setSlashIndex] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const filteredCommands = slashCommands.filter(
    (c) => !slashFilter || c.name.startsWith(slashFilter.slice(1)),
  );

  const handleSubmit = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed && images.length === 0) return;
    if (trimmed.startsWith("/") && !trimmed.includes(" ")) {
      onSlashCommand(trimmed);
    } else {
      onSend(trimmed, images.length > 0 ? images : undefined);
    }
    setText("");
    setImages([]);
    setShowSlashMenu(false);
  }, [text, images, onSend, onSlashCommand]);

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
    // Backspace with empty text - remove last image
    if (e.key === "Backspace" && !text && images.length > 0) {
      e.preventDefault();
      setImages((prev) => prev.slice(0, -1));
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

  const handlePaste = useCallback(async (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    const imageItems: DataTransferItem[] = [];

    for (let i = 0; i < items.length; i++) {
      if (isImageItem(items[i])) {
        imageItems.push(items[i]);
      }
    }

    if (imageItems.length > 0) {
      e.preventDefault();
      const newImages: ImageAttachment[] = [];
      for (const item of imageItems) {
        const file = item.getAsFile();
        if (file) {
          try {
            const img = await fileToImageAttachment(file);
            newImages.push(img);
          } catch {
            // skip failed images
          }
        }
      }
      setImages((prev) => [...prev, ...newImages]);
    }
  }, []);

  const removeImage = useCallback((index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  }, []);

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

      {/* Image previews */}
      {images.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2 max-w-4xl mx-auto">
          {images.map((img, i) => (
            <div key={i} className="relative group">
              <img
                src={`data:${img.mimeType};base64,${img.data}`}
                alt={`Pasted image ${i + 1}`}
                className="h-16 w-16 object-cover rounded-lg border border-dscode-border"
              />
              <button
                onClick={() => removeImage(i)}
                className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-600 text-white rounded-full text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                title="Remove image"
              >
                ×
              </button>
            </div>
          ))}
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
          onPaste={handlePaste}
          placeholder={processing ? "Processing..." : "Type a message... (Enter to send, Shift+Enter for new line, paste image from clipboard)"}
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
            disabled={!text.trim() && images.length === 0}
            className="btn-primary shrink-0"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        )}
      </div>
      <div className="text-xs text-dscode-muted text-center mt-1.5">
        DSCode Web · {processing ? "Press Stop to abort" : "Type / for commands · Ctrl+V to paste images"}
      </div>
    </div>
  );
}
