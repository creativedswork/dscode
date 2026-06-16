## Why

当前项目日志散落在各处 `console.log/warn/error` 调用中，部分输出到终端污染 TUI 体验，部分写入 `~/.dscode/logs/eval.log` 但仅覆盖 eval 模块。缺乏统一的日志基础设施，每个模块各自决定输出方式。同时 sub-agent 架构即将引入，需要一套按 Agent 实例组织的日志系统，让每个 Agent 的各类日志可独立追踪。

## What Changes

- 新增 `src/utils/logger.ts`：`Logger` 类，每个 Agent 实例创建一个实例
- 四个 channel：`lifecycle`、`session`、`tool`、`analysis`，按语义分类路由
- 四个 level：`debug`、`info`、`warn`、`error`，可按 level 过滤
- 所有日志只写文件（`~/.dscode/logs/<channel>.log`），终端零输出
- 每行日志携带 `[timestamp] [LEVEL] [channel] [agent_type/agent_id] [tag] message`
- 替换全部现有 `console.*` 日志调用
- 删除 `eval/logger.ts`，eval pipeline 使用 `Logger` 写 `analysis` channel
- 删除 `ProgressDisplay` 的 ANSI 终端渲染（`process.stdout.write` 和 `console.log`），进度改走 logger
- eval 命令的 `onLog` 回调不再调用 `console.error`

## Capabilities

### New Capabilities
- `logging-system`: 结构化、channel-based、per-Agent 的文件日志系统

### Modified Capabilities
- `eval-progress-feedback`: `onLog` 回调不再输出到终端 stderr，仅推送 TUI `addInfo`；进度事件同时写入日志文件
- `chiff-progress-display`: 移除 ANSI 终端渲染（`process.stdout.write`/`console.log`），进度信息统一走 logger + onLog

## Impact

- **`src/utils/logger.ts`**：新增 Logger 类
- **`src/core/main.ts`**：创建 harness Logger 实例，crash 错误走 `lifecycle` channel + `addError`
- **`src/core/harness.ts`**：6 处 `console.error` → `logger.error("tool", ...)`
- **`src/core/events.ts`**：1 处 `console.error` → `logger.error("tool", ...)`
- **`src/session/manager.ts`**：1 处 `console.error` → `logger.error("session", ...)`
- **`src/eval/logger.ts`**：删除，功能由 `src/utils/logger.ts` 替代
- **`src/eval/index.ts`**：创建 eval Logger，`onLog` 去掉 `console.error`，crash 走 `addError`
- **`src/eval/llm.ts`**：2 处 `console.warn` → `logger.warn("analysis", ...)`
- **`src/eval/schemas.ts`**：2 处 `console.warn` → `logger.warn("analysis", ...)`
- **`src/eval/focus/budget-guard.ts`**：`console.warn/info` → `logger`
- **`src/eval/focus/progress.ts`**：删除 ANSI 渲染，`console.log` → `logger`
- **`src/eval/rules/extraction.ts`**：~8 处 `console.warn/error` → `logger`
- **`src/eval/rules/store.ts`**：~6 处 `console.warn/error` → `logger`
- **`src/drivers/vision/cache.ts`**：2 处 `console.error` → `logger.warn("tool", ...)`
- **`src/drivers/edit/tool.ts`**：1 处 `console.warn` → `logger.warn("tool", ...)`
