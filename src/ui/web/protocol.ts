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
  ContextWindowData,
} from "../../ui/shared/types.js";
