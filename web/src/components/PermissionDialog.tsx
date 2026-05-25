interface PermissionDialogProps {
  toolName: string;
  preview: string;
  onDecision: (decision: "allow" | "always_allow" | "deny") => void;
}

export function PermissionDialog({ toolName, preview, onDecision }: PermissionDialogProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-dscode-surface border border-dscode-border rounded-2xl shadow-2xl max-w-md w-full p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-yellow-900/30 flex items-center justify-center">
            <svg className="w-5 h-5 text-dscode-yellow" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m0 0v2m0-2h2m-2 0H10m9.364-6.364a9 9 0 11-12.728 0 9 9 0 0112.728 0z" />
            </svg>
          </div>
          <div>
            <h3 className="font-semibold text-white">Permission Required</h3>
            <p className="text-sm text-dscode-muted">The agent wants to run a tool</p>
          </div>
        </div>

        <div className="card mb-4">
          <div className="text-sm font-mono text-dscode-accent mb-1">{toolName}</div>
          <div className="text-xs text-dscode-muted font-mono break-all max-h-32 overflow-y-auto">
            {preview}
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => onDecision("allow")}
            className="btn-primary flex-1 text-sm"
          >
            Allow
          </button>
          <button
            onClick={() => onDecision("always_allow")}
            className="btn-secondary flex-1 text-sm"
          >
            Always Allow
          </button>
          <button
            onClick={() => onDecision("deny")}
            className="btn-danger text-sm"
          >
            Deny
          </button>
        </div>
      </div>
    </div>
  );
}
