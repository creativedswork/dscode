import { useState, useRef, useCallback, useEffect } from "react";
import type { ImageAttachment, FileAttachment, FileListItem } from "../types";
import { PaperPlaneTilt, Folder, File, Image, TextAlignLeft, Video, SpeakerHigh, FilePdf, Archive, X } from "@phosphor-icons/react";

interface MessageInputProps {
  onSend: (text: string, images?: ImageAttachment[], fileRefs?: string[], uploadedFiles?: { name: string; content: string }[]) => void;
  onAbort: () => void;
  onSlashCommand: (command: string) => void;
  onCommand: (cmd: { type: "file_list"; prefix: string }) => void;
  processing: boolean;
  slashCommands: { name: string; description: string }[];
  fileListItems: FileListItem[];
  fileListPrefix: string;
  projectPath: string;
  onToast?: (type: "warning" | "error", text: string) => void;
  viewMode?: "chat" | "dashboard";
}

function fileToImageAttachment(file: File): Promise<ImageAttachment> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      const compressed = await compressImage(dataUrl);
      const commaIdx = compressed.indexOf(",");
      const mimeType = compressed.slice(5, compressed.indexOf(";"));
      const data = compressed.slice(commaIdx + 1);
      resolve({ data, mimeType });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function compressImage(dataUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.onload = () => {
      const MAX_HEIGHT = 480;
      if (img.height <= MAX_HEIGHT) {
        resolve(dataUrl);
        return;
      }
      const scale = MAX_HEIGHT / img.height;
      const width = Math.round(img.width * scale);
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = MAX_HEIGHT;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(dataUrl);
        return;
      }
      ctx.drawImage(img, 0, 0, width, MAX_HEIGHT);
      resolve(canvas.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => reject(new Error("Failed to load image for compression"));
    img.src = dataUrl;
  });
}

function isImageItem(item: DataTransferItem): boolean {
  return item.type.startsWith("image/");
}

/**
 * Heuristic: does the captured text look like a file path
 * rather than CJK prose? Mirrors logic from at-file-resolver.ts.
 */
function isLikelyFilePath(text: string): boolean {
  if (text.includes("/") || text.includes("\\")) return true;
  if (/\.[a-zA-Z0-9]{1,6}$/.test(text)) return true;
  if (/[a-zA-Z0-9\-_]/.test(text)) return true;
  return false;
}

function getFileIcon(mimeType: string) {
  if (mimeType.startsWith("image/")) return Image;
  if (mimeType.startsWith("text/")) return TextAlignLeft;
  if (mimeType.startsWith("video/")) return Video;
  if (mimeType.startsWith("audio/")) return SpeakerHigh;
  if (mimeType === "application/pdf") return FilePdf;
  if (mimeType.startsWith("application/zip") || mimeType.startsWith("application/x-")) return Archive;
  return File;
}

function getFileIconFromPath(path: string) {
  const ext = path.slice(path.lastIndexOf(".")).toLowerCase();
  if ([".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".svg"].includes(ext)) return Image;
  if ([".txt", ".md", ".mdx", ".log", ".csv"].includes(ext)) return TextAlignLeft;
  if ([".mp4", ".avi", ".mov", ".webm"].includes(ext)) return Video;
  if ([".mp3", ".wav", ".ogg"].includes(ext)) return SpeakerHigh;
  if (ext === ".pdf") return FilePdf;
  if ([".zip", ".tar", ".gz", ".7z", ".rar"].includes(ext)) return Archive;
  return File;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const MAX_TOTAL_SIZE = 50 * 1024 * 1024; // 50 MB

export function MessageInput({
  onSend,
  onAbort,
  onSlashCommand,
  onCommand,
  processing,
  slashCommands,
  fileListItems,
  fileListPrefix,
  viewMode,
  projectPath,
  onToast,
}: MessageInputProps) {
  const [text, setText] = useState("");
  const [images, setImages] = useState<ImageAttachment[]>([]);
  const [uploadedFiles, setUploadedFiles] = useState<{ name: string; size: number; content: string }[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const [slashFilter, setSlashFilter] = useState("");
  const [slashIndex, setSlashIndex] = useState(0);
  const [showFileMenu, setShowFileMenu] = useState(false);
  const [fileFilter, setFileFilter] = useState("");
  const [fileIndex, setFileIndex] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const historyRef = useRef<string[]>([]);
  const historyCursorRef = useRef<number>(-1);
  const draftRef = useRef<string>("");
  const isComposingRef = useRef(false);
  const MAX_HISTORY = 100;

  const filteredCommands = slashCommands.filter(
    (c) => !slashFilter || c.name.startsWith(slashFilter.slice(1)),
  );

  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    if (showFileMenu && fileFilter !== undefined) {
      clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        onCommand({ type: "file_list", prefix: fileFilter });
      }, 150);
    }
    return () => clearTimeout(debounceRef.current);
  }, [fileFilter, showFileMenu, onCommand]);

  useEffect(() => {
    setFileIndex(0);
  }, [fileListItems]);

  const handleSubmit = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed && images.length === 0 && uploadedFiles.length === 0) return;
    // Push to history if non-empty and not duplicate of last entry
    if (trimmed && historyRef.current[0] !== trimmed) {
      historyRef.current.unshift(trimmed);
      if (historyRef.current.length > MAX_HISTORY) {
        historyRef.current.pop();
      }
    }
    historyCursorRef.current = -1;
    const uploadPayload = uploadedFiles.length > 0
      ? uploadedFiles.map(f => ({ name: f.name, content: f.content }))
      : undefined;
    onSend(trimmed, images.length > 0 ? images : undefined, undefined, uploadPayload);
    setText("");
    setImages([]);
    setUploadedFiles([]);
    setShowSlashMenu(false);
    setShowFileMenu(false);
  }, [text, images, uploadedFiles, onSend]);

  const navigateToDirectory = (dirPath: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const cursorPos = textarea.selectionStart ?? text.length;
    const textBeforeCursor = text.slice(0, cursorPos);
    const atMatch = textBeforeCursor.match(/(?:^|(?<![a-zA-Z0-9]))@("([^"]*)"?|([^\s]*))$/);
    if (!atMatch || !isLikelyFilePath(atMatch[2] ?? atMatch[3] ?? "")) return;

    const atIdx = textBeforeCursor.lastIndexOf("@");
    if (atIdx === -1) return;

    const before = text.slice(0, atIdx);
    const after = text.slice(cursorPos);
    const newPrefix = `@${dirPath}/`;
    const newText = `${before}${newPrefix}${after}`;
    setText(newText);
    setFileFilter(dirPath + "/");
    setShowFileMenu(true);

    onCommand({ type: "file_list", prefix: dirPath + "/" });

    requestAnimationFrame(() => {
      const newPos = atIdx + newPrefix.length;
      textarea.focus();
      textarea.setSelectionRange(newPos, newPos);
    });
  };

  const insertFilePath = (path: string, keepMenu: boolean) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const cursorPos = textarea.selectionStart ?? text.length;
    const textBeforeCursor = text.slice(0, cursorPos);
    const atIdx = textBeforeCursor.lastIndexOf("@");

    if (atIdx === -1) return;

    const before = text.slice(0, atIdx);
    const after = text.slice(cursorPos);
    if (keepMenu) {
      const newText = `${before}@${path} @${after}`;
      setText(newText);
      setFileFilter("");
      onCommand({ type: "file_list", prefix: "" });

      requestAnimationFrame(() => {
        const newPos = atIdx + path.length + 3;
        textarea.focus();
        textarea.setSelectionRange(newPos, newPos);
      });
    } else {
      const newText = `${before}@${path} ${after}`;
      setText(newText);
      setShowFileMenu(false);

      requestAnimationFrame(() => {
        const newPos = atIdx + path.length + 2;
        textarea.focus();
        textarea.setSelectionRange(newPos, newPos);
      });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (showFileMenu) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setFileIndex((i) => Math.min(i + 1, fileListItems.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setFileIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        const item = fileListItems[fileIndex];
        if (item) {
          if (item.isDir) {
            navigateToDirectory(item.path);
          } else {
            insertFilePath(item.path, false);
          }
        }
        return;
      }
      if (e.key === "Tab") {
        e.preventDefault();
        const item = fileListItems[fileIndex];
        if (item) {
          if (item.isDir) {
            navigateToDirectory(item.path);
          } else {
            insertFilePath(item.path, true);
          }
        }
        return;
      }
      if (e.key === "Escape") {
        setShowFileMenu(false);
        return;
      }
      return;
    }

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

    // Input history navigation (ArrowUp/ArrowDown)
    if (!processing && historyRef.current.length > 0) {
      if (e.key === "ArrowUp") {
        e.preventDefault();
        if (historyCursorRef.current === -1) {
          // First ArrowUp: save draft, go to newest
          draftRef.current = text;
          historyCursorRef.current = 0;
        } else {
          // Subsequent: go older (higher index)
          historyCursorRef.current = Math.min(
            historyCursorRef.current + 1,
            historyRef.current.length - 1,
          );
        }
        setText(historyRef.current[historyCursorRef.current]);
        // Move cursor to end
        requestAnimationFrame(() => {
          const ta = textareaRef.current;
          if (ta) {
            ta.focus();
            ta.setSelectionRange(ta.value.length, ta.value.length);
          }
        });
        return;
      }
      if (e.key === "ArrowDown" && historyCursorRef.current >= 0) {
        e.preventDefault();
        historyCursorRef.current--;
        if (historyCursorRef.current === -1) {
          // Past newest: restore draft
          setText(draftRef.current);
        } else {
          setText(historyRef.current[historyCursorRef.current]);
        }
        // Move cursor to end
        requestAnimationFrame(() => {
          const ta = textareaRef.current;
          if (ta) {
            ta.focus();
            ta.setSelectionRange(ta.value.length, ta.value.length);
          }
        });
        return;
      }
    }


    if (e.key === "Escape" && processing) {
      e.preventDefault();
      onAbort();
      return;
    }

    if (e.key === "Enter" && !e.shiftKey && !isComposingRef.current) {
      e.preventDefault();
      if (!processing) handleSubmit();
    }
    if (e.key === "Backspace" && !text && images.length > 0) {
      e.preventDefault();
      setImages((prev) => prev.slice(0, -1));
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setText(val);
    // Reset history cursor when user manually edits text
    historyCursorRef.current = -1;
    draftRef.current = "";

    if (val === "/") {
      setShowSlashMenu(true);
      setSlashFilter("");
      setSlashIndex(0);
      setShowFileMenu(false);
    } else if (val.startsWith("/") && !val.includes(" ")) {
      setShowSlashMenu(true);
      setSlashFilter(val);
      setSlashIndex(0);
      setShowFileMenu(false);
    } else {
      setShowSlashMenu(false);
    }

    const cursorPos = e.target.selectionStart ?? val.length;
    const textBeforeCursor = val.slice(0, cursorPos);
    const atMatch = textBeforeCursor.match(/(?:^|(?<![a-zA-Z0-9]))@("([^"]*)"?|([^\s]*))$/);

    if (atMatch && isLikelyFilePath(atMatch[2] ?? atMatch[3] ?? "")) {
      setShowFileMenu(true);
      setFileFilter(atMatch[2] ?? atMatch[3] ?? "");
    } else {
      setShowFileMenu(false);
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
            // skip
          }
        }
      }
      setImages((prev) => [...prev, ...newImages]);
    }
  }, []);

  const removeImage = useCallback((index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const removeUploadedFile = useCallback((index: number) => {
    setUploadedFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (processing) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setIsDragOver(true);
  }, [processing]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    if (processing) return;
    e.preventDefault();
    setIsDragOver(false);

    const droppedFiles = e.dataTransfer.files;
    if (droppedFiles.length === 0) return;

    const newImages: ImageAttachment[] = [];
    const newUploads: { name: string; size: number; content: string }[] = [];
    let totalSize = 0;

    for (let i = 0; i < droppedFiles.length; i++) {
      const file = droppedFiles[i];

      if (file.type.startsWith("image/")) {
        // Image: read as base64, same as paste
        try {
          const img = await fileToImageAttachment(file);
          newImages.push(img);
        } catch {
          // skip
        }
      } else {
        // Non-image: read as base64, upload to server as temp file
        if (file.size > MAX_FILE_SIZE) {
          onToast?.("warning", `File '${file.name}' exceeds 10 MB limit`);
          continue;
        }
        if (totalSize + file.size > MAX_TOTAL_SIZE) {
          onToast?.("warning", "Total file size exceeds 50 MB limit");
          continue;
        }
        try {
          const content = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
              const dataUrl = reader.result as string;
              // Strip "data:<mime>;base64," prefix, keep raw base64
              resolve(dataUrl.substring(dataUrl.indexOf(',') + 1));
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });
          newUploads.push({ name: file.name, size: file.size, content });
          totalSize += file.size;
        } catch {
          // skip
        }
      }
    }

    if (newImages.length > 0) {
      setImages((prev) => [...prev, ...newImages]);
    }
    if (newUploads.length > 0) {
      setUploadedFiles((prev) => [...prev, ...newUploads]);
    }

    requestAnimationFrame(() => {
      textareaRef.current?.focus();
    });
  }, [processing]);

  const adjustHeight = () => {
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = "auto";
      ta.style.height = Math.min(ta.scrollHeight, 200) + "px";
    }
  };

  const popoverStyle: React.CSSProperties = {
    borderRadius: "8px",
    border: "1px solid var(--color-border)",
    backgroundColor: "var(--color-surface)",
    color: "var(--color-text)",
  };

  return (
    <div
      className="px-4 py-3 relative"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      style={{
        borderTop: "1px solid var(--color-border)",
        backgroundColor: isDragOver ? "var(--color-surface-hover)" : "var(--color-surface)",
        transition: "background-color 0.2s ease",
      }}
    >
      {/* Slash command popover */}
      {showSlashMenu && filteredCommands.length > 0 && viewMode !== "dashboard" && (
        <div
          className="absolute bottom-full left-4 mb-1 w-72 overflow-hidden z-50"
          style={popoverStyle}
        >
          <div
            className="px-3 py-2 text-xs border-b"
            style={{
              color: "var(--color-text-muted)",
              borderColor: "var(--color-border)",
            }}
          >
            Commands
          </div>
          <div className="max-h-48 overflow-y-auto">
            {filteredCommands.map((cmd, i) => (
              <button
                key={cmd.name}
                className="w-full text-left px-3 py-2 text-sm transition-colors flex items-center gap-2"
                style={{
                  backgroundColor:
                    i === slashIndex ? "var(--color-surface-hover)" : "transparent",
                  color: "var(--color-text)",
                }}
                onMouseEnter={() => setSlashIndex(i)}
                onClick={() => {
                  setText(`/${cmd.name} `);
                  setShowSlashMenu(false);
                  textareaRef.current?.focus();
                }}
              >
                <span
                  className="font-mono text-xs"
                  style={{ color: "var(--color-accent)" }}
                >
                  /{cmd.name}
                </span>
                <span
                  className="text-xs truncate"
                  style={{ color: "var(--color-text-muted)" }}
                >
                  {cmd.description}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* File picker popover */}
      {showFileMenu && (
        <div
          className="absolute bottom-full left-4 mb-1 w-80 overflow-hidden z-50"
          style={popoverStyle}
        >
          <div
            className="px-3 py-2 text-xs border-b"
            style={{
              color: "var(--color-text-muted)",
              borderColor: "var(--color-border)",
            }}
          >
            Files {fileFilter ? `@${fileFilter}` : ""}
          </div>
          <div className="max-h-48 overflow-y-auto">
            {fileListItems.length > 0 ? (
              fileListItems.map((item, i) => (
                <button
                  key={item.path}
                  className="w-full text-left px-3 py-2 text-sm transition-colors flex items-center gap-2"
                  style={{
                    paddingLeft: `${12 + (item.depth ?? 0) * 14}px`,
                    backgroundColor:
                      i === fileIndex ? "var(--color-surface-hover)" : "transparent",
                    color: "var(--color-text)",
                  }}
                  onMouseEnter={() => setFileIndex(i)}
                  onClick={() => {
                    if (item.isDir) {
                      navigateToDirectory(item.path);
                    } else {
                      insertFilePath(item.path, false);
                    }
                  }}
                >
                  {item.isDir ? (
                    <Folder size={14} weight="bold" style={{ color: "var(--color-text-muted)" }} />
                  ) : (
                    <File size={14} weight="bold" style={{ color: "var(--color-text-muted)" }} />
                  )}
                  <span
                    className="font-mono text-xs truncate"
                    style={{ color: "var(--color-accent)" }}
                  >
                    {item.name}
                  </span>
                </button>
              ))
            ) : (
              <div
                className="px-3 py-2 text-sm"
                style={{ color: "var(--color-text-muted)" }}
              >
                {fileFilter ? "No matching files" : "Type to search files..."}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Uploaded file chips */}
      {uploadedFiles.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2 max-w-4xl mx-auto">
          {uploadedFiles.map((f, i) => {
            const IconComponent = getFileIconFromPath(f.name);
            return (
              <div
                key={`${f.name}-${i}`}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-sm max-w-[200px]"
                style={{
                  border: "1px solid var(--color-border)",
                  borderRadius: "8px",
                  backgroundColor: "var(--color-bg)",
                }}
              >
                <IconComponent size={14} weight="bold" style={{ color: "var(--color-text-muted)", flexShrink: 0 }} />
                <span
                  className="truncate text-xs"
                  style={{ color: "var(--color-text)" }}
                  title={f.name}
                >
                  {f.name}
                </span>
                <button
                  onClick={() => removeUploadedFile(i)}
                  className="flex-shrink-0 w-4 h-4 rounded text-xs flex items-center justify-center ml-0.5"
                  style={{ color: "var(--color-text-muted)" }}
                  title="Remove file"
                >
                  <X size={12} weight="bold" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {images.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2 max-w-4xl mx-auto">
          {images.map((img, i) => (
            <div key={i} className="relative group">
              <img
                src={`data:${img.mimeType};base64,${img.data}`}
                alt={`Pasted image ${i + 1}`}
                className="h-16 w-16 object-cover rounded"
                style={{ border: "1px solid var(--color-border)" }}
              />
              <button
                onClick={() => removeImage(i)}
                className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                style={{
                  backgroundColor: "var(--color-error-text)",
                  color: "#fff",
                }}
                title="Remove image"
              >
                &times;
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Input row */}
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
          onCompositionStart={() => { isComposingRef.current = true; }}
          onCompositionEnd={() => { isComposingRef.current = false; }}
          placeholder={
            processing
              ? "Processing... (Esc to stop)"
              : viewMode === "dashboard"
              ? "Describe how to modify the dashboard..."
              : "Type a message... (@file, Tab for multi-file, Enter to send)"
          }
          disabled={processing}
          rows={1}
          className="flex-1 resize-none text-sm min-h-[40px] max-h-[200px] px-4 py-2.5 focus:outline-none"
          style={{
            borderRadius: "12px",
            border: "1px solid var(--color-border)",
            backgroundColor: "var(--color-bg)",
            color: "var(--color-text)",
            fontFamily: "Geist Sans, system-ui, sans-serif",
          }}
        />
        {processing ? (
          <button
            onClick={onAbort}
            className="btn-danger shrink-0"
            title="Stop agent (Esc)"
          >
            Stop
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={!text.trim() && images.length === 0 && uploadedFiles.length === 0}
            className="btn-primary shrink-0"
          >
            <PaperPlaneTilt size={16} weight="bold" />
          </button>
        )}
      </div>
      <div
        className="text-xs text-center mt-1.5"
        style={{ color: "var(--color-text-muted)" }}
      >
        DSCode Web &middot;{" "}
        {processing
          ? "Press Stop or Esc to abort"
          : "Type @ for files, Tab to add more, Enter to send, Ctrl+V for images"}
      </div>
    </div>
  );
}
