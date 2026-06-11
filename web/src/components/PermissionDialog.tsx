import { Warning } from "@phosphor-icons/react";
import { useState } from "react";

interface PermissionDialogProps {
  toolName: string;
  preview: string;
  fuzzyPattern?: string | null;
  fuzzyArgDesc?: string | null;
  llmSuggestions?: { label: string; toolPattern: string | null; argPattern: string | null }[];
  onDecision: (decision: "allow" | "always_allow" | "always_allow_save" | "explain" | "deny", explainText?: string, toolNamePattern?: string, fuzzyMode?: number) => void;
}

export function PermissionDialog({ toolName, preview, fuzzyPattern, fuzzyArgDesc, llmSuggestions, onDecision }: PermissionDialogProps) {
  const [showFuzzyOptions, setShowFuzzyOptions] = useState(false);
  const [subModeType, setSubModeType] = useState<"save" | "session" | "allow">("save");

  const handleFuzzySelect = (mode: number) => {
    setShowFuzzyOptions(false);
    if (subModeType === "session" || subModeType === "allow") {
      if (mode === 0) {
        onDecision(subModeType === "allow" ? "allow" : "always_allow");
      } else {
        onDecision(subModeType === "allow" ? "allow" : "always_allow", undefined, fuzzyPattern ?? undefined, mode);
      }
    } else {
      // For LLM suggestions (mode >= 3), pass the suggestion data as toolNamePattern
      let pattern: string | undefined;
      if (mode >= 3 && llmSuggestions) {
        const s = llmSuggestions[mode - 3];
        pattern = s ? JSON.stringify({ toolPattern: s.toolPattern, argPattern: s.argPattern }) : undefined;
      } else if (mode === 1) {
        pattern = fuzzyPattern ?? undefined;
      }
      onDecision("always_allow_save", undefined, pattern, mode);
    }
  };

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
          <div className="text-sm font-mono mb-1" style={{ color: "var(--color-accent)" }}>{toolName}</div>
          <div className="text-xs font-mono break-all max-h-32 overflow-y-auto" style={{ color: "var(--color-text-muted)" }}>{preview}</div>
        </div>

        {showFuzzyOptions ? (
          <div className="flex gap-2 flex-wrap">
            {subModeType === "session" || subModeType === "allow" ? (
              <>
                <button onClick={() => handleFuzzySelect(0)} className="btn-secondary flex-1 text-sm">Exact: {toolName}</button>
                <button onClick={() => handleFuzzySelect(1)} className="btn-secondary flex-1 text-sm">Fuzzy: {fuzzyPattern}</button>
              </>
            ) : (
              <>
                <button onClick={() => handleFuzzySelect(0)} className="btn-secondary flex-1 text-sm">
                  Exact: {toolName}{!toolName.startsWith("mcp__") ? " (this call)" : ""}
                </button>
                <button onClick={() => handleFuzzySelect(1)} className="btn-secondary flex-1 text-sm">
                  {toolName.startsWith("mcp__") ? fuzzyPattern : "All calls"}
                </button>
                {fuzzyArgDesc && (
                  <button onClick={() => handleFuzzySelect(2)} className="btn-secondary flex-1 text-sm">{fuzzyArgDesc}</button>
                )}
                {llmSuggestions && llmSuggestions.map((s, i) => (
                  <button key={i} onClick={() => handleFuzzySelect(3 + i)} className="btn-secondary flex-1 text-sm">[AI] {s.label}</button>
                ))}
              </>
            )}
            <button onClick={() => setShowFuzzyOptions(false)} className="btn text-sm" style={{ backgroundColor: "var(--color-surface-hover)" }}>Cancel</button>
          </div>
        ) : (
          <div className="flex gap-2 flex-wrap">
            {(fuzzyPattern && fuzzyPattern !== toolName) ? (
              <button onClick={() => { setSubModeType("allow"); setShowFuzzyOptions(true); }} className="btn-primary flex-1 text-sm">Allow ▸</button>
            ) : (
              <button onClick={() => onDecision("allow")} className="btn-primary flex-1 text-sm">Allow</button>
            )}
            {(fuzzyPattern && fuzzyPattern !== toolName) ? (
              <button onClick={() => { setSubModeType("session"); setShowFuzzyOptions(true); }} className="btn-secondary flex-1 text-sm">Always Allow ▸</button>
            ) : (
              <button onClick={() => onDecision("always_allow")} className="btn-secondary flex-1 text-sm">Always Allow</button>
            )}
            <button onClick={() => { setSubModeType("save"); setShowFuzzyOptions(true); }} className="btn-secondary text-sm">Save to Settings ▸</button>
            <button onClick={() => onDecision("explain")} className="btn text-sm" style={{ backgroundColor: "var(--color-warning)", color: "var(--color-warning-text)", borderColor: "var(--color-warning-text)" }}>Input Idea</button>
            <button onClick={() => onDecision("deny")} className="btn-danger text-sm">Deny</button>
          </div>
        )}
      </div>
    </div>
  );
}
