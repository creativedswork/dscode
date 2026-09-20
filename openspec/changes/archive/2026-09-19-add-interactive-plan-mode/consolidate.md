## 变更综述

`add-interactive-plan-mode` 建立在既有 HarnessEventBus、共享 UI 数据模型、
Agent-as-OS 进程模型、统一 Session 切换和权限交互之上，把 dscode 从“直接执行加逐次
权限确认”扩展为可持久化、可恢复、受 revision 与 digest 约束的自主规划执行系统。方案
在实施期间从独立 Plan 工作台转向 Web/TUI 共用的 Chat 原生体验：用户只处理会改变可见
结果的价值判断，Planner 自主完成技术决策，授权后的全局计划默认折叠并位于实时 TODO
之前，真实副作用仍经过既有权限机制。M8 实现补齐了 scope/effect 门禁、验收证据、
material replan、终态展示、Session/进程恢复、私有推理边界和终态 retention，并通过
确定性集成测试、TUI PTY smoke 与隔离的真实 Browser 主路径验收。M9 随后实现了
TaskState、结构化 Plan schema v2、持久化意图债务、执行前 TaskState 门禁和 completed
后的独立报告阶段。复杂游戏实际验收覆盖了 Web 完整执行、最终报告、浏览器产物运行和
TUI 冷恢复；验收中发现并修复了 replacement Main 未恢复旧 TaskState 的缺陷，最终
TUI 可见地恢复完成 Plan、TODO `2/2` 和结果摘要。

## 变更时间线

- 2026-01-16: `harness-event-bus` — 建立 presentation-neutral 的 typed 领域事件和
  Web/TUI 订阅边界。
- 2026-05-29: `shared-ui-data-model` — 建立 Web/TUI 共用的消息、权限、Session 类型和
  reducer 真相源。
- 2026-06-16: `fix-session-switch-loss` — 明确 Session 切换前中止、保存和身份同步顺序。
- 2026-06-16: `session-permission-pause-resume` — 建立权限交互跨 Session 保存与恢复语义。
- 2026-08-04: `subagent-design-proposal` — 引入 AgentApplication、AgentProcess、
  AgentSupervisor 与 Session-as-TTY 模型。
- 2026-08-04: `unify-session-switching` — 将 Main Process 重绑与 Session 切换收敛到统一
  事务边界。
- 2026-08-05: `systematize-agent-os-mapping` — 固化 Harness、Application、Process、
  Tool、Driver、权限、IPC 与持久化的领域边界。
- 2026-08-07: `tui-execution-hierarchy-redesign` — 建立 TUI 的
  Turn → Execution → Tool 投影和折叠语义。
- 2026-08-08: `redesign-tui-conversation-interaction` — 建立稳定焦点、键盘导航和
  disclosure 交互。
- 2026-08-13: `unified-tool-approval-card` — 统一 Web/TUI 的工具权限入口并保留来源归属。
- 2026-09-05: `add-interactive-plan-mode` — 完成自主路由、Chat 原生意图对齐、执行绑定、
  恢复、安全边界和集成验收。

## 初始设计

最初要解决的问题是复杂任务缺少可持久化预演、分支比较、意图对齐和执行约束。已有系统
已经提供 typed EventBus、共享 Web/TUI projection、AgentSupervisor 管理的进程模型、
统一 Session 切换及现有权限交互，因此新能力不另建平行运行时，而是在这些边界上增加
独立 PlanRecord 和 Planner AgentApplication。

初始方法包含四个核心部分：

- Main 在首次副作用前提交结构化复杂度评估，Host 确定 Direct 或 Plan 路由。
- Planner 作为 `permissionMode: plan` 的独立前台 AgentProcess，只能只读调查和操作
  Plan 领域对象。
- PlanStore 以原子 JSON、CAS、独占锁、独立 `version/revision` 和 semantic digest
  保存目标、约束、决策、执行项、授权、交互回执及公开轨迹。
- Main 只执行与当前 `planId + revision + digest + itemId` 绑定且符合 effect/resource
  scope 的副作用；工具结果形成 evidence，Host 根据持久化验收条件自动结算 PlanItem。

## 变更记录

### 变更: 从独立 Plan 工作台转为 Chat 原生规划
- **触发**: 独立工作台和显式 `Auto / Plan` 控件不符合单一 Chat 输入及 Agent 自主规划
  的产品方向。
- **改动**: 删除独立规划入口和整份 Plan 审批面；只把缺失的视觉、范围、兼容等用户价值
  判断投影为 Chat 内联问题，技术候选由 Planner 自主选择。
- **影响**: Web/TUI 共享同一 Plan projection，内部候选树、路由分数、revision、digest、
  evidence 和控制工具不进入可见 transcript。

### 变更: 增加全局计划输出并与 TODO 分责
- **触发**: 单独的实时 TODO 无法解释整体目标、约束、方案、范围和验证方式。
- **改动**: 从已授权 PlanRecord 确定性投影唯一全局计划，默认折叠并置于唯一 TODO
  之前；M8 阶段 TODO 显示实时 PlanItem 状态。
- **影响**: 首次授权、replan、Session 切换、重连和终态恢复均替换或恢复同一 Plan/TODO，
  不增加模型总结调用，也不把 disclosure 状态写入 PlanStore。

### 变更: TODO 改为 Main Agent Context 中的 TaskState
- **触发**: 即使把 PlanItem 合并为“独立交付物”，Plan 的授权步骤和验收状态仍不能准确
  表达 Agent 当前完成了什么、正在完成什么以及还剩什么；Direct 请求也可能需要 TODO。
- **改动**: M9 将 PlanRecord、Main `AgentContext.taskState` 和 Runtime 拆成三个领域对象。
  `PlanExecutionStep` 只描述内部授权工作和结构化验证；`TodoItem` 只描述用户可观察成果，
  由 Main 通过 typed context mutation 动态维护。
- **影响**: Web/TUI 通过独立 `task_state` 投影 TODO。文件、组件、命令、测试、Tool、
  SubAgent 和用户人工验收不自动成项；continuation 预算耗尽不再产生 `blocked`。
  9.11 中“PlanItem 是独立交付物并直接投影为 TODO”的定义被取代，但 Host-owned
  verification 和不向 Main 暴露 `verify_item` 的结论继续有效。应用重启产生 replacement
  Main 时，Supervisor 从目标 Session 的持久化 Main snapshots 恢复最高版本 TaskState
  到当前 owning Main，不从其他 Session 或 SubAgent 泄漏状态。

### 变更: 将普通越界拒绝与 material replan 分离
- **触发**: 未授权诊断命令若自动触发 replan，会错误清除仍有效的执行绑定。
- **改动**: Guard 继续拒绝 effect/resource scope 扩张，但只有 Main 基于执行证据显式
  报告当前路径不可行时才进入 `needs_replan`。
- **影响**: 普通 scope denial 保留当前 revision、authorization 和 item binding；
  material conflict 才派生带 `baseRevision` 的新 revision。

### 变更: 补齐可执行验收与自动 continuation
- **触发**: 聚合 shell criterion、不可执行 observable criterion 和 Main 提前结束会
  造成计划无法完成或产生伪完成。
- **改动**: 编译期要求简单 command criterion 并派生 process grant；observable 必须
  绑定 Main 可用 Tool；Host 从持久化 evidence 自动结算 acceptance，确实未满足时才有界续跑。
- **影响**: 每条命令逐项原样执行和取证；模型不再需要 `verify_item` 控制调用，充分证据
  不会因 continuation stall 被标成 blocked。

### 变更: 强化恢复、终态展示和 retention
- **触发**: approval 后协调中断、Session 重绑和冷启动可能留下无法安全续跑或无法展示的
  Plan。
- **改动**: 启动及 Session 恢复时对账 PlanStore 与 Process Table；无法验证的执行态
  转入 `needs_replan`；终态保留最近授权的公开展示快照；终态 Plan 与 receipts 按统一
  TTL 处理。
- **影响**: 不会从错误 Session 继承执行授权，不会在冷恢复时自动重放副作用，终态
  Plan/TODO 可稳定恢复。

## 修复记录

### 修复: Planner handoff 出现假空闲
- **症状**: Main 路由完成后、Planner 产生交互前，Chat 曾恢复空闲 composer。
- **根因**: Main response、Planner 前台所有权和 processing 投影之间缺少连续状态。
- **修复**: 路由后立即显示 `Waiting...` 和唯一 `进入 Planning Mode` 标记，保持 Stop
  与 processing，直到 Planner 或 pending interaction 接管。

### 修复: 对齐选择、Plan 和 TODO 在恢复时重复或丢失
- **症状**: Session 切换、重连或终态恢复可能重复用户选择，或丢失当前 Plan/TODO。
- **根因**: 可见状态曾依赖瞬时消息和内存 resolver，而非持久化 interaction/PlanRecord。
- **修复**: 使用稳定 interaction/command identity、幂等 receipt 和独立 Plan reducer；
  恢复时从 PlanStore 重建唯一已确认条目、Plan 输出和 TODO。

### 修复: 执行授权与命令验收脱节
- **症状**: Main 聚合验收命令或尝试额外诊断命令时，scope 无法规范化，且可能被误判为
  需要重新规划。
- **根因**: command criterion 未完整进入 process grant，格式错误与 material conflict
  共用处理路径。
- **修复**: 编译期派生最小 command class，拒绝复合 shell criterion；运行时把聚合命令
  作为可重试 `invalid_command`，把普通越界调用作为保留授权的 scope denial。

### 修复: 执行 incident 被错误升级为 semantic replan
- **症状**: 一条 pattern 以 `-` 开头的 `grep` 验收命令因参数解析失败后，Main 可仅凭
  summary 调用 `plan_report_conflict`，使仍然有效的 Plan 进入 `needs_replan`。
- **根因**: 编译器没有拒绝歧义 `grep` pattern，material conflict 入口也未验证当前
  Main/binding、语义 revision/digest、冲突目标和成功客观 evidence。
- **修复**: Plan semantic intent 与 execution incident 分离；`grep` criterion 必须使用
  `--` 或 `-e/--regexp`；material conflict 必须指向现存 hard constraint 或 selected
  decision，并引用当前 item 的成功 Tool evidence。失败/unknown、权限拒绝、Agent 自述
  或 summary-only 报告只影响执行重试/blocked。显式用户 `requestReplan` 保留为独立
  兼容路径。

### 修复: 人工验收被错误编译为 TODO
- **症状**: 实现任务完成后仍显示第二个“用户人工验收”TODO，并因 Agent 无法执行而
  永久 `blocked`；仅禁止纯人工项后，Planner 仍可把人工验收混入命令冒烟项。
- **根因**: `human` criterion 被错误视为执行计划验收，而用户操作不属于 Agent TODO。
- **修复**: 新 revision 编译期拒绝任何 `human` criterion。工具能力覆盖不到的人工视觉
  结论只在交付时列为 evidence gap，不形成 TODO、不计数也不阻塞 Plan 完成。

### 修复: 实现阶段被错误投影为 TODO 且充分证据仍被阻塞
- **症状**: 单个 `index.html` 交付被拆成骨架、样式、交互、冒烟四个 TODO；交互项的
  全部 command criterion 已成功，Main 未调用 `verify_item` 后仍被 stall 预算标为
  `blocked`，后续冒烟项无法启动。
- **根因**: Planner 将 PlanItem 当作实现阶段；验收结算又错误地归模型控制，而不是由
  掌握持久化 evidence 的 Host 负责。
- **修复**: PlanItem 改为独立交付物；共享 workspace-write scope 的项和仅验证前序产物的
  项在编译期拒绝并要求合并。Main evidence 满足全部 criteria 时 Host 原子完成 item；
  `verify_item` 从 Main 工具面移除，仅保留兼容 API。

### 修复: 意图对齐缺少明确推荐
- **症状**: Web 对齐卡片默认选中首项，但没有“推荐”说明或标签。
- **根因**: Planner decision schema 只有布尔字段，没有约束每个 decision 必须恰好一个
  `recommended` candidate；共享投影和 Web 组件只能如实显示全 false 数据。
- **修复**: Planner decision 在持久化前校验推荐数量，零个或多个都拒绝并让 Planner
  重试；Web/TUI 继续复用既有推荐展示，不增加新的 UI 分支。

### 修复: 并发 Tool settle 和 approval 后协调不完整
- **症状**: read evidence 可能提前释放另一副作用调用的取消等待；approval 已提交后若
  Planner completion 或 Main attach 失败，Plan 可能停在不可达状态。
- **根因**: Tool lifecycle 未按 call identity 独立配对，提交后协调依赖一次性内存回调。
- **修复**: 仅已登记的 in-flight call 可独立 settle/release；approval 后统一走幂等、
  可恢复 completion 路径，并在启动恢复中继续未完成协调。

### 修复: route assessment 的意图债务未进入 Plan
- **症状**: route assessment 能识别意图不确定性，但 Planner 后续可把视觉、交付或范围
  债务当作技术选择绕过，compile/authorize 无法证明所有用户价值判断已完成。
- **根因**: 缺少从 route assessment 到 Plan schema、decision 和持久化 interaction
  consumption 的稳定 requirement identity。
- **修复**: schema v2 增加可选 `alignmentRequirements`，topic 限定为
  `visual_direction | delivery | product_scope | compatibility | cost |
  reversibility | other`。Host 为无明确视觉方向的 creative creation 注入 visual
  requirement；decision 用 `resolvesRequirementIds` 每次关联一个 pending requirement。
  只有匹配的持久化 human interaction 被消费后才能清除 requirement；技术 select 不清除，
  custom constraint 可以清除且 resolver 可省略。compile 与 authorize 分别拒绝任何
  pending requirement。
- **兼容性**: schema v1 和缺少该字段的早期 schema v2 继续只读加载；字段缺失不被补写，
  已有 canonical digest 保持不变。

### 修复: Plan 执行可早于 TaskState 初始化
- **症状**: Main 可先调用 `plan_start_item` 建立执行 binding，随后再补 TODO，使 Plan step
  再次成为事实上的 TODO 来源。
- **根因**: execution binding 边界只校验 Plan authorization，没有验证 owning Main 的
  current task context。
- **修复**: `plan_start_item` 在写 binding 前强制 Main 已有 active TaskState，Session 与
  owning Main 一致，且 `sourcePlan.planId/revision/digest` 完全匹配；否则要求
  `task_update initialize`。Host 不从 PlanExecutionStep 合成 TodoItem。

### 修复: Plan completed 后 Main 被终止或缺少最终交付报告
- **症状**: Plan 最后一个 verification 完成后，终态 cleanup 可能终止 Main；中间执行
  narration 可能进入 Chat，或 activePlan 清除后 tracker 不再触发最终报告。
- **根因**: execution cleanup、TaskState 收尾和用户报告共用一个终态分支，且 continuation
  只依赖 Main `activePlan`。
- **修复**: completed cleanup 清除 Main/SubAgent binding、终止绑定 SubAgent但保留 Main；
  execution narration 在 live 与 replay 中隐藏。内存 tracker 即使 activePlan 已清除也
  进入一次 report phase，先完成实际交付的 TaskState outcomes，再输出一次可见报告，明确
  交付、实际验证和未验证/缺口。report phase 只允许 `task_update` 与 read Tool；
  cancelled/failed 仍终止 Main。
- **恢复限制**: report tracker 当前未持久化；若 completed 已提交但 Host 在报告前崩溃，
  恢复不会自动补发最终报告。

## 最终状态

### Why

dscode 目前只有直接执行和逐次权限确认，缺少复杂任务的可持久化预演、分支比较、意图
对齐与执行约束。该变更引入符合 Agent-as-OS 的内部规划能力：Agent 自主判断是否规划、
调查、回溯和重新规划；用户继续通过 Chat 提交目标，只在缺少视觉风格、范围取舍、兼容
承诺等价值判断时参与意图对齐。

### What Changes

- Main Agent 在首次副作用前执行结构化复杂度评估，并自主决定直接执行、内部规划或请求
  意图对齐；产品 UI 不提供 `Auto / Plan` 模式开关。
- 增加受 AgentSupervisor 管理的 Planner AgentApplication。Planner 使用不可变的
  `permissionMode: plan` 能力集，只能调查和形成候选路径，不能执行写入或其他真实
  副作用；技术路径由 Agent 自主选择。
- 增加项目级 PlanStore，持久化目标、约束、候选方案、Chat 对齐约束、证据摘要、执行
  清单、内部授权、revision、digest 和有序 trajectory events；不保存或展示模型原始
  Chain-of-Thought。
- 增加 RAP-lite 规划生命周期：有界展开候选路径、比较证据/风险/成本、自主选择技术
  路径、支持回溯，并将选定轨迹编译为 Execution Plan。只有影响用户可见结果且无法从
  上下文确定的价值判断进入 Chat 原生意图对齐。
- 将 Plan、Agent 当前任务状态和运行时进度分离。PlanExecutionStep 及其 verification
  约束内部授权工作；Main `AgentContext.taskState.todoList` 记录用户可观察成果；
  Tool、SubAgent 和 continuation 只记录运行活动。
- TODO 可在执行中增补、拆分、合并、重排、跳过或重开。文件、实现阶段、测试和人工验收
  不自动形成 TodoItem，`blocked` 只表示 Main 无法自行消除的外部依赖。
- route assessment 将 unresolved user-value requirements 写入 Plan schema v2；技术选择
  不能清除意图债务，compile/authorize 在所有 requirement resolved 前保持阻断。
- `plan_start_item` 要求 owning Main 已初始化与当前 Plan identity 完全匹配的 active
  TaskState，执行 binding 不再先于成果状态真相源。
- Plan completed 后保留 Main 完成 TaskState 并输出一次最终报告；报告区分实际验证与
  未验证/缺口。当前 report tracker 仅为内存态，崩溃后不自动补发。
- 本轮实现使用的临时 debug instrumentation 已清理，不作为运行能力或验收证据保留。
- 执行绑定具体 `revision + digest`。计划内容变化或执行中触发 replanning 时，旧执行
  绑定立即失效；危险副作用继续使用现有权限确认，不增加整份计划审批 UI。
- 为 HarnessAPI、HarnessEventBus 和 WebSocket 增加 typed plan commands/events，并
  支持 Web/TUI 共享同一 PlanRecord 投影、断线重连和进程恢复。
- Web/TUI 在现有 Chat 流中呈现简短的意图对齐问题和最多三个用户可理解的选项；不增加
  独立计划工作台、计划审批面或模式切换控件。
- Planner 内部授权后，Web/TUI 从持久化 PlanRecord 确定性投影一份全局计划输出，默认
  折叠并位于实时 TODO 之前；展开后呈现目标、已确认约束、唯一选定方案、改动范围、
  执行步骤和验证方式，不重新调用模型总结，也不要求整份计划审批。

### Capabilities

#### New Capabilities

- `interactive-plan-mode`: 定义自主复杂度路由、Planner 进程、RAP-lite 自主规划与
  Chat 意图对齐、PlanStore、revision 执行绑定、恢复与重新规划。
- `agent-task-state`: 定义 Main AgentContext 中的 TaskState、成果粒度 TODO、合法状态
  转换、结构化 blocker、持久化恢复和只读 UI projection。

#### Modified Capabilities

- `agent-as-os-model`: 将 Planner 定义为受 Supervisor 管理的独立前台进程，并保持
  AgentApplication、AgentProcess、Session/TTY、PlanRecord 和执行 Job 的语义边界。
- `agent-tool-filtering`: 将 Plan Mode 的只读能力从工具名黑名单升级为默认拒绝未知
  副作用的 effect metadata 策略。
- `harness-api`: 暴露内部计划查询、意图对齐、执行授权、重新规划和 TaskState 更新端口；
  Web/TUI 只消费只读 projection。
- `harness-event-bus`: 增加 presentation-neutral 的计划生命周期、等待交互和 revision
  事件。
- `websocket-protocol`: 增加 typed plan/task events、独立初始状态同步、CAS 冲突和
  重连恢复契约。
- `web-frontend`: 在现有 Chat 流中增加原生意图对齐、折叠 Plan 和 context-owned TODO；
  内部计划状态不形成独立产品模块，也不写入模型 transcript。
- `tui-execution-hierarchy`: 在现有对话区呈现与 Web 等价的意图对齐、折叠 Plan 和
  context-owned TODO，不增加独立计划面板。

### Impact

- 运行时：`src/application/`、`src/agents/process/`、内部 AgentApplication 资源和
  项目级持久化目录。
- 共享协议：`src/ui/shared/types.ts`、共享 reducer/state projection、
  HarnessEvent discriminated union。
- UI adapters：`src/ui/web/`、`src/ui/tui/`、`web/src/`。
- 测试：PlanStore 原子写、写锁与 version CAS、自主复杂度路由、Planner 能力隔离、
  执行绑定失效、Chat 对齐、恢复/replanning、WebSocket 契约、Web/TUI reducer 与交互。
- 不引入外部规划服务、向量数据库或新的 UI 组件库；运行时不依赖 OpenSpec artifacts。
- M9 自动化与复杂游戏实际 Web/TUI 验收均已通过；Chat-native 对齐原型判定为
  `archive` 并留在 staging，待 change archive 时移动。
