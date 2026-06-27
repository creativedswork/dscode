## Why

TUI 用户每次推理结束后看不到 token 消耗和成本，无法判断单轮开销，也无法感知上下文窗口剩余容量。`turn:end` 事件已经携带完整 `Usage` 数据，`finishAssistantMessage()` 也已追加 `⏱ total wait`，只需在同一行追加 token/cost 和上下文占比即可零成本实现。

## What Changes

- 扩展 `turn:end` 事件的 `usage` 字段，从 `{inputTokens, outputTokens}` 升级为完整 Usage（含 cacheRead, cacheWrite, total, cost.total）
- TUI `finishAssistantMessage()` 在 `⏱ total wait` 同行追加 `📊 12.4k↓ 3.2k↑ · ▓▓ 77% · 💰 $0.0012`
- token 格式化：≥1000 用 `k`，≥1M 用 `M`；cost < $0.01 用美分 `¢`
- 上下文占比通过 `ContextManager.getEstimatedTokens()` / `getContextWindow()` 计算，无需改事件层
- 百分比 ≥80% 黄色告警，≥95% 红色告警

## Capabilities

### New Capabilities

- `tui-token-stats`: TUI 推理结束后显示 token 消耗、API 成本统计、上下文窗口占用百分比

### Modified Capabilities

- `harness-event-bus`: `turn:end` 的 `usage` 字段从简化结构升级为包含 cache 和 cost 的完整结构

## Impact

- `src/core/events.ts` — `HarnessEvent` 联合类型中 `turn:end` 的 usage 字段扩展
- `src/core/harness.ts` — 映射 `AssistantMessage.usage` 到事件 payload
- `src/ui/tui-backend.ts` — 订阅 handler 传递 usage 到 `finishAssistantMessage()`
- `src/ui/tui-app.ts` — `finishAssistantMessage()` 签名和实现（新增上下文占比计算和颜色告警）
- `src/ui/conversation.ts` — 无改动（通过 `addInfo` 追加 dim 行）
- `src/context/manager.ts` — 无改动（复用现有 `getEstimatedTokens()` / `getContextWindow()`）
