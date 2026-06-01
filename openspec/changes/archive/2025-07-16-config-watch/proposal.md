# ConfigWatch — 统一配置热重载数据层

## 问题

当前 TUI 和 Web UI 对 HarnessConfig 变更的感知方式完全不同：

- **TUI**：依赖进程内共享引用，`ctx.config` 和 `harness.config` 是同一个对象，一处 mutate 处处可见——隐式、不可测试、无类型约束
- **Web UI**：依赖手工 WebSocket 事件传递，server 端在每次 mutation 后发送 `{ type: "config" }` 事件，frontend 需逐个处理——手工、易遗漏（当前 `set_project_path` 变更后前端没有 `case "config"` 导致 cwd 设置不生效）

## 方案

引入 `ConfigWatch` 可观察配置层：所有配置 mutation 通过显式方法，变更自动通知订阅者。TUI 和 Web UI 统一通过 `onConfigChange` 订阅感知变更。

## What Changes

- **新增 `src/core/config-watch.ts`**：ConfigWatch 类，封装 HarnessConfig 的读写，5 个领域方法 + onChange 订阅
- **改造 `src/core/harness.ts`**：以 ConfigWatch 替代裸 HarnessConfig，所有 config mutation 走 ConfigWatch 方法
- **扩展 `src/ui/backend.ts`**：UiBackend 接口新增 `onConfigChange` 回调
- **改造 `src/ui/web/web-backend.ts`**：config mutation 走 ConfigWatch 方法，通过 onConfigChange 自动广播
- **改造 `src/ui/commands.ts`**：`/config` 命令的 config mutation 走 ConfigWatch 方法
- **修复 `web/src/components/App.tsx`**：添加 `case "config"` 处理，使所有配置变更即时生效
- **改造 `src/ui/tui-app.ts`**：TuiDeps 接入 ConfigWatch，保持向后兼容

## Capabilities

### New
- `config-watch`：ConfigWatch 可观察配置层 API（setModelConfig / setApiKey / setProjectPath / setVision / updateVision / setMcpServers / onChange / get）

### Modified
- `core-harness`：Harness 配置持有方式从直接 mutation 改为 ConfigWatch 代理
- `ui-backend`：UiBackend 接口新增 onConfigChange 可选方法
- `web-frontend`：前端新增 config 事件处理，修复 cwd 不生效 bug
