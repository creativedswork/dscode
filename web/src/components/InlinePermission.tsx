import { useState } from "react";
import { Warning } from "@phosphor-icons/react";

export type ToolApprovalDecision =
  | "allow"
  | "always_allow"
  | "always_allow_save"
  | "deny";

export type ToolApprovalDecisionHandler = (
  decision: ToolApprovalDecision,
  explainText?: string,
  toolNamePattern?: string,
  fuzzyMode?: number,
) => void;

export interface InlinePermissionProps {
  toolName: string;
  preview: string;
  fuzzyPattern?: string | null;
  fuzzyArgDesc?: string | null;
  llmSuggestions?: { label: string; toolPattern: string | null; argPattern: string | null }[];
  embedded?: boolean;
  onDecision: ToolApprovalDecisionHandler;
}

export function InlinePermission({
  toolName,
  preview,
  fuzzyPattern,
  fuzzyArgDesc,
  llmSuggestions,
  embedded = false,
  onDecision,
}: InlinePermissionProps) {
  const [explainMode, setExplainMode] = useState(false);
  const [explainText, setExplainText] = useState("");
  const [showFuzzyOptions, setShowFuzzyOptions] = useState(false);
  const [subModeType, setSubModeType] = useState<"save" | "session" | "allow">("save");
  const handleFuzzySelect = (mode: number) => {
    setShowFuzzyOptions(false);
    if (subModeType === "session" || subModeType === "allow") {
      if (mode === 0) {
        onDecision("always_allow");
      } else {
        onDecision("always_allow", undefined, fuzzyPattern ?? undefined, mode);
      }
    } else {
      onDecision("always_allow_save", undefined, mode === 1 ? fuzzyPattern ?? undefined : undefined, mode);
    }
  };

  const handleSubmitExplain = () => {
    if (explainText.trim()) {
      onDecision("deny", explainText.trim());
      setExplainText("");
      setExplainMode(false);
    }
  };

  return (
    <div className={embedded ? "agent-activity-permission" : "flex justify-start animate-fade-up"}>
      <div
        className={embedded
          ? "agent-activity-permission-panel"
          : "max-w-[85%] md:max-w-[75%] px-4 py-3"}
        data-collider={embedded ? undefined : "message-card"}
        style={{
          borderRadius: "12px",
          border: "1px solid var(--color-border)",
          backgroundColor: "var(--color-warning)",
        }}
      >
        <div className="flex items-center gap-2 mb-2">
          <Warning size={16} weight="bold" style={{ color: "var(--color-warning-text)" }} />
          <span className="text-sm font-medium" style={{ color: "var(--color-warning-text)" }}>Permission Required</span>
        </div>
        <div className="mb-2 text-xs font-mono" style={{ color: "var(--color-accent)" }}>{toolName}</div>
        <div
          className="mb-3 text-xs font-mono break-all max-h-24 overflow-y-auto rounded p-2"
          style={{ backgroundColor: "var(--color-bg)", color: "var(--color-text-muted)" }}
        >
          {preview}
        </div>
        {explainMode ? (
          <div className="space-y-2">
            <textarea
              value={explainText}
              onChange={(e) => setExplainText(e.target.value)}
              placeholder="Explain what you want the agent to do instead..."
              className="w-full text-xs p-2 resize-none focus:outline-none"
              style={{ borderRadius: "8px", backgroundColor: "var(--color-bg)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}
              rows={3}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmitExplain(); }
                if (e.key === "Escape") { setExplainText(""); setExplainMode(false); }
              }}
            />
            <div className="flex gap-2">
              <button onClick={handleSubmitExplain} disabled={!explainText.trim()} className="btn-primary text-xs">Submit</button>
              <button onClick={() => { setExplainText(""); setExplainMode(false); }} className="btn-secondary text-xs">Cancel</button>
            </div>
          </div>
        ) : showFuzzyOptions ? (
          <div className="flex gap-2 flex-wrap">
            {subModeType === "session" ? (
              <>
                <button onClick={() => handleFuzzySelect(0)} className="btn-secondary text-xs">
                  Exact: {toolName}
                </button>
                <button onClick={() => handleFuzzySelect(1)} className="btn-secondary text-xs">
                  Fuzzy: {fuzzyPattern}
                </button>
              </>
            ) : (
              <>
                <button onClick={() => handleFuzzySelect(0)} className="btn-secondary text-xs">
                  Exact: {toolName}{!toolName.startsWith("mcp__") ? " (this call)" : ""}
                </button>
                <button onClick={() => handleFuzzySelect(1)} className="btn-secondary text-xs">
                  {toolName.startsWith("mcp__") ? fuzzyPattern : "All calls"}
                </button>
                {fuzzyArgDesc && (
                  <button onClick={() => handleFuzzySelect(2)} className="btn-secondary text-xs">
                    {fuzzyArgDesc}
                  </button>
                )}
                {llmSuggestions && llmSuggestions.map((s, i) => (
                  <button key={i} onClick={() => handleFuzzySelect(3 + i)} className="btn-secondary text-xs">
                    [AI] {s.label}
                  </button>
                ))}
              </>
            )}
            <button onClick={() => setShowFuzzyOptions(false)} className="btn text-xs" style={{ backgroundColor: "var(--color-surface-hover)" }}>
              Cancel
            </button>
          </div>
        ) : (
          <div className="flex gap-2 flex-wrap">
            {(fuzzyPattern && fuzzyPattern !== toolName) ? (
              <button onClick={() => { setSubModeType("allow"); setShowFuzzyOptions(true); }} className="btn-primary text-xs">
                Allow ▸
              </button>
            ) : (
              <button onClick={() => onDecision("allow")} className="btn-primary text-xs">Allow</button>
            )}
            {(fuzzyPattern && fuzzyPattern !== toolName) ? (
              <button onClick={() => { setSubModeType("session"); setShowFuzzyOptions(true); }} className="btn-secondary text-xs">
                Always Allow ▸
              </button>
            ) : (
              <button onClick={() => onDecision("always_allow")} className="btn-secondary text-xs">Always Allow</button>
            )}
            <button onClick={() => { setSubModeType("save"); setShowFuzzyOptions(true); }} className="btn-secondary text-xs">
              Save to Settings ▸
            </button>
            <button
              onClick={() => setExplainMode(true)}
              className="btn text-xs"
              style={{ backgroundColor: "var(--color-warning)", color: "var(--color-warning-text)", borderColor: "var(--color-warning-text)" }}
            >
              Explain
            </button>
            <button onClick={() => onDecision("deny")} className="btn-danger text-xs">Deny</button>
          </div>
        )}
      </div>
    </div>
  );
}
