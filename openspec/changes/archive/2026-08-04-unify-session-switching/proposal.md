## Why

TUI `/session load`、Web `/session load` 和 Web 侧边栏加载当前分别编排
Session 切换，导致保存、中止、异步等待、Main Agent Process 重绑定和 UI
刷新顺序不一致。随着 SubAgent 通过 `parentSessionId` 关联 Session，这种分叉会
造成新子进程归属错误、旧会话状态丢失或 Web 提前刷新。

## What Changes

- 新增 UI 无关的统一 Session 切换用例，作为三个加载入口的唯一事务边界。
- 切换前解析并验证目标 Session，再中止当前 Main turn、等待执行静止并保存原
  Session。
- 加载目标 Session 的 Main Agent 消息和 `agentMessages`，但不将 SubAgent
  transcript 注入 Main Agent 推理上下文。
- 显式等待 Main Agent Process 的 `parentSessionId` 和 Process Store 更新完成。
- 保持运行中 background SubAgent 的原始 `parentSessionId`，其退出结果继续写回
  启动它的 Session。
- 将 slash command 执行协议改为可等待的异步协议，TUI 和 Web 在切换完成后才刷新。
- 定义加载或 Main Process 重绑定失败时的回滚规则。
- 增加 command 级、Session 路由级和失败恢复测试。

## Capabilities

### New Capabilities

- `session-switching`: 统一 Session 解析、切换事务、UI 入口一致性、失败回滚及
  SubAgent 跨 Session 路由规则。

### Modified Capabilities

- `session-management`: Session load 增加事务前置验证、原 Session 保存、
  `agentMessages` 恢复和可回滚切换语义。
- `agent-execution-engine`: Main Agent Process 在 Session 切换时重绑定 TTY；
  已存在子进程保持其启动时的 `parentSessionId`。

## Impact

- `src/core/harness-api.ts` 和 `src/core/harness.ts`：增加统一
  `switchSession()` API。
- `src/session/`：增加 Session 切换协调器或等价的 UI 无关编排模块。
- `src/ui/commands.ts`：slash command 执行改为异步等待。
- `src/ui/tui-app.ts`、`src/ui/web/web-backend.ts`：统一调用
  `switchSession()`，移除重复加载编排。
- `src/agents/process/supervisor.ts`：提供可等待的 Main Process Session 重绑定，
  不修改已有子进程。
- Session Store 和 Agent Process Store 的磁盘布局不变。
- 不新增运行时依赖，不创建 SubAgent Session。
