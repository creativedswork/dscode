## 1. Logger 核心重构

- [x] 1.1 移除 `LogChannel` 类型定义和 `LogChannel` export
- [x] 1.2 `debug/info/warn/error` 签名从 `(channel, tag, message)` 改为 `(tag, message)`
- [x] 1.3 `clear()` 从 `clear(channel)` 改为 `clear()`（无参数）
- [x] 1.4 `formatLine` 移除 `channel` 参数，日志行格式改为 `[ts] [LEVEL] [type/id] [tag] msg`
- [x] 1.5 `channelPath` 改为 `filePath`，返回 `dscode.log` 的固定路径
- [x] 1.6 更新 `write` private 方法，适配新的签名和格式

## 2. Harness / Core 日志调用迁移

- [x] 2.1 `src/core/main.ts`: 6 处 lifecycle 日志去掉 `"lifecycle"` 参数（UnhandledRejection, UncaughtException, SIGINT×2, SIGTERM, FatalStartup）
- [x] 2.2 `src/core/harness.ts`: 7 处 tool 日志去掉 `"tool"` 参数（TransformContext, AfterToolCall, McpReload, AppHostShutdown, McpShutdown, AgentEvent, 及构造时的 logger 传递保持不变）
- [x] 2.3 `src/core/events.ts`: 1 处 tool 日志去掉 `"tool"` 参数（EventBus handler error）

## 3. Session 日志调用迁移

- [x] 3.1 `src/session/manager.ts`: 1 处 session 日志去掉 `"session"` 参数（Save）

## 4. Web Backend 日志调用迁移

- [x] 4.1 `src/ui/web/web-backend.ts`: 1 处 tool 日志去掉 `"tool"` 参数（promptWithImages）
- [x] 4.2 `src/ui/web/web-backend.ts`: 4 处 session 日志去掉 `"session"` 参数（pendingPermission 相关）
- [x] 4.3 `src/ui/web/web-backend.ts`: 修复 tag 不一致 — `"web-backend"` (kebab-case) 改为 `"WebBackend"` (PascalCase)，与同文件其他 4 处一致

## 5. Eval Pipeline 日志调用迁移

- [x] 5.1 `src/eval/llm.ts`: 8 处 analysis 日志去掉 `"analysis"` 参数
- [x] 5.2 `src/eval/schemas.ts`: 2 处 analysis 日志去掉 `"analysis"` 参数
- [x] 5.3 `src/eval/focus/progress.ts`: 3 处 analysis 日志去掉 `"analysis"` 参数
- [x] 5.4 `src/eval/focus/budget-guard.ts`: 2 处 analysis 日志去掉 `"analysis"` 参数
- [x] 5.5 `src/eval/focus/index.ts`: 8 处 analysis 日志去掉 `"analysis"` 参数
- [x] 5.6 `src/eval/rules/extraction.ts`: ~10 处 analysis 日志去掉 `"analysis"` 参数
- [x] 5.7 `src/eval/rules/store.ts`: 6 处 analysis 日志去掉 `"analysis"` 参数

## 6. Dead Import 清理

- [x] 6.1 `src/drivers/vision/pipeline.ts`: 删除 `import { Logger } from "../../utils/logger.js"` 和 `_plog` 变量
- [x] 6.2 `src/drivers/vision/cache.ts`: 删除 `import { Logger } from "../../utils/logger.js"`
- [x] 6.3 `src/drivers/vision/client.ts`: 删除 `import { Logger } from "../../utils/logger.js"`
- [x] 6.4 `src/drivers/edit/tool.ts`: 删除 `import { Logger } from "../../utils/logger.js"`

## 7. Type 清理

- [x] 7.1 检查所有 `import type { Logger }` 和 `import { Logger }` —— 确保无残留对 `LogChannel` 的引用
- [x] 7.2 `src/core/harness-api.ts`: 确认 `Logger` type import 不变（仅 import Logger 类型，不受 API 变更影响）

## 8. Spec 更新

- [x] 8.1 用本 change 的 `specs/logging-system/spec.md` 覆盖 `openspec/specs/logging-system/spec.md`
- [x] 8.2 更新 `openspec/specs/chiff-progress-display/spec.md`：所有 `logger.info("analysis", ...)` 改为 `logger.info(...)`
- [x] 8.4 确认 `logging-system` spec 新增的 `Tag Naming Convention` requirement 已覆盖到 `openspec/specs/logging-system/spec.md`
- [x] 8.3 更新 `openspec/specs/eval-progress-feedback/spec.md`：所有 `logger.error("analysis", ...)` 改为 `logger.error(...)`

## 9. AGENTS.md 更新
- [x] 9.1 更新「日志排查」章节：文件名从 `<channel>.log` 改为 `dscode.log`，去掉 channel 概念，添加 tag 命名规范（PascalCase 常量，禁止 kebab-case / snake_case / 动态变量）

## 10. 验证

- [x] 10.1 `npm run typecheck` 通过
- [-] 10.2 启动应用，确认 `~/.dscode/logs/dscode.log` 创建且有日志写入
- [-] 10.3 旧的 `~/.dscode/logs/{lifecycle,session,tool,analysis}.log` 不再有新内容
- [-] 10.4 触发 `/eval` 命令，确认 analysis 日志写入 `dscode.log`
- [-] 10.5 触发 SIGINT，确认 lifecycle 日志写入 `dscode.log`
- [-] 10.6 `grep '\[EventBus\]' ~/.dscode/logs/dscode.log` 可正常过滤
