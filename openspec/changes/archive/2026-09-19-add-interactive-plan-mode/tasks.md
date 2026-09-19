实施约束：以下每个 milestone 由新的独立 SubAgent 执行；主 Agent 负责分派、检查证据、运行集成门禁和展示结果，不静默接管 milestone 实现。

## 1. M0 — Plan 领域模型与持久化

- [x] 1.1 定义 `PlanRecord`、独立 `version/revision`、状态、约束、decision node、candidate、PlanItem、approval、pending interaction、command receipt、trajectory event 和 execution binding 类型，并为所有 union 提供穷尽检查。
- [x] 1.2 实现 canonical semantic payload 与 SHA-256 digest，验证 telemetry、时间戳和 Agent progress 不改变 digest。
- [x] 1.3 实现项目级 PlanStore 路径解析、schema 校验、临时文件加 rename 的原子写入和损坏文件隔离。
- [x] 1.4 实现按 planId 的进程内串行队列、跨进程 exclusive lock/stale-lock recovery、`expectedVersion` CAS 和 typed conflict result。
- [x] 1.5 实现 pending interaction 先写入、独立 commandId/payload digest 幂等账本、单次 interaction 消费、同 commandId 不同 payload 拒绝，以及 active Plan receipt 全量保留。
- [x] 1.6 添加 PlanStore 单元测试，覆盖创建、version/revision 分离、多进程并发冲突、锁恢复、写入中断、digest 变化/稳定性、幂等交互和损坏记录。

## 2. M1 — 复杂度路由与副作用门禁

- [x] 2.1 定义 `auto | plan` submission mode、五维 `PlanRouteAssessment` 和集中式阈值策略。
- [x] 2.2 增加 Main Agent 的结构化 route assessment 入口，并允许 assessment 前的只读调查。
- [x] 2.3 在 mutating tool 调度边界实现 `PlanExecutionGuard`，阻止缺失评估或 route 为 Plan 的副作用。
- [x] 2.4 实现显式 Plan 提交绕过 Auto 评估并直接请求 Planner 的路径。
- [x] 2.5 添加路由接受测试，覆盖低复杂度 Direct、高影响/风险/协调强制 Plan、总分阈值、无评估 mutation、assessment/mutation 同批门禁和畸形评估。
- [x] 2.6 为内置、MCP 和动态工具增加 effect metadata，Plan capability 仅允许 read/无副作用 Plan operations，并默认拒绝缺失或 unknown effect。
- [x] 2.7 添加 effect filtering 测试，覆盖名称伪装、MCP read、network/external_write 和 unknown 默认拒绝。

## 3. M2 — Planner Agent Process 与 RAP-lite

- [x] 3.1 添加内部 Planner AgentApplication 资源，固定 `permissionMode: plan` 和只读/计划工具集合。
- [x] 3.2 通过 AgentSupervisor 实现 Planner 创建、Main waiting、TTY 前台交接、Planner waiting 和批准后 Main 恢复。
- [x] 3.3 实现 Planner 计划工具和 `select | investigate | update_constraints | backtrack` action union，用于创建目标/约束、追加候选、记录公开评估和驱动决策。
- [x] 3.4 实现每节点最多 3 个候选、每 revision 最多 6 个 decision nodes 的预算门禁。
- [x] 3.5 实现 Human-in-the-loop 判定：非劣候选、高影响取舍、约束缺失和最终审批必须请求用户。
- [x] 3.6 添加 Planner 隔离与生命周期测试，证明 mutating tool 和嵌套 spawn 被拒绝，Main/Planner 状态与 parent identity 正确。

## 4. M3 — 审批、执行绑定与重新规划

- [x] 4.1 将已选决策轨迹编译为有序 PlanItems、验收条件、effect categories、canonical resource scopes 和副作用摘要。
- [x] 4.2 实现 revision + digest 审批校验、side-effect acknowledgement 记录和语义修改后的审批失效。
- [x] 4.3 实现 Main/SubAgent execution binding；每个副作用工具调用先校验 planId、revision、digest、itemId、effect 和规范化资源范围，再进入现有 tool permission。
- [x] 4.4 实现 Agent/Tool/SubAgent 结果到 PlanItem evidence 的关联，禁止 Agent exit 自动完成 PlanItem。
- [x] 4.5 实现 command/observable evidence 校验和 Host-owned PlanItem 完成判定；`verify_item` 仅作为内部兼容 API 保留，不暴露给新 Plan 的 Main。
- [x] 4.6 实现 material conflict 检测、停止新 item 调度、`needs_replan`、baseRevision 派生和重新审批。
- [x] 4.7 添加 stale approval、权限独立性、evidence/acceptance 分离、in-flight tool settle 和 replanning 测试。
- [x] 4.8 实现 drafting/waiting/approved/needs_replan/executing 的取消语义、终态保护及 blocked/skipped 合法迁移，并添加状态机测试。

## 5. M4 — Harness API、交互端口与领域事件

- [x] 5.1 实现 PlanService，集中承载状态机、CAS、digest、interaction 持久化和事件提交顺序，并在每个已提交 version 后发 `plan:updated`。
- [x] 5.2 在 HarnessAPI 增加只读 Plan snapshot 与 decision、approve、replan、cancel typed operations，所有 mutation 返回 `PlanMutationResult` union。
- [x] 5.3 在 HarnessAPI 保留 typed `verifyItem` 兼容 operation；新 Plan 的 Main Tool evidence 由 PlanService 自动结算。
- [x] 5.4 扩展 UserInteractionPort 的 Plan decision/approval 请求，并确保 pending interaction 先持久化再通知 adapter。
- [x] 5.5 扩展 HarnessEvent discriminated union，加入 route、updated、interaction、approval、execution 和 conflict 事件。
- [x] 5.6 添加 API 和 EventBus 测试，覆盖无 `as any`、commit 后发事件、失败不发成功事件及 payload 不含 presentation/private reasoning。

## 6. M5 — WebSocket 与共享 Plan projection

- [x] 6.1 为 `chat` 增加可选 `planMode`（缺省为 Auto），并加入四种 action 的 `plan_decision`、`plan_approve`、`plan_replan` 和 `plan_cancel`；所有 mutation 使用 expectedVersion 和 commandId。
- [x] 6.2 扩展 `ServerEvent`，加入 `plan_state`、`plan_interaction` 和 `plan_conflict`。
- [x] 6.3 在 Web backend 中把 typed commands 映射到 HarnessAPI，并把 Plan domain events 映射为 server events。
- [x] 6.4 实现连接、Session 切换和恢复后的 active Plan 与 pending interaction 全量同步。
- [x] 6.5 新增独立 `PlanViewState` reducer，保证 Plan 状态不进入 `UIMessage[]` 或 conversation transcript。
- [x] 6.6 添加协议和 reducer 测试，覆盖既有 wire variant 兼容、四种 decision action、payload digest 幂等、stale version/revision conflict、Session 清理和重连恢复。

## 7. M6 — Web Chat 原生意图对齐

> 原 Web Plan 工作台方案在用户验收中被否决。既有未提交实现不满足以下标准，不得作为 M6 候选提交。

- [x] 7.1 删除 composer 的 `Auto / Plan` 控件、Plan workbench 挂载点和专用样式；保留单一 Chat 输入、正常 Tool UI、Stop 和 permission interaction。
- [x] 7.2 将 Planner policy 改为自主选择技术候选、调查深度、回溯和重新规划；只有缺失且会改变用户可见结果的价值判断才能创建 pending interaction。
- [x] 7.3 将整份 Plan 审批转换为内部 revision + digest 执行授权；标准 Web/TUI adapter 不发送 `plan_approve`，受保护副作用继续进入现有 permission policy。
- [x] 7.4 将 persisted user-value interaction 投影为 Chat 内联对齐项：一句问题、可选推荐、最多三个用户可理解选项和自定义输入。
- [x] 7.5 以 typed、幂等 interaction response 提交选择或自定义内容并写为显式约束；重连和 Session 切换后只恢复一次当前 pending alignment。
- [x] 7.6 保持原始 PlanRecord、routing scores、revision、digest、PlanItem 内部字段、候选树、Agent evidence 和 hidden reasoning 不进入可见 Chat transcript 或独立 UI。
- [x] 7.7 移除独立“正在准备规划”状态；等待期间使用现有 Chat activity 与 Stop，并在 unresolved alignment 存在时阻止副作用工具。
- [x] 7.8 添加 Planner autonomy、内部 authorization、interaction persistence、Chat reducer/component、恢复、权限独立性和回归测试。
- [x] 7.9 对照 `docs/prototypes/archive/2026-09-20-add-interactive-plan-mode/add-interactive-plan-mode-chat-alignment.html` 完成浏览器验收：未指定风格的俄罗斯方块、充分指定请求、自定义方向、技术路径自主选择、现有权限提示、light/dark、桌面、移动和 `1080x322`。
- [x] 7.10 修复高用户意图不确定性被低操作复杂度覆盖的路由缺口；保持明确视觉约束请求 Direct，并保持纯技术方案分歧自治。
- [x] 7.11 隐藏路由、工具发现和 Agent 编排工具的 Chat 实现细节；任何未消除的用户意图不确定性均路由到内联对齐。
- [x] 7.12 为缺少视觉方向的用户可见产物创建请求增加 Host 意图下限，覆盖短 brief、明确视觉方向和既有产物修复，并在真实 Workbuddy `dist` 进程中复验。
- [x] 7.13 修复 Main → Planner handoff 的假空闲状态：保留通用 Processing 与 Stop，pending interaction 期间保持主输入禁用并使用内联控件，且不展示 Planner 内部工具。
- [x] 7.14 在 Main response 与 Planner 启动之间显示 `Waiting...`，增加 `进入 Planning Mode` 时间线标记，在 active Plan 的 Session 恢复时重新投影，并保证等待计时持续递增。
- [x] 7.15 将每次已提交的用户对齐选择记录为可恢复、可去重的 Chat 用户条目；Planner 授权 Plan/TODO 后自动 continuation Main 执行并逐项验收，不等待新消息。
- [x] 7.16 暴露受领域规则约束的 `plan_select_decision`，使 Planner 在用户价值对齐后自主选择技术候选并继续 compile/authorize，避免 open 技术决策阻塞执行交接。
- [x] 7.17 将已编译 PlanItem 投影为 Chat 内联 TODO 并随持久化状态实时更新；隐藏全部内部 Plan 控制工具，派生 revision 仅显示“正在调整执行计划”而不重复插入 Planning Mode 标记。
- [x] 7.18 在 Planning 与 Act TODO 之间投影稳定的“计划已生成 / 执行计划已更新”结果标记，并过滤 Session 标题与预览中的内部 continuation。
- [x] 7.19 WebSocket 断开时禁止提交并保留草稿；仅在命令成功写入已连接 Socket 后进入 Processing 和清空输入。
- [x] 7.20 隐藏 `verify_item` 实时与回放记录，并明确验收证据 ID 格式及逐条件唯一约束，避免内部拒绝被误认为用户 Deny。
- [x] 7.21 在 Main 尝试提前结束但 PlanItem 尚未完成时由 Host 先结算持久化 acceptance，再在同一 processing 生命周期内自动续跑；只有验收仍未满足且无状态推进时才有界停止并保留/阻塞 TODO。
- [x] 7.22 增加纯函数 public Plan projection：从内部授权的 PlanRecord 生成目标、已确认约束、唯一选定方案、范围、执行步骤和验证方式，过滤候选树、内部 ID、revision、digest、grants、evidence 和 hidden reasoning，禁止额外模型调用。
- [x] 7.23 在 Web Chat 中将全局计划输出置于唯一 TODO 之前并默认折叠；折叠头显示标题、任务数和状态，展开控件满足键盘与 `aria-expanded` 语义。
- [x] 7.24 保证 `plan_state + plan_ready` 在 Main execution continuation 前发布；replan 期间保留最后授权输出，新 revision 授权后原子替换同一输出和 TODO，不展示 drafting 中间态。
- [x] 7.25 覆盖首次授权、默认折叠、展开内容、唯一性、Plan→TODO 顺序、终态恢复、Session 切换、replan 替换、隐藏字段和窄视口测试。
- [x] 7.26 修订并浏览器验证 `docs/prototypes/archive/2026-09-20-add-interactive-plan-mode/add-interactive-plan-mode-chat-alignment.html` 的计划输出场景，覆盖折叠/展开、light/dark、桌面、移动和 `1080x322`。
- [x] 7.27 修复 command acceptance 与执行授权脱节：编译期派生最小 `process` grant、拒绝复合 shell criterion，并约束 Main 逐项原样执行和验收。
- [x] 7.28 将 Main 聚合 command criteria 形成的复合 Bash 作为可重试格式错误拒绝，保留当前执行授权并返回逐条原样执行提示，避免无意义 replan。
- [x] 7.29 在 live 与 Session 回放中隐藏可重试 `invalid_command` Bash 纠偏行，同时保留真实命令失败、Plan scope 冲突和逐条验收结果。
- [x] 7.30 将越界调用拒绝与 material conflict 分离：Guard 继续阻止未授权 effect/scope，但仅由 Main 显式报告已批准路径不可行时进入 replan，避免诊断命令清空当前 item binding。
- [x] 7.31 在首次授权前校验 acceptance 可执行性：observable 必须绑定 Main 当前可用的具体 Tool，运行时只接受该 Tool 的成功 evidence；缺少能力的观察不得成为执行项，由 Agent 运行可用 smoke 并在交付时报告 evidence gap。
- [x] 7.32 保证每个 Tool 调用的 execution lifecycle 独立配对：仅已登记 in-flight 的调用可 settle/release，read evidence 不得提前释放并发副作用 Tool 的取消等待。
- [x] 7.33 为 approval 提交后的 Planner completion、Main attach 与 continuation 增加可恢复补偿；协调失败不得留下无法执行且无恢复路径的 `approved` Plan。
- [x] 7.34 在 `cancelled`/`failed` 清除 authorization 后保留最近授权的 Plan 展示快照，并用最新终态 PlanItem 状态更新唯一 TODO；重连后结果一致。
- [x] 7.35 Session 重绑时原子清除 Main 的旧 `activePlan`/`planBinding`，再仅从目标 Session 的 PlanStore 对账恢复，禁止跨 Session 继承执行授权。
- [x] 7.36 仅在 intent alignment command 成功写入开放 WebSocket 后进入 busy；发送失败保留可操作交互并允许连接恢复后重试。

## 8. M7 — TUI Chat 原生意图对齐

- [x] 8.1 保持单一 TUI Chat 输入，不增加 `Auto / Plan` 模式、独立 Plan 页面或 Plan/Execution 导航。
- [x] 8.2 将用户价值判断作为对话内联交互，支持方向键选择、Enter 确认、Esc 返回和自由文本补充。
- [x] 8.3 复用 public Plan projection，在 TODO 前显示默认折叠的全局计划输出；Enter 切换展开，replan 和恢复只保留一个当前授权输出。
- [x] 8.4 技术规划继续由 Agent 自主完成；受保护副作用沿用现有 permission interaction，不增加整份 Plan 审批。
- [x] 8.5 实现 Session 切换、重连后的 pending alignment 与授权 Plan 输出恢复及旧 Session 清理。
- [x] 8.6 添加 TUI reducer、键盘、焦点、折叠/展开、窄终端和恢复测试，并用交互式 TUI 验收关键路径。

## 9. M8 — 恢复、安全与集成验收

- [x] 9.1 实现启动和 Session 恢复时的 PlanStore/Process Table 对账，覆盖 Planner 重启和 pending interaction 重发。
- [x] 9.2 对无法安全恢复的 approved/executing Plan 转入 `needs_replan`，禁止自动继续副作用。
- [x] 9.3 添加序列化边界检查，证明 PlanStore、events、WebSocket 和 UI 不含 hidden prompt 或 Chain-of-Thought。
- [x] 9.4 实现终态 Plan 的统一 recovery TTL retention，在保留期内不单独淘汰 command receipts。
- [x] 9.5 运行 `npm run typecheck`、相关 Vitest suites、`npm test` 和 architecture checks，并修复本 change 引入的失败。
- [x] 9.6 对照全部 capability scenarios 完成端到端验收：自主 Direct/内部 Plan 路由、Chat 原生意图对齐、默认折叠全局计划输出、Plan/TODO 分离、技术路径自主选择、内部执行绑定、effect scope 扩张阻止、现有权限提示、执行、取消、失败、replanning、重启与 Web/TUI 一致性。
- [x] 9.7 将 `prototype.md` 中每个 `pending` retention 决策更新为 `archive` 或 `delete`；执行对应移动/删除和断链检查。
- [x] 9.8 修复执行 incident 错误升级为 semantic replan：编译期拒绝不安全的 `grep` acceptance，结构化约束 `plan_report_conflict` 的当前 Main、revision/digest/item、hard constraint/selected decision 和成功客观 evidence，并覆盖失败验收、权限拒绝与有效 material conflict 回归。
- [x] 9.9 首次阻止纯人工 PlanItem/TODO，并通过真实双项 Plan 形态回归暴露混合 command + human criterion 仍可绕过的剩余边界。
- [x] 9.10 修正 9.9 的不完整边界：新 Plan 编译期拒绝任何单独或混合的 `human` criterion；该修复进一步暴露“实现阶段/验证阶段仍被当作多个 TODO”与模型负责验收结算的问题。
- [x] 9.11 将 PlanItem 重定义为独立交付物：拒绝共享 workspace-write scope 的实现阶段和只验证前序产物的独立项；command/observable evidence 满足后由 Host 自动完成 item，并从 Main 工具面移除 `verify_item`，覆盖充分证据不再 stall/blocked 的回归。
- [x] 9.12 在 Planner decision 持久化边界强制恰好一个 `recommended` candidate，拒绝零个或多个推荐项，保证 Web/TUI 对齐始终显示明确推荐。

## 10. M9 — Context-owned Todo List

> M9 取代 9.11 中“PlanItem 是独立交付物并直接投影为 TODO”的领域定义。9.11 的
> `verify_item` 移除和 Host-owned 结构化验证结论仍保留；Plan 执行状态不再充当
> Agent 当前任务状态。

- [x] 10.1 引入 Plan schema v2，将 immutable `PlanExecutionStep` 与 mutable `PlanExecutionState` 分离；旧 schema v1 `PlanItem` 只读兼容，历史记录不原地重写。
- [x] 10.2 在 Main AgentContext 中增加版本化 `TaskState`、稳定 `TodoItem` identity、结构化 blocker 和原子持久化恢复；Direct 与 Plan 路径共用同一模型。
- [x] 10.3 增加 Main-only typed TaskState mutations，覆盖初始化、增补、修订、拆分、合并、重排、状态转换、跳过和重开，并用 expected version 拒绝陈旧写入。
- [x] 10.4 将新 Plan 的 command verification 改为结构化 matcher：`exitCode` 必填，stdout 仅支持显式 `contains | equals | regex`；旧自由文本 expected output 只读兼容。
- [x] 10.5 调整执行与 continuation：Tool、SubAgent、Plan verification 和回合结束不直接改写 TodoItem；预算耗尽保留 `in_progress`，只有结构化外部依赖可进入 `blocked`。
- [x] 10.6 扩展 HarnessAPI 与 HarnessEventBus 的 TaskState typed port 和 `task:updated` 事件，保证 Main context 成功提交后才发布不可变快照。
- [x] 10.7 增加独立 `task_state` WebSocket 同步与共享 reducer slice，覆盖连接、Session 切换、乱序事件、陈旧 version、Direct 无 Plan 和终态恢复。
- [x] 10.8 更新 Web/TUI projection：Plan 标题不显示任务数；TODO 只消费 TaskState，可展示结果和外部 blocker，并保持 Plan 在 TODO 之前。
- [x] 10.9 添加 schema migration、mutation 状态机、结构化 matcher、Plan/TaskState/Runtime 隔离、blocked 语义、恢复和 Web/TUI 一致性测试。
- [x] 10.10 将 route assessment 的 unresolved user-value requirements 持久化为 schema v2 可选 `alignmentRequirements`；Host 为缺少明确视觉方向的 creative creation 注入 visual requirement，Planner 每次 human interaction 只清除一个匹配 requirement，compile/authorize 拒绝 pending requirements，并保持 schema v1/缺字段 v2 与既有 digest 兼容。
- [x] 10.11 在 `plan_start_item` 写 execution binding 前强制 owning Main 已有同 Session、active 且 `sourcePlan.planId/revision/digest` 完全匹配的 TaskState；缺失或不匹配时要求 `task_update initialize`，禁止从 PlanExecutionStep 投影 TODO。
- [x] 10.12 增加 completed 后的独立 report phase：清除 Main/SubAgent binding 并终止绑定 SubAgent但保留 Main，隐藏 execution narration，先结算 TaskState outcomes，再输出一次包含交付、实际验证和未验证/缺口的可见报告；report phase 禁止新 Plan side effects，cancelled/failed 仍终止 Main，并记录 tracker 暂为内存态。
- [x] 10.13 用复杂游戏任务完成实际 Web 与 TUI 验收，确认 TODO 以可观察成果而非文件、实现阶段、命令、测试或人工验收分项；全部检查通过后再更新 prototype retention。
