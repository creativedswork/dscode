## 变更综述

dscode 的 SubAgent 展示能力从 Harness Event Bus 和共享 UI 模型起步，经过 Agent
Process、Session 持久化与对话 Agent Activity Card，最终演进为
`Turn → Execution → Tool` 的 TUI 执行树。本次变更补齐了 Tool identity、Permission
归属、状态驱动折叠、`spawn_agent` 去重和长内容渐进展示，使并行委派不再退化为扁平
日志，同时保持 Main/SubAgent 上下文隔离和权威数据完整。

## 变更时间线

- 2026-01-16: `harness-event-bus` — 建立 Harness 生命周期事件与 UI 订阅架构。
- 2026-05-29: `shared-ui-data-model` — 建立 TUI/Web 共用的 canonical UI 数据层。
- 2026-06-01: `fix-tui-waiting-stuck` — 将 thinking 活动纳入 TUI 活跃状态，减少假死。
- 2026-08-04: `subagent-design-proposal` — 将 Agent 定义为可监督、可并发的 OS 风格进程。
- 2026-08-04: `show-subagents-in-conversation` — 将 Agent lifecycle 投影为可恢复的对话 Card。
- 2026-08-04: `include-subagents-in-session-dashboard` — 将持久化 SubAgent 记录纳入 Session 概览。
- 2026-08-07: `tui-execution-hierarchy-redesign` — 将 TUI 重构为 Turn、Execution、Tool 层级。

## 初始设计

最初的 SubAgent 设计把 Main Agent 视为 PID 1，将每个 SubAgent 视为由
`AgentSupervisor` 管理的独立 Agent Process。进程拥有 Application 快照、状态、前后台
挂载、独立 Runtime transcript 和 Process Store 记录，并通过 `parentSessionId` 连接
用户 Session。该设计明确了执行隔离和生命周期，但早期 UI 只消费 Main Agent 流，
SubAgent 的内部 Tool、Permission 与结果没有形成同一棵可读执行树。

## 变更记录

### 变更: 建立事件与共享投影基础
- **触发**: Harness 直接调用 UI 导致生命周期能力耦合，TUI/Web 类型和状态容易漂移。
- **改动**: 引入 typed Harness Event Bus 与 `src/ui/shared/` canonical UI 模型。
- **影响**: Runtime、Session 和 UI 可以通过同一事件和投影模型表达执行活动。

### 变更: 在对话中展示 SubAgent Activity
- **触发**: SubAgent 已作为独立进程运行，但用户只能看到短暂退出通知。
- **改动**: 将 spawn/state/progress/output/exit 合并为 Session scoped Agent Activity，
  并在 TUI/Web 对话中显示可恢复 Card。
- **影响**: 用户能看到 Agent task、状态、耗时和结果，旧 Session 保持兼容。

### 变更: 从独立 Card 演进为执行层级
- **触发**: Main Tool、`spawn_agent`、SubAgent Tool、Permission 和 Waiting 仍按到达
  顺序堆叠，造成重复和归属不清。
- **改动**: 增加 executionId/toolCallId，Card 内聚 Tool timeline、Permission 和
  result；Thinking 与 Tools 独立折叠。
- **影响**: TUI 按 `Turn → Execution → Tool` 展示，并行 Tool 可确定性原位更新。

## 修复记录

### 修复: 并发 Permission 等待卡死
- **症状**: 多个 foreground SubAgent 同时请求 Permission 时，部分执行永久 waiting。
- **根因**: 多个请求共享单一 resolver，后一个请求覆盖前一个。
- **修复**: Harness 使用 `PermissionPromptQueue` 串行化交互，并让每个 prompt 携带
  execution/tool identity。

### 修复: 委派和 Tool 重复显示
- **症状**: `spawn_agent` 同时作为 Main Tool 和 Agent Card 出现，SubAgent Tool 位于
  Card 外。
- **根因**: Main Tool stream 与 Agent Activity projection 没有统一执行归属。
- **修复**: 成功委派只由 Agent Card 表示；创建前失败仍保留 failed Main Tool。

### 修复: Permission 与 Waiting 脱离具体执行
- **症状**: Permission 作为全局消息显示，解决后留下永久结果；状态栏只显示 Waiting。
- **根因**: Permission 和状态加载器缺少 execution-scoped activity。
- **修复**: Permission 原位显示在所属 Tool 下，状态栏优先显示具体 Agent/Tool 活动。

## 最终状态

### Why

TUI 原先把 Main thinking、Main Tool、`spawn_agent`、SubAgent Activity、SubAgent
Tool、Permission 和全局 Waiting 堆在同一个扁平日志流中。并行 SubAgent 和 Tool
progress 放大了重复信息、Card 外 Tool、长内容挤占视口和执行状态不明确的问题。

### What Changes

- TUI 使用 `Turn → Execution → Tool` 执行树；Main execution 是根，SubAgent Activity
  是 Delegation 子执行。
- Tool lifecycle、Agent progress 和 Permission 使用稳定的 executionId/toolCallId。
- 成功 `spawn_agent` 不再重复为普通 Main Tool；创建前失败仍可见。
- Thinking 和每个 Execution 的 Tools 独立折叠，并保留手动选择。
- Running 默认展开 Tools，Completed 默认折叠，Failed 默认展开，Permission 强制展开。
- Permission 在所属 Tool 下原位展示，解决后不追加永久对话消息。
- 全局 Waiting 只作为无具体活动时的 fallback；状态栏优先显示 Agent/Tool。
- 长 Thinking、Tool timeline 和 SubAgent output 使用摘要与可见预算控制密度，完整
  transcript/output 继续保留在 Session、Runtime transcript 或 Agent Process Store。
- Session 历史使用同一 Activity 语义恢复，不 spawn、resume 或重新执行 Agent。

### Capabilities

- 新增 `tui-execution-hierarchy`，定义 Turn/Execution/Tool 层级、折叠策略、状态驱动
  展示、渐进披露和数据完整性边界。
- 扩展 `agent-activity-display`，使 Agent Card 成为包含 Tool、Permission 与 result
  的 SubAgent execution container。
- 扩展 `agent-progress-notification`，为 Tool 和 Permission progress 增加 execution
  identity。
- 扩展 `shared-conversation-model`，增加 canonical Tool/Permission Activity 和按
  identity upsert 的 projection。

### Impact

- 影响 Harness events、Agent runtime/lifecycle、Permission callback、shared UI
  projection、TUI backend、ConversationView 和 TuiApp。
- Web 可复用新增 canonical activity 字段，但本次不重做 Web Card 视觉。
- 不引入运行时依赖，不改变 Agent 模型上下文、Process Store 所有权或
  foreground/background 语义。
- 交互原型归档于 `docs/prototypes/archive/2026-08-07-tui-execution-hierarchy-redesign/tui-execution-hierarchy-redesign.html`，实现已通过
  相关测试、TypeScript、production build、严格 OpenSpec 校验及 80/120 列真实 PTY
  验证。
