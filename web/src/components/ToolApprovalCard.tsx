import type { AgentActivity, PermissionPrompt } from "../types";
import { formatAgentDisplayId } from "../../../src/ui/shared/agent-id.js";
import { InlinePermission, type ToolApprovalDecisionHandler } from "./InlinePermission";

interface ToolApprovalCardProps {
  permission: PermissionPrompt;
  owner: AgentActivity | null;
  onDecision: ToolApprovalDecisionHandler;
}

export function ToolApprovalCard({ permission, owner, onDecision }: ToolApprovalCardProps) {
  const label = owner?.label?.trim() || "SubAgent";

  return (
    <div
      className="tool-approval-card"
      role="status"
      aria-label={`${label} tool permission required`}
    >
      <div className="tool-approval-card-source">
        {owner ? (
          <>
            from <b>{label}</b> · <span>{formatAgentDisplayId(owner.agentId)}</span> ·{" "}
            <span>{owner.application}</span>
          </>
        ) : (
          <>
            from <b>{permission.agentId ?? "unknown"}</b> ·{" "}
            <span>{permission.toolName}</span>
          </>
        )}
      </div>
      <InlinePermission
        embedded
        toolName={permission.toolName}
        preview={permission.preview}
        fuzzyPattern={permission.fuzzyPattern}
        fuzzyArgDesc={permission.fuzzyArgDesc}
        llmSuggestions={permission.llmSuggestions}
        onDecision={onDecision}
      />
    </div>
  );
}
