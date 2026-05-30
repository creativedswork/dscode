import { useState, useRef, useCallback } from "react";

export interface UseResizablePanelOptions {
  minWidth?: number;
  maxWidth?: number;
  defaultWidth?: number;
  storageKey: string;
  enabled?: boolean;
}

export interface UseResizablePanelResult {
  width: number;
  panelRef: React.RefObject<HTMLElement>;
  handleProps: {
    onPointerDown: (e: React.PointerEvent) => void;
    role: "separator";
    "aria-orientation": "vertical";
  };
}

function loadWidth(key: string, fallback: number): number {
  try {
    const raw = localStorage.getItem(key);
    if (raw !== null) {
      const parsed = parseInt(raw, 10);
      if (!isNaN(parsed) && parsed > 0) return parsed;
    }
  } catch {
    // localStorage unavailable (private browsing, etc.)
  }
  return fallback;
}

export function useResizablePanel({
  minWidth = 200,
  maxWidth = 500,
  defaultWidth = 320,
  storageKey,
  enabled = true,
}: UseResizablePanelOptions): UseResizablePanelResult {
  const [width, setWidth] = useState<number>(() =>
    loadWidth(storageKey, defaultWidth)
  );
  const panelRef = useRef<HTMLElement>(null!);
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const savedBodyCursor = useRef<string>("");
  const savedBodyUserSelect = useRef<string>("");

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!enabled) return;

      e.preventDefault();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);

      dragRef.current = {
        startX: e.clientX,
        startWidth: width,
      };

      savedBodyCursor.current = document.body.style.cursor;
      savedBodyUserSelect.current = document.body.style.userSelect;
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";

      const handleMove = (ev: PointerEvent) => {
        if (!dragRef.current) return;
        const delta = ev.clientX - dragRef.current.startX;
        const next = Math.min(
          maxWidth,
          Math.max(minWidth, dragRef.current.startWidth + delta)
        );
        setWidth(next);
      };

      const handleUp = () => {
        dragRef.current = null;
        document.removeEventListener("pointermove", handleMove);
        document.removeEventListener("pointerup", handleUp);
        document.body.style.cursor = savedBodyCursor.current;
        document.body.style.userSelect = savedBodyUserSelect.current;
        try {
          localStorage.setItem(storageKey, String(width));
        } catch {
          // silent
        }
      };

      document.addEventListener("pointermove", handleMove);
      document.addEventListener("pointerup", handleUp);
    },
    [enabled, width, minWidth, maxWidth, storageKey]
  );

  return {
    width,
    panelRef,
    handleProps: {
      onPointerDown: handlePointerDown,
      role: "separator",
      "aria-orientation": "vertical" as const,
    },
  };
}
