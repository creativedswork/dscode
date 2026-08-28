## Why

dscode 目前只有直接执行和逐次权限确认，缺少复杂任务的可持久化预演、分支比较、意图对齐与执行约束。需要引入符合 Agent-as-OS 的内部规划能力：Agent 自主判断是否规划、调查、回溯和重新规划；用户继续通过 Chat 提交目标，只在缺少视觉风格、范围取舍、兼容承诺等价值判断时参与意图对齐。

## What Changes

- Main Agent 在首次副作用前执行结构化复杂度评估，并自主决定直接执行、内部规划或请求意图对齐；产品 UI 不提供 `Auto / Plan` 模式开关。
- 增加受 AgentSupervisor 管理的 Planner AgentApplication。Planner 使用不可变的 `permissionMode: plan` 能力集，只能调查和形成候选路径，不能执行写入或其他真实副作用；技术路径由 Agent 自主选择。
- 增加项目级 PlanStore，持久化目标、约束、候选方案、Chat 对齐约束、证据摘要、执行清单、内部授权、revision、digest 和有序 trajectory events；不保存或展示模型原始 Chain-of-Thought。
- 增加 RAP-lite 规划生命周期：有界展开候选路径、比较证据/风险/成本、自主选择技术路径、支持回溯，并将选定轨迹编译为 Execution Plan。只有影响用户可见结果且无法从上下文确定的价值判断进入 Chat 原生意图对齐。
- 将 Plan 状态与 Agent 执行进度分离。SubAgent 完成只作为 evidence，只有验收条件通过后才能推进 PlanItem。
- 执行绑定具体 `revision + digest`。计划内容变化或执行中触发 replanning 时，旧执行绑定立即失效；危险副作用继续使用现有权限确认，不增加整份计划审批 UI。
- 为 HarnessAPI、HarnessEventBus 和 WebSocket 增加 typed plan commands/events，并支持 Web/TUI 共享同一 PlanRecord 投影、断线重连和进程恢复。
- Web/TUI 在现有 Chat 流中呈现简短的意图对齐问题和最多三个用户可理解的选项；不增加独立计划工作台、计划摘要、计划审批面或模式切换控件。

## Capabilities

### New Capabilities

- `interactive-plan-mode`: 定义自主复杂度路由、Planner 进程、RAP-lite 自主规划与 Chat 意图对齐、PlanStore、revision 执行绑定、恢复与重新规划。

### Modified Capabilities

- `agent-as-os-model`: 将 Planner 定义为受 Supervisor 管理的独立前台进程，并保持 AgentApplication、AgentProcess、Session/TTY、PlanRecord 和执行 Job 的语义边界。
- `agent-tool-filtering`: 将 Plan Mode 的只读能力从工具名黑名单升级为默认拒绝未知副作用的 effect metadata 策略。
- `harness-api`: 暴露内部计划查询、意图对齐、执行授权和重新规划端口；Web/TUI 只消费 Chat 对齐 projection。
- `harness-event-bus`: 增加 presentation-neutral 的计划生命周期、等待交互和 revision 事件。
- `websocket-protocol`: 增加 typed plan commands/events、初始状态同步、CAS 冲突和重连恢复契约。
- `web-frontend`: 在现有 Chat 流中增加原生意图对齐交互；内部计划状态不形成独立产品模块，也不写入模型 transcript。
- `tui-execution-hierarchy`: 在现有对话区呈现与 Web 等价的意图对齐交互，不增加独立计划面板。

## Impact

- 运行时：`src/application/`、`src/agents/process/`、内部 AgentApplication 资源和项目级持久化目录。
- 共享协议：`src/ui/shared/types.ts`、共享 reducer/state projection、HarnessEvent discriminated union。
- UI adapters：`src/ui/web/`、`src/ui/tui/`、`web/src/`。
- 测试：PlanStore 原子写、写锁与 version CAS、自主复杂度路由、Planner 能力隔离、执行绑定失效、Chat 对齐、恢复/replanning、WebSocket 契约、Web/TUI reducer 与交互。
- 不引入外部规划服务、向量数据库或新的 UI 组件库；运行时不依赖 OpenSpec artifacts。
