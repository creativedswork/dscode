import { useEffect } from "react";
import { X } from "@phosphor-icons/react";

interface CommandPanelProps {
  text: string;
  onClose: () => void;
}

export function CommandPanel({ text, onClose }: CommandPanelProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const lines = text.split("\n");
  const title = lines[0].replace(/:$/, "");

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end p-4 pt-16" onClick={onClose}>
      <div
        className="max-w-md w-full max-h-[70vh] overflow-y-auto"
        style={{
          borderRadius: "12px",
          border: "1px solid var(--color-border)",
          backgroundColor: "var(--color-surface)",
          color: "var(--color-text)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-center justify-between px-4 py-3"
          style={{ borderBottom: "1px solid var(--color-border)" }}
        >
          <span className="text-sm font-semibold" style={{ color: "var(--color-accent)" }}>
            {title}
          </span>
          <button
            onClick={onClose}
            className="p-1 rounded-btn hover:brightness-95 transition-[filter] duration-200"
            style={{ backgroundColor: "var(--color-surface-hover)" }}
          >
            <X size={16} weight="bold" style={{ color: "var(--color-text-muted)" }} />
          </button>
        </div>
        <div className="p-4">
          <pre
            className="text-xs leading-relaxed whitespace-pre-wrap break-words"
            style={{
              fontFamily: "Geist Mono, JetBrains Mono, monospace",
              color: "var(--color-text)",
              margin: 0,
            }}
          >
            {lines.slice(1).join("\n")}
          </pre>
        </div>
        <div
          className="px-4 py-2 text-xs"
          style={{
            borderTop: "1px solid var(--color-border)",
            color: "var(--color-text-muted)",
          }}
        >
          Press <kbd style={{
            borderRadius: "4px",
            border: "1px solid var(--color-border)",
            backgroundColor: "var(--color-bg)",
            padding: "1px 5px",
            fontFamily: "Geist Mono, JetBrains Mono, monospace",
            fontSize: "0.7rem",
          }}>Esc</kbd> to close
        </div>
      </div>
    </div>
  );
}
