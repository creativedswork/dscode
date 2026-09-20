## 变更综述

dscode 先通过 HarnessEventBus 建立 Host 到 Web/TUI 的统一生命周期投影，再将 Agent
定义为由 AgentSupervisor 管理的可恢复进程，并明确 Harness 是协作式而非抢占式
Kernel。本次变更在这些边界上补齐 Plan 执行监督：Main 仍是同一个 AgentProcess，
Plan 与 TaskState 仍是独立真相源，但每次自动执行被限制在 Host-owned episode 内。
Host 只把验收通过、Plan step 状态和 TaskState outcome 变化视为进展；重复无进展时
只进行一次反思，仍无进展则以 `paused_inconclusive` 保留现场并等待用户显式调整或
继续。

## 变更时间线

- 2026-01-16: `harness-event-bus` - 建立 typed lifecycle event bus，并让 Web/TUI
  消费相同的 Host 事实。
- 2026-08-04: `subagent-design-proposal` - 建立 AgentApplication、AgentProcess、
  AgentSupervisor、Process Store 与 Session-as-TTY 模型。
- 2026-08-05: `systematize-agent-os-mapping` - 明确 Harness 是 Kernel，并明确现有
  Supervisor 不具备抢占式调度能力。
- 2026-09-18: `redesign-plan-executive-loop` - 为已批准 Plan 增加有界 episode、
  deterministic progress/impasse monitor、一次反思和 inconclusive pause。

## 初始设计

最早的相关基础是 HarnessEventBus。Harness 不再直接调用多个 UI 方法，而是发布
typed lifecycle events；WebSocket 和 TUI 分别订阅相同事件。这一设计建立了
presentation-neutral Host 事实，但当时只覆盖模型、Tool、turn、processing、Session
和通知生命周期，不判断一次任务执行是否仍有语义进展。

随后 Agent Process 设计把 `pi-agent-core.Agent` 限定为模型与 Tool loop runtime，
由 AgentSupervisor 管理 PID/PPID、进程状态、前后台挂载、持久化和恢复；Session
保持用户 TTY，不承担任务状态。Agent-as-OS 文档进一步明确 Harness 是 Kernel，
AgentApplication 是应用定义，Agent 是进程，同时明确 Supervisor 只有协作式停止
能力，不能宣称抢占正在执行的模型或 Tool。

## 变更记录

### 变更: 从生命周期转发扩展为执行监督
- **触发**: EventBus 能展示 Tool 很忙，却无法判断这些 Tool 是否推动验收结果。
- **改动**: 增加 presentation-neutral episode 与 impasse 事实，并由 HarnessAPI、
  WebSocket、Web 和 TUI 统一投影。
- **影响**: UI 不再从 spinner、静默、断线或 Tool 数量推断执行状态。

### 变更: 从无限 Agent loop 扩展为协作式有界 episode
- **触发**: 已有 Supervisor 管理进程生命周期，但单次 Main Tool loop 没有确定性
  预算和 no-progress 边界。
- **改动**: 复用 `shouldStopAfterTurn`，在 turn 边界停止当前 episode；不取消
  in-flight Tool，也不创建新 Agent 类型。
- **影响**: AgentProcess 和 Session 模型保持不变，Harness 获得真实但有限的
  scheduling responsibility。

### 变更: 从活动计数切换为 outcome progress
- **触发**: Plan version、evidence 和 Tool Call 可以持续增长，而 Plan step 与
  TaskState 完全不变。
- **改动**: progress 仅由新通过 verification、Plan step 状态或 TaskState outcome
  变化定义；稳定 fingerprint 检测等价无进展动作。
- **影响**: 文件改动和 Tool 成功不再天然获得“有进展”语义。

### 变更: 增加一次反思与显式恢复
- **触发**: 首次卡住可能通过改变策略恢复，但无限自我反思会形成另一种循环。
- **改动**: 首次 impasse 启动一个更短的 Main reflection episode；再次 impasse
  进入 `paused_inconclusive`。用户只能通过调整方案或继续执行显式恢复。
- **影响**: 未验证状态与 blocked、failed、completed 严格区分，现有 Plan 和 TODO
  完整保留。

## 修复记录

### 修复: Tool Call 持续发生时 stall guard 永远不运行
- **症状**: Session `00MU6UD8KVT6VVQN5OHHN4D3YY` 产生 230 次以上 Tool Call，
  同一编辑动作重复 22 次，Plan version 达到 232、evidence 达到 214，但第一个
  step 和 version 1 TaskState 始终未完成。
- **根因**: `continueIncompletePlan` 在当前 turn 包含 Tool Calls 时提前返回，
  只在无 Tool 的 follow-up 上统计 stall；底层模型 Tool loop 本身没有 Host stop
  predicate。
- **修复**: 在 Agent loop turn 边界接入 episode monitor，使用语义 progress 和
  action fingerprint 判定 impasse，并保留 hard turn/Tool budgets 兜底。

### 修复: 活动证据膨胀被误认为任务推进
- **症状**: 每次普通 Tool/Agent activity 都能增加 Plan evidence 和 version，
  造成持久化膨胀并掩盖验收状态不变。
- **根因**: PlanStore 同时承担验收事实和近似 transcript 的职责。
- **修复**: 只持久化可复现当前 matcher 结果的 evidence、稳定 trace reference 和
  bounded incident summary；完整执行轨迹继续由 Session/Process trace 持有。

## 最终状态

### Why

当前 Plan Mode 能持久化意图、授权和验收证据，但无法监督单次 Main Agent Tool loop 是否仍在取得进展。实际 Session `00MU6UD8KVT6VVQN5OHHN4D3YY` 在 TaskState 始终停留于 version 1 的情况下执行了 230 次 Tool Call，其中同一编辑动作重复 22 次，Plan version 持续增长却没有完成任何成果，因此需要由 Host 增加确定性的执行监督和暂停边界。

### What Changes

- 将 Plan 执行拆为有界 execution episode。每个 episode 只允许有限的模型轮次和 Tool Call，达到边界时由 Host 在当前 turn 后停止，不依赖模型主动结束。
- 增加 Host-owned Executive Monitor。它以新通过的 verification、Plan step 状态变化或 TaskState outcome 变化作为进展，不把文件变化、Tool 成功、evidence 数量或 Plan version 增长视为进展。
- 为 action、observation 和失败结果生成稳定 fingerprint。相同或等价的无进展模式达到阈值后，只允许一次反思 episode；再次无进展则暂停自动执行。
- 增加 `paused_inconclusive` 执行状态。暂停时保留 Plan、当前 step、TaskState 和 TODO，不把未验证成果标为 `blocked`、`failed` 或 `completed`。
- 提供两个显式恢复动作：基于现有事实调整方案，或从保存的状态启动一个新的有界 execution episode。恢复不会延续已耗尽的 episode 预算。
- PlanStore 只持久化与验收或恢复有关的摘要证据。完整 Tool transcript 继续保留在 Session/Process trace，不把每次 read/edit 结果复制进 PlanRecord。
- Web/TUI 在现有 Chat 中显示执行中、一次反思、自动暂停和完成状态，并明确区分“未验证”与“失败”。
- 使用上述真实 Session 作为固定回归，证明系统会在重复编辑造成持续损坏前停止，而不是靠模型能力或用户手动中断兜底。

### Capabilities

#### New Capabilities

- `plan-executive-loop`: 定义有界 execution episode、Host 进展判定、重复模式检测、一次反思、自动暂停、恢复和精简 evidence retention。

#### Modified Capabilities

- `agent-as-os-model`: 将 AgentSupervisor/Harness 的职责扩展为协作式 episode 调度和执行监督，但不宣称实现抢占式 OS 调度。
- `harness-api`: 增加只读 execution episode snapshot，以及调整方案和继续执行的窄命令。
- `harness-event-bus`: 增加 presentation-neutral 的 episode 状态、impasse 和暂停事件。
- `websocket-protocol`: 增加 episode snapshot 与显式恢复命令，并支持 Session 重连恢复。
- `web-frontend`: 在现有 Chat Plan/TODO 投影中展示执行、反思、暂停和完成状态。
- `tui-execution-hierarchy`: 在 TUI 对话区展示与 Web 一致的 episode 状态和恢复入口。

### Impact

- 主要代码：`src/application/harness.ts`、`src/application/plan/`、`src/agents/process/`、`src/application/harness-api.ts` 和 `src/application/events.ts`。
- 协议与投影：`src/ui/shared/`、`src/ui/web/web-backend.ts`、`src/ui/tui/` 和 `web/src/`。
- 运行时前置：将 `@earendil-works/pi-*` 对齐升级到至少 `0.84.0`，使用高层 `AgentOptions.shouldStopAfterTurn`，并将 Node.js 最低版本提升到 `22.19.0`；不复制或私有 fork Agent loop。
- 依赖关系：本 change 建立在 `add-interactive-plan-mode` 已定义的 PlanRecord、PlanExecutionState 和 TaskState 之上；不修改旧 Session transcript。
- 不新增 Critic Agent、外部服务、模型调用类型、数据库或 UI 页面；复用 pi-agent-core 的 `shouldStopAfterTurn`、现有 PlanStore、TaskState 和 Chat projection。
