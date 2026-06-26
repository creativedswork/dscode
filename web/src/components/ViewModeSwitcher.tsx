import { Chat, ChartBar } from "@phosphor-icons/react";

interface ViewModeSwitcherProps {
  viewMode: "chat" | "dashboard";
  onChange: (mode: "chat" | "dashboard") => void;
}

export function ViewModeSwitcher({ viewMode, onChange }: ViewModeSwitcherProps) {
  const Icon = viewMode === "chat" ? Chat : ChartBar;

  return (
    <div className="flex items-center gap-1.5">
      <Icon size={18} weight="bold" style={{ color: "var(--color-text)" }} />
      <select
        value={viewMode}
        onChange={(e) => onChange(e.target.value as "chat" | "dashboard")}
        className="text-sm font-medium cursor-pointer focus:outline-none"
        style={{
          backgroundColor: "var(--color-surface-hover)",
          color: "var(--color-text)",
          border: "1px solid var(--color-border)",
          borderRadius: "8px",
          padding: "4px 8px",
        }}
      >
        <option value="chat">Chat</option>
        <option value="dashboard">Dashboard</option>
      </select>
    </div>
  );
}
