import { Warning } from "@phosphor-icons/react";

interface PermissionDialogProps {
  toolName: string;
  preview: string;
  onDecision: (decision: "allow" | "always_allow" | "deny") => void;
}

export function PermissionDialog({ toolName, preview, onDecision }: PermissionDialogProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.4)" }}>
      <div
        className="max-w-md w-full p-6"
        style={{
          borderRadius: "12px",
          border: "1px solid var(--color-border)",
          backgroundColor: "var(--color-surface)",
        }}
      >
        <div className="flex items-center gap-3 mb-4">
          <div
            className="w-10 h-10 rounded flex items-center justify-center"
            style={{ backgroundColor: "var(--color-warning)" }}
          >
            <Warning size={20} weight="bold" style={{ color: "var(--color-warning-text)" }} />
          </div>
          <div>
            <h3 className="font-semibold" style={{ color: "var(--color-text)" }}>
              Permission Required
            </h3>
            <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
              The agent wants to run a tool
            </p>
          </div>
        </div>

        <div className="card mb-4">
          <div
            className="text-sm font-mono mb-1"
            style={{ color: "var(--color-accent)" }}
          >
            {toolName}
          </div>
          <div
            className="text-xs font-mono break-all max-h-32 overflow-y-auto"
            style={{ color: "var(--color-text-muted)" }}
          >
            {preview}
          </div>
        </div>

        <div className="flex gap-2">
          <button onClick={() => onDecision("allow")} className="btn-primary flex-1 text-sm">
            Allow
          </button>
          <button onClick={() => onDecision("always_allow")} className="btn-secondary flex-1 text-sm">
            Always Allow
          </button>
          <button onClick={() => onDecision("deny")} className="btn-danger text-sm">
            Deny
          </button>
        </div>
      </div>
    </div>
  );
}
