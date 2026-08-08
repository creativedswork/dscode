// ── WebSocket Protocol ──
// Re-exports canonical types from the shared UI data model.
// ClientCommand and ServerEvent discriminated unions also live in shared/types.ts.

export type {
  ImageAttachment,
  ClientCommand,
  SessionInfo,
  McpServerInfo,
  McpToolInfo,
  ConfigData,
  McpAppInfo,
  ServerEvent,
  FileListItem,
  ConversationMessage,
  ToolCallEntry,
  ToolResultProjection,
  ToolResultRef,
  SkillInfo,
  ContextWindowData,
  AgentActivity,
  AgentActivityProgress,
  AgentPermissionActivity,
  AgentActivityState,
  AgentToolActivity,
  AgentToolActivityState,
  EvalDashboardServerEvent,
  EvalDashboardStage,
  EvalDashboardEvidenceSummary,
} from "../../ui/shared/types.js";
