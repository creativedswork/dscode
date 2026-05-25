import { useState, useCallback } from "react";
import type { Toast } from "../types";

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
  if (toast.type === "info") {
    setTimeout(() => onRemove(toast.id), 3000);
  }

  return (
    <div
      className={`px-4 py-3 rounded-xl shadow-lg backdrop-blur-sm text-sm flex items-start gap-2 animate-slide-in ${
        toast.type === "error"
          ? "bg-red-900/90 text-white border border-red-700"
          : "bg-dscode-surface/95 text-dscode-text border border-dscode-border"
      }`}
    >
      <span className="shrink-0 mt-0.5">
        {toast.type === "error" ? "❌" : "ℹ️"}
      </span>
      <span className="flex-1 break-words">{toast.text}</span>
      <button
        onClick={() => onRemove(toast.id)}
        className="shrink-0 text-dscode-muted hover:text-white ml-2"
      >
        ×
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
