## Context

`rebuildDisplayMessages()` (`src/session/display.ts`) 负责将 `agent.state.messages`（pi-ai 原始格式）转换为 `DisplayMessage[]` 供前端渲染。pi-ai 的 `AssistantMessage` 将 thinking、text、toolCall 统一存储在 `content: (TextContent | ThinkingContent | ToolCall)[]` 数组中，没有独立的 `thinking` / `tools` 字段。当前实现只提取 `type === "text"` 的块，导致含有 tool call 的 assistant 消息在 session load 时渲染为空泡。

`ToolResultMessage`（`role: "toolResult"`）是独立消息，通过 `toolCallId` 与 `AssistantMessage` 中的 `ToolCall.id` 关联。当前实现直接将 `ToolResultMessage` 作为独立 DisplayMessage 输出，既重复又无法与对应的 tool call 卡片关联。

TUI 不受影响，因为 `ConversationView.replayMessages()` 直接遍历 content 数组逐个渲染每个块类型。

## Goals / Non-Goals

**Goals:**
- `rebuildDisplayMessages()` 从 `AssistantMessage.content` 中提取 `ToolCall` 块，填充 `DisplayMessage.tools`
- `rebuildDisplayMessages()` 从 `AssistantMessage.content` 中提取 `ThinkingContent` 块，合并为 `DisplayMessage.thinking`
- `ToolResultMessage` 的结果（`result` / `isError`）匹配到对应 `AssistantMessage` 的 tool call 条目上
- 独立的 `ToolResultMessage` 不再作为 DisplayMessage 输出（避免列表中出现无上下文的孤立工具结果消息）
- 不影响 `UserMessage`、纯文本 `AssistantMessage`、vision 消息等现有路径

**Non-Goals:**
- 不修改前端渲染逻辑（`ChatView.MessageBubble`、`ToolCard`、`Markdown`）
- 不修改 `conversationReducer` 或 `ServerEvent` 协议
- 不调整 TUI 的消息重放逻辑
- 不改变 session 存储格式

## Decisions

### Decision 1: 顺序扫描 + 前向匹配 ToolResultMessage

将 `messages.map()` 改为两阶段处理：
1. **Pass 1**: 顺序扫描，为每条 `AssistantMessage` 提取 tool calls，然后向前查找紧邻的 `ToolResultMessage`（直到遇到下一个 user/assistant 消息）进行 `toolCallId` 匹配
2. **Pass 2**: 过滤掉已被匹配的 `ToolResultMessage`，输出最终 `DisplayMessage[]`

**方案选择**: 顺序扫描优于先建索引再匹配，因为消息顺序天然保证 tool call 和 tool result 相邻，无需额外数据结构。复杂度 O(n)，内存开销可忽略。

### Decision 2: ToolCall.args 序列化为截断字符串

`ToolCall.arguments` 是 `Record<string, any>`，需转为 `ToolCallEntry.args: string`。采用 `JSON.stringify(args).slice(0, 80)` 与 TUI `toolArgsPreview` 一致。

### Decision 3: thinking 用换行拼接

多个 `ThinkingContent` 块可能出现在同一个 AssistantMessage 中（虽然罕见）。用 `"\n\n"` 拼接保持可读性。

### Decision 4: 保留 `system` 角色逻辑不变

现有代码对 `m.role === "system"` 的特殊处理（即使空内容也保留）不改变。该分支仅用于 pi-ai 之外可能注入的系统消息。

### Decision 5: 不改变 `DisplayMessage` 类型

`DisplayMessage.tools` 类型已定义为 `{ name: string; args: string; result: string; isError: boolean }[]`，与 `ToolCallEntry` 兼容，无需修改。

## Risks / Trade-offs

- **[Risk] ToolResultMessage 匹配失败（toolCallId 不匹配）**: → 降级处理：未匹配的 ToolResultMessage 保留为独立 DisplayMessage（维持现有行为），未匹配 result 的 tool call 保持 `result: ""`
- **[Risk] 非标准消息格式（旧 session、第三方 provider）**: → 所有内容块提取均做 defensive check（`b.type` 检查、字段存在性检查），不匹配的块类型被忽略而非抛错
- **[Trade-off] 顺序扫描依赖消息顺序正确**: pi-ai 保证 tool call 和 result 消息交错且有序，这是合理的假设；若未来有 out-of-order delivery 则需引入索引方案
