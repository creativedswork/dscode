// ── Re-exports from shared UI data model ──
// All canonical types now live in src/ui/shared/types.ts.
// Imported via Vite alias: @dscode/shared → ../src/ui/shared/

export type {
  ImageAttachment,
  FileAttachment,
  ClientCommand,
  SessionInfo,
  McpServerInfo,
  McpToolInfo,
  ConfigData,
  ConversationMessage,
  McpAppInfo,
  ToolCallEntry,
  ContextWindowData,
  ServerEvent,
  FileListItem,
  SkillInfo,
  UIMessage,
  PermissionPrompt,
  PermOption,
  AgentActivity,
  AgentActivityProgress,
  AgentActivityState,
  EvalDashboardServerEvent,
  EvalDashboardStage,
  EvalDashboardEvidenceSummary,
} from "@dscode/shared/types";


// ── Web-specific local types ──

export type ViewMode = "chat" | "session_dashboard" | "eval_dashboard";

export interface Toast {
  id: string;
  type: "info" | "warning" | "error";
  text: string;
}
