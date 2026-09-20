## Why

当前 Plan Mode 能持久化意图、授权和验收证据，但无法监督单次 Main Agent Tool loop 是否仍在取得进展。实际 Session `00MU6UD8KVT6VVQN5OHHN4D3YY` 在 TaskState 始终停留于 version 1 的情况下执行了 230 次 Tool Call，其中同一编辑动作重复 22 次，Plan version 持续增长却没有完成任何成果，因此需要由 Host 增加确定性的执行监督和暂停边界。

## What Changes

- 将 Plan 执行拆为有界 execution episode。每个 episode 只允许有限的模型轮次和 Tool Call，达到边界时由 Host 在当前 turn 后停止，不依赖模型主动结束。
- 增加 Host-owned Executive Monitor。它以新通过的 verification、Plan step 状态变化或 TaskState outcome 变化作为进展，不把文件变化、Tool 成功、evidence 数量或 Plan version 增长视为进展。
- 为 action、observation 和失败结果生成稳定 fingerprint。相同或等价的无进展模式达到阈值后，只允许一次反思 episode；再次无进展则暂停自动执行。
- 增加 `paused_inconclusive` 执行状态。暂停时保留 Plan、当前 step、TaskState 和 TODO，不把未验证成果标为 `blocked`、`failed` 或 `completed`。
- 提供两个显式恢复动作：基于现有事实调整方案，或从保存的状态启动一个新的有界 execution episode。恢复不会延续已耗尽的 episode 预算。
- PlanStore 只持久化与验收或恢复有关的摘要证据。完整 Tool transcript 继续保留在 Session/Process trace，不把每次 read/edit 结果复制进 PlanRecord。
- Web/TUI 在现有 Chat 中显示执行中、一次反思、自动暂停和完成状态，并明确区分“未验证”与“失败”。
- 使用上述真实 Session 作为固定回归，证明系统会在重复编辑造成持续损坏前停止，而不是靠模型能力或用户手动中断兜底。

## Capabilities

### New Capabilities

- `plan-executive-loop`: 定义有界 execution episode、Host 进展判定、重复模式检测、一次反思、自动暂停、恢复和精简 evidence retention。

### Modified Capabilities

- `agent-as-os-model`: 将 AgentSupervisor/Harness 的职责扩展为协作式 episode 调度和执行监督，但不宣称实现抢占式 OS 调度。
- `harness-api`: 增加只读 execution episode snapshot，以及调整方案和继续执行的窄命令。
- `harness-event-bus`: 增加 presentation-neutral 的 episode 状态、impasse 和暂停事件。
- `websocket-protocol`: 增加 episode snapshot 与显式恢复命令，并支持 Session 重连恢复。
- `web-frontend`: 在现有 Chat Plan/TODO 投影中展示执行、反思、暂停和完成状态。
- `tui-execution-hierarchy`: 在 TUI 对话区展示与 Web 一致的 episode 状态和恢复入口。

## Impact

- 主要代码：`src/application/harness.ts`、`src/application/plan/`、`src/agents/process/`、`src/application/harness-api.ts` 和 `src/application/events.ts`。
- 协议与投影：`src/ui/shared/`、`src/ui/web/web-backend.ts`、`src/ui/tui/` 和 `web/src/`。
- 运行时前置：将 `@earendil-works/pi-*` 对齐升级到至少 `0.84.0`，使用高层 `AgentOptions.shouldStopAfterTurn`，并将 Node.js 最低版本提升到 `22.19.0`；不复制或私有 fork Agent loop。
- 依赖关系：本 change 建立在 `add-interactive-plan-mode` 已定义的 PlanRecord、PlanExecutionState 和 TaskState 之上；不修改旧 Session transcript。
- 不新增 Critic Agent、外部服务、模型调用类型、数据库或 UI 页面；复用 pi-agent-core 的 `shouldStopAfterTurn`、现有 PlanStore、TaskState 和 Chat projection。
