import { ChartBar, Chat, Pulse } from "@phosphor-icons/react";
import type { ViewMode } from "../types";

interface ViewModeSelectorProps {
  viewMode: ViewMode;
  sessionDashboardAvailable: boolean;
  evalReportAvailable: boolean;
  onChange: (mode: ViewMode) => void;
}

const buttonStyle = (active: boolean) => ({
  padding: "3px 8px",
  borderRadius: "6px",
  color: active ? "var(--color-text)" : "var(--color-text-muted)",
  backgroundColor: active ? "var(--color-surface)" : "transparent",
});

export function ViewModeSelector({
  viewMode,
  sessionDashboardAvailable,
  evalReportAvailable,
  onChange,
}: ViewModeSelectorProps) {
  const sessionDashboardDisabled =
    !sessionDashboardAvailable || viewMode === "eval_dashboard";
  return (
    <div
      className="flex items-center shrink-0"
      style={{
        borderRadius: "8px",
        backgroundColor: "var(--color-surface-hover)",
        padding: "2px",
      }}
      aria-label="View mode"
    >
      <button
        aria-label="Chat"
        title="Chat"
        onClick={() => onChange("chat")}
        className="flex items-center gap-1 text-xs font-medium transition-colors"
        style={buttonStyle(viewMode === "chat")}
      >
        <Chat size={12} weight="bold" />
        <span className="hidden sm:inline">Chat</span>
      </button>
      <button
        aria-label="Session Dashboard"
        title={viewMode === "eval_dashboard"
          ? "Return to Chat before opening Session Dashboard"
          : "Session Dashboard"}
        disabled={sessionDashboardDisabled}
        onClick={() => onChange("session_dashboard")}
        className="flex items-center gap-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40"
        style={buttonStyle(viewMode === "session_dashboard")}
      >
        <ChartBar size={12} weight="bold" />
        <span className="hidden sm:inline">Dashboard</span>
      </button>
      <button
        aria-label="Eval Dashboard"
        title="Eval Dashboard"
        onClick={() => onChange("eval_dashboard")}
        className="relative flex items-center gap-1 text-xs font-medium transition-colors"
        style={buttonStyle(viewMode === "eval_dashboard")}
      >
        <Pulse size={12} weight="bold" />
        <span className="hidden sm:inline">Eval</span>
        {evalReportAvailable && (
          <span
            className="absolute w-1 h-1 rounded-full"
            style={{
              top: "3px",
              right: "3px",
              backgroundColor: "var(--color-accent)",
            }}
          />
        )}
      </button>
    </div>
  );
}
