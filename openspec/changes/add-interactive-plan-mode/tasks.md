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
- [x] 4.5 实现仅允许绑定 Main 调用的 `verify_item`、command/observable/human criteria 校验、human receipt 引用和 PlanItem 完成判定。
- [x] 4.6 实现 material conflict 检测、停止新 item 调度、`needs_replan`、baseRevision 派生和重新审批。
- [x] 4.7 添加 stale approval、权限独立性、evidence/acceptance 分离、in-flight tool settle 和 replanning 测试。
- [x] 4.8 实现 drafting/waiting/approved/needs_replan/executing 的取消语义、终态保护及 blocked/skipped 合法迁移，并添加状态机测试。

## 5. M4 — Harness API、交互端口与领域事件

- [x] 5.1 实现 PlanService，集中承载状态机、CAS、digest、interaction 持久化和事件提交顺序，并在每个已提交 version 后发 `plan:updated`。
- [x] 5.2 在 HarnessAPI 增加只读 Plan snapshot 与 decision、approve、replan、cancel typed operations，所有 mutation 返回 `PlanMutationResult` union。
- [x] 5.3 在 HarnessAPI 增加携带 Main caller identity、acceptance results 和 evidence references 的 `verify_item` operation。
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
- [x] 7.6 保持 PlanRecord、routing scores、revision、digest、PlanItem、候选树、Agent evidence 和 hidden reasoning 不进入可见 Chat transcript 或独立 UI。
- [x] 7.7 移除独立“正在准备规划”状态；等待期间使用现有 Chat activity 与 Stop，并在 unresolved alignment 存在时阻止副作用工具。
- [x] 7.8 添加 Planner autonomy、内部 authorization、interaction persistence、Chat reducer/component、恢复、权限独立性和回归测试。
- [x] 7.9 对照 `docs/prototypes/add-interactive-plan-mode-chat-alignment.html` 完成浏览器验收：未指定风格的俄罗斯方块、充分指定请求、自定义方向、技术路径自主选择、现有权限提示、light/dark、桌面、移动和 `1080x322`。
- [x] 7.10 修复高用户意图不确定性被低操作复杂度覆盖的路由缺口；保持明确视觉约束请求 Direct，并保持纯技术方案分歧自治。
- [x] 7.11 隐藏路由、工具发现和 Agent 编排工具的 Chat 实现细节；任何未消除的用户意图不确定性均路由到内联对齐。
- [x] 7.12 为缺少视觉方向的用户可见产物创建请求增加 Host 意图下限，覆盖短 brief、明确视觉方向和既有产物修复，并在真实 Workbuddy `dist` 进程中复验。
- [x] 7.13 修复 Main → Planner handoff 的假空闲状态：保留通用 Processing 与 Stop，pending interaction 期间保持主输入禁用并使用内联控件，且不展示 Planner 内部工具。
- [x] 7.14 在 Main response 与 Planner 启动之间显示 `Waiting...`，增加 `进入 Planning Mode` 时间线标记，在 active Plan 的 Session 恢复时重新投影，并保证等待计时持续递增。
- [x] 7.15 将每次已提交的用户对齐选择记录为可恢复、可去重的 Chat 用户条目；Planner 授权 Plan/TODO 后自动 continuation Main 执行并逐项验收，不等待新消息。
- [x] 7.16 暴露受领域规则约束的 `plan_select_decision`，使 Planner 在用户价值对齐后自主选择技术候选并继续 compile/authorize，避免 open 技术决策阻塞执行交接。
- [x] 7.17 将已编译 PlanItem 投影为 Chat 内联 TODO 并随持久化状态实时更新；隐藏全部 `plan_*` 与 `verify_item` 控制工具，派生 revision 仅显示“正在调整执行计划”而不重复插入 Planning Mode 标记。
- [x] 7.18 在 Planning 与 Act TODO 之间投影稳定的“计划已生成 / 执行计划已更新”结果标记，并过滤 Session 标题与预览中的内部 continuation。
- [x] 7.19 WebSocket 断开时禁止提交并保留草稿；仅在命令成功写入已连接 Socket 后进入 Processing 和清空输入。
- [x] 7.20 隐藏 `verify_item` 实时与回放记录，并明确验收证据 ID 格式及逐条件唯一约束，避免内部拒绝被误认为用户 Deny。
- [x] 7.21 在 Main 尝试提前结束但 PlanItem 尚未完成时由 Host 在同一 processing 生命周期内自动续跑；无状态推进时有界停止并保留/阻塞 TODO，且唯一 TODO 清单跟随最新 Chat 内容、完成及 Session 恢复后不消失。

## 8. M7 — TUI Chat 原生意图对齐

- [ ] 8.1 保持单一 TUI Chat 输入，不增加 `Auto / Plan` 模式或独立 Plan summary。
- [ ] 8.2 将用户价值判断作为对话内联交互，支持方向键选择、Enter 确认、Esc 返回和自由文本补充。
- [ ] 8.3 技术规划继续由 Agent 自主完成；受保护副作用沿用现有 permission interaction，不增加整份 Plan 审批。
- [ ] 8.4 实现 Session 切换、重连后的 pending alignment 恢复与旧 Session 清理。
- [ ] 8.5 添加 TUI reducer、键盘、焦点、窄终端和恢复测试，并用交互式 TUI 验收关键路径。

## 9. M8 — 恢复、安全与集成验收

- [ ] 9.1 实现启动和 Session 恢复时的 PlanStore/Process Table 对账，覆盖 Planner 重启和 pending interaction 重发。
- [ ] 9.2 对无法安全恢复的 approved/executing Plan 转入 `needs_replan`，禁止自动继续副作用。
- [ ] 9.3 添加序列化边界检查，证明 PlanStore、events、WebSocket 和 UI 不含 hidden prompt 或 Chain-of-Thought。
- [ ] 9.4 实现终态 Plan 的统一 recovery TTL retention，在保留期内不单独淘汰 command receipts。
- [ ] 9.5 运行 `npm run typecheck`、相关 Vitest suites、`npm test` 和 architecture checks，并修复本 change 引入的失败。
- [ ] 9.6 对照全部 capability scenarios 完成端到端验收：自主 Direct/内部 Plan 路由、Chat 原生意图对齐、技术路径自主选择、内部执行绑定、effect scope 扩张阻止、现有权限提示、执行、取消、失败、replanning、重启与 Web/TUI 一致性。
- [ ] 9.7 将 `prototype.md` 中每个 `pending` retention 决策更新为 `archive` 或 `delete`；执行对应移动/删除和断链检查。
