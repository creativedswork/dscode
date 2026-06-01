import { useState, useCallback } from "react";
import type { Toast } from "../types";
import { Info, XCircle, X } from "@phosphor-icons/react";

interface ToastContainerProps {
  toasts: Toast[];
  onRemove: (id: string) => void;
}

export function ToastContainer({ toasts, onRemove }: ToastContainerProps) {
  return (
    <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 max-w-sm">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onRemove={onRemove} />
      ))}
    </div>
  );
}

function ToastItem({ toast, onRemove }: { toast: Toast; onRemove: (id: string) => void }) {
  // Auto-remove info toasts after 3 seconds
  if (toast.type === "info" || toast.type === "warning") {
    setTimeout(() => onRemove(toast.id), 3000);
  }

  const isWarning = toast.type === "warning";
  const isError = toast.type === "error";

  return (
    <div
      className="px-4 py-3 text-sm flex items-start gap-2 animate-slide-in"
      style={{
        borderRadius: "8px",
        border: "1px solid var(--color-border)",
        backgroundColor: isError ? "var(--color-error)" : isWarning ? "var(--color-warning, #fef3c7)" : "var(--color-surface)",
        color: isError ? "var(--color-error-text)" : isWarning ? "var(--color-warning-text, #92400e)" : "var(--color-text)",
      }}
    >
      <span className="shrink-0 mt-0.5">
        {isError ? (
          <XCircle size={16} weight="bold" style={{ color: "var(--color-error-text)" }} />
        ) : (
          <Info size={16} weight="bold" style={{ color: "var(--color-accent)" }} />
        )}
      </span>
      <span className="flex-1 break-words">{toast.text}</span>
      <button
        onClick={() => onRemove(toast.id)}
        className="shrink-0 hover:opacity-70 ml-2"
        style={{ color: "var(--color-text-muted)" }}
      >
        <X size={14} weight="bold" />
      </button>
    </div>
  );
}

export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((t: Omit<Toast, "id">) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts((prev) => [...prev, { ...t, id }]);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return { toasts, addToast, removeToast };
}
