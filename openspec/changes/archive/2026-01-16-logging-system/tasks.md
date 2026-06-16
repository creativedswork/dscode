## 1. Logger 核心实现

- [x] 1.1 创建 `src/utils/logger.ts`：实现 `Logger` 类，构造函数接受 `{ type, id }`
- [x] 1.2 实现 `debug/info/warn/error` 方法，channel 作为第一个参数
- [x] 1.3 实现日志行格式化：`[timestamp] [LEVEL] [channel] [agent_type/id] [tag] message`
- [x] 1.4 实现文件写入：自动创建 `~/.dscode/logs/` 目录，追加写入 `<channel>.log`
- [x] 1.5 实现 `clear(channel)` 方法，清空指定 channel 日志
- [x] 1.6 实现 level 过滤（构造时可设 `level`），低于门槛的日志丢弃
- [x] 1.7 所有 I/O 异常静默处理，不抛出

## 2. Harness Agent Logger 集成

- [x] 2.1 `core/main.ts`：生成 runtimeId，创建 harness Logger：`new Logger({ type: "harness", id: runtimeId })`
- [x] 2.2 `core/main.ts`：unhandledRejection/uncaughtException 改为 `logger.error("lifecycle", ...)` + `ui.addError`
- [x] 2.3 `core/main.ts`：SIGINT/SIGTERM 改为 `logger.info("lifecycle", ...)`
- [x] 2.4 `core/harness.ts`：传入 logger，6 处 `console.error` 改为 `logger.error("tool", ...)`
- [x] 2.5 `core/events.ts`：传入 logger，1 处 `console.error` 改为 `logger.error("tool", ...)`
- [x] 2.6 `session/manager.ts`：传入 logger，1 处 `console.error` 改为 `logger.error("session", ...)`

## 3. Eval Pipeline 日志迁移

- [x] 3.1 `eval/index.ts`：创建 eval Logger：`new Logger({ type: "harness", id: runtimeId })`（runtimeId 从 harness 获取）
- [x] 3.2 `eval/index.ts`：`clearEvalLog()` → `logger.clear("analysis")`
- [x] 3.3 `eval/index.ts`：`logEval` 调用 → `logger.info/warn/error("analysis", ...)`
- [x] 3.4 `eval/index.ts`：`onLog` 去掉 `console.error`，仅保留 `addInfo`
- [x] 3.5 `eval/llm.ts`：2 处 `console.warn` → `logger.warn("analysis", ...)`
- [x] 3.6 `eval/schemas.ts`：2 处 `console.warn` → `logger.warn("analysis", ...)`
- [x] 3.7 `eval/focus/budget-guard.ts`：`console.warn/info` → `logger.warn/info("analysis", ...)`
- [x] 3.8 `eval/rules/extraction.ts`：~8 处 `console.warn/error` → `logger.warn/error("analysis", ...)`
- [x] 3.9 `eval/rules/store.ts`：~6 处 `console.warn/error` → `logger.warn/error("analysis", ...)`

## 4. ProgressDisplay 改造

- [x] 4.1 `eval/focus/progress.ts`：删除 `render()` 和 `renderCompletion()` 中的 `process.stdout.write` 调用
- [x] 4.2 `eval/focus/progress.ts`：删除 `renderCompletion()` 中的 `console.log` 调用
- [x] 4.3 `eval/focus/progress.ts`：删除 spinner（`startSpinner`/`stopSpinner` 及 `spinnerInterval`）
- [x] 4.4 `eval/focus/progress.ts`：移除 `disableTerminal` 选项和 `render()`/`lastRender` 等终端渲染相关代码
- [x] 4.5 `eval/focus/progress.ts`：新增 `logger` 可选参数，`onPhaseStart/onPhaseDone/showCompletion` 写入日志

## 5. 其他模块日志迁移

- [x] 5.1 `drivers/vision/cache.ts`：2 处 `console.error` → `logger.warn("tool", ...)`
- [x] 5.2 `drivers/edit/tool.ts`：1 处 `console.warn` → `logger.warn("tool", ...)`

## 6. 清理与验证

- [x] 6.1 删除 `eval/logger.ts`
- [x] 6.2 删除 `eval/index.ts` 中对 `eval/logger.ts` 的 import
- [x] 6.3 TypeScript 类型检查通过（`npm run typecheck`）
- [ ] 6.4 验证：运行 `/eval` 命令，确认终端无日志输出，`~/.dscode/logs/analysis.log` 有完整记录
- [ ] 6.5 验证：触发 session save 错误，确认 `session.log` 有记录
- [ ] 6.6 验证：进程生命周期事件写入 `lifecycle.log`
