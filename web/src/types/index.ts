// ── Re-exports from shared UI data model ──
// All canonical types now live in src/ui/shared/types.ts.
// Imported via Vite alias: @dscode/shared → ../src/ui/shared/

export type {
  ImageAttachment,
  ClientCommand,
  SessionInfo,
  McpServerInfo,
  McpToolInfo,
  ConfigData,
  ConversationMessage,
  McpAppInfo,
  ToolCallEntry,
  ServerEvent,
  FileListItem,
  UIMessage,
  PermissionPrompt,
  PermOption,
} from "@dscode/shared/types";


// ── Web-specific local types ──

export interface Toast {
  id: string;
  type: "info" | "error";
  text: string;
}
