import type { ViewMode } from "../types";

export function viewModeAfterSessionChange(
  viewMode: ViewMode,
  previousSessionId: string | null,
  currentSessionId: string | null,
): ViewMode {
  if (previousSessionId === null || previousSessionId === currentSessionId) {
    return viewMode;
  }
  return viewMode === "session_dashboard" ? "chat" : viewMode;
}

export function viewModeForMessageCount(
  viewMode: ViewMode,
  messageCount: number,
): ViewMode {
  return messageCount === 0 && viewMode === "session_dashboard"
    ? "chat"
    : viewMode;
}

export function shouldRenderMessageInput(viewMode: ViewMode): boolean {
  return viewMode !== "eval_dashboard";
}

export function evalCommandForSelection(
  status: "starting" | "running" | "completed" | "failed" | null,
): { type: "slash"; command: "/eval" } | null {
  return status === "starting" || status === "running"
    ? null
    : { type: "slash", command: "/eval" };
}
