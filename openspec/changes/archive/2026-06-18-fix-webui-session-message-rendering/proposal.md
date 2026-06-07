## Why

Web UI 在 session load 时，将 MCP 工具调用消息渲染为"空气泡"（有边框和背景但无任何内容的空白气泡）。根因在 `rebuildDisplayMessages()` 未能从 pi-ai `AssistantMessage.content` 数组中提取 `toolCall` 和 `thinking` 块，导致重建出的 `DisplayMessage` 的 `tools` / `thinking` 字段始终为空。TUI 不受影响是因为它的 `replayMessages` 直接遍历 content 块。

## What Changes

- `rebuildDisplayMessages()` 对 `AssistantMessage` 的 content 数组做完整内容块提取：`toolCall` → `tools`（`ToolCallEntry[]`），`thinking` → `thinking`（string）
- 匹配 `ToolResultMessage` 将 `result` / `isError` 填入对应 tool call，并过滤掉独立的 `ToolResultMessage`（避免在消息列表中重复出现原始工具结果消息）
- Web frontend 现有渲染逻辑无需修改 —— `MessageBubble` 已经正确处理 `tools` 和 `thinking` 字段，`empty-assistant-content` spec 已覆盖"有 tools 无 content"的渲染行为

## Capabilities

### New Capabilities
- `display-message-reconstruction`: 会话加载时从 pi-ai 原始消息格式重建 DisplayMessage 的完整性约定，包括 tool call 提取、thinking 合并、及 ToolResultMessage 结果匹配

### Modified Capabilities
_（无已有 spec 需求变更）_

## Impact

- `src/session/display.ts` — `rebuildDisplayMessages()` 核心修改
- `src/ui/web/web-backend.ts` — `buildConversationHistory()` 无需修改（已直接调用 `rebuildDisplayMessages`）
- `src/ui/tui-app.ts` / `src/ui/conversation.ts` — 不受影响（TUI 已有独立的消息重放逻辑）
- `web/src/components/ChatView.tsx` — 无需修改
- `src/ui/shared/reducer.ts` — 无需修改
