## Why

当前日志系统将日志写入 4 个独立文件（`lifecycle.log`, `session.log`, `tool.log`, `analysis.log`），按 `LogChannel` 分类路由。这套设计带来三个实际问题：

1. **Timeline 碎片化** — 按时间顺序发生的事件被分散到多个文件中，排查问题时需要 `cat *.log | sort` 人工重建时间线
2. **Channel 边界模糊** — 同一模块（如 `web-backend.ts`）的不同日志调用被迫分属不同 channel（`promptWithImages` → `tool`, permission → `session`），分类在排查时总是"选错文件"
3. **维护成本不小** — 每个 `logger.info("channel", tag, msg)` 调用都需要预判 channel，`LogChannel` 类型需要维护，AGENTS.md 需要文档化，新增日志时选择困难

而 4 个文件合起来仅 ~1500 行 — 一个终端页面就能看完的量。`tag`（如 `EventBus`、`SIGINT`、`Save`、`FocusPipeline`）已经提供了足够的过滤粒度，channel 是冗余的分类维度。

## What Changes

- 移除 `LogChannel` 类型和 channel 概念，所有日志写入单一文件 `~/.dscode/logs/dscode.log`
- `Logger` API 从 `logger.info(channel, tag, msg)` 简化为 `logger.info(tag, msg)`
- `clear()` 从 `clear(channel)` 简化为 `clear()`
- 日志行格式从 `[ts] [LEVEL] [channel] [type/id] [tag] msg` 改为 `[ts] [LEVEL] [type/id] [tag] msg`
- 更新所有 ~35 处调用点（移除第一个 string 参数）
- 更新 `logging-system`、`chiff-progress-display`、`eval-progress-feedback` 三个 spec
- 更新 AGENTS.md 中的日志排查指南

## Capabilities

### Modified Capabilities
- `logging-system`: Channel 概念移除，单一文件输出
- `chiff-progress-display`: `logger.info("analysis", ...)` → `logger.info(...)`
- `eval-progress-feedback`: `logger.error("analysis", ...)` → `logger.error(...)`

## Impact

- **`src/utils/logger.ts`**: ~30 行变更（移除 LogChannel 类型、合并 channelPath、简化 clear、formatLine 去 channel 字段）
- **`src/core/main.ts`**: 6 处 lifeycle 日志调用去 channel 参数
- **`src/core/harness.ts`**: 7 处 tool 日志调用去 channel 参数
- **`src/core/events.ts`**: 1 处 tool 日志调用去 channel 参数
- **`src/session/manager.ts`**: 1 处 session 日志调用去 channel 参数
- **`src/ui/web/web-backend.ts`**: 5 处 tool/session 日志调用去 channel 参数
- **`src/eval/`**: ~20 处 analysis 日志调用去 channel 参数（llm.ts, schemas.ts, focus/, rules/）
- **`src/drivers/vision/pipeline.ts`**: 清理 dead import（Logger 导入了但未使用）
- **`src/drivers/vision/cache.ts`**: 清理 dead import
- **`src/drivers/vision/client.ts`**: 清理 dead import
- **`src/drivers/edit/tool.ts`**: 清理 dead import
- **`openspec/specs/logging-system/spec.md`**: 更新 requirements
- **`openspec/specs/chiff-progress-display/spec.md`**: 更新 logger 调用示例
- **`openspec/specs/eval-progress-feedback/spec.md`**: 更新 logger 调用示例
- **AGENTS.md**: 更新日志排查章节
