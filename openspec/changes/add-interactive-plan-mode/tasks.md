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

- [ ] 4.1 将已选决策轨迹编译为有序 PlanItems、验收条件、effect categories、canonical resource scopes 和副作用摘要。
- [ ] 4.2 实现 revision + digest 审批校验、side-effect acknowledgement 记录和语义修改后的审批失效。
- [ ] 4.3 实现 Main/SubAgent execution binding；每个副作用工具调用先校验 planId、revision、digest、itemId、effect 和规范化资源范围，再进入现有 tool permission。
- [ ] 4.4 实现 Agent/Tool/SubAgent 结果到 PlanItem evidence 的关联，禁止 Agent exit 自动完成 PlanItem。
- [ ] 4.5 实现仅允许绑定 Main 调用的 `verify_item`、command/observable/human criteria 校验、human receipt 引用和 PlanItem 完成判定。
- [ ] 4.6 实现 material conflict 检测、停止新 item 调度、`needs_replan`、baseRevision 派生和重新审批。
- [ ] 4.7 添加 stale approval、权限独立性、evidence/acceptance 分离、in-flight tool settle 和 replanning 测试。
- [ ] 4.8 实现 drafting/waiting/approved/needs_replan/executing 的取消语义、终态保护及 blocked/skipped 合法迁移，并添加状态机测试。

## 5. M4 — Harness API、交互端口与领域事件

- [ ] 5.1 实现 PlanService，集中承载状态机、CAS、digest、interaction 持久化和事件提交顺序，并在每个已提交 version 后发 `plan:updated`。
- [ ] 5.2 在 HarnessAPI 增加只读 Plan snapshot 与 decision、approve、replan、cancel typed operations，所有 mutation 返回 `PlanMutationResult` union。
- [ ] 5.3 在 HarnessAPI 增加携带 Main caller identity、acceptance results 和 evidence references 的 `verify_item` operation。
- [ ] 5.4 扩展 UserInteractionPort 的 Plan decision/approval 请求，并确保 pending interaction 先持久化再通知 adapter。
- [ ] 5.5 扩展 HarnessEvent discriminated union，加入 route、updated、interaction、approval、execution 和 conflict 事件。
- [ ] 5.6 添加 API 和 EventBus 测试，覆盖无 `as any`、commit 后发事件、失败不发成功事件及 payload 不含 presentation/private reasoning。

## 6. M5 — WebSocket 与共享 Plan projection

- [ ] 6.1 为 `chat` 增加可选 `planMode`（缺省为 Auto），并加入四种 action 的 `plan_decision`、`plan_approve`、`plan_replan` 和 `plan_cancel`；所有 mutation 使用 expectedVersion 和 commandId。
- [ ] 6.2 扩展 `ServerEvent`，加入 `plan_state`、`plan_interaction` 和 `plan_conflict`。
- [ ] 6.3 在 Web backend 中把 typed commands 映射到 HarnessAPI，并把 Plan domain events 映射到 server events。
- [ ] 6.4 实现连接、Session 切换和恢复后的 active Plan 与 pending interaction 全量同步。
- [ ] 6.5 新增独立 `PlanViewState` reducer，保证 Plan 状态不进入 `UIMessage[]` 或 conversation transcript。
- [ ] 6.6 添加协议和 reducer 测试，覆盖既有 wire variant 兼容、四种 decision action、payload digest 幂等、stale version/revision conflict、Session 清理和重连恢复。

## 7. M6 — Web Plan 工作台

- [ ] 7.1 按 HTML 原型在 composer 实现 `Auto / Plan` segmented control，并保持现有输入、停止和快捷命令行为。
- [ ] 7.2 实现候选决策视图，显示最多三个候选、证据、风险、成本、可逆性和推荐；复杂度路由不形成独立 UI，Direct 请求无额外提示，Plan 请求直接进入首个用户交互状态。
- [ ] 7.3 实现候选键盘/指针选择、深入调查、修改约束与回溯操作，并发送 typed commands。
- [ ] 7.4 实现执行清单和审批面，展示 semantic revision、digest 摘要、验收条件、effect categories 与 canonical resource scopes，并在 acknowledgement 前禁用批准。
- [ ] 7.5 实现 PlanItem 与 Agent evidence 分区、revision conflict、重新规划、完成、取消和失败状态。
- [ ] 7.6 使用现有 `--color-*` tokens 完成 light/dark 与响应式样式，确保窄屏单一滚动区和 composer 不遮挡操作。
- [ ] 7.7 添加 Web reducer/component 测试，并在常规桌面、移动宽度和 `1080x322` 视口完成浏览器交互与控制台验收。

## 8. M7 — TUI Plan 交互

- [ ] 8.1 在 TUI input footer 增加共享 `Auto / Plan` 模式状态和切换操作。
- [ ] 8.2 实现底部 decision panel，支持方向键选择、Enter 确认、Esc 返回、深入调查、约束修改和回溯。
- [ ] 8.3 实现底部 approval panel，展示执行项与副作用，并要求显式 acknowledgement。
- [ ] 8.4 实现独立 Plan summary，把 PlanItem 验收状态与 Turn/Execution/Tool inspector 分离并支持 evidence 跳转。
- [ ] 8.5 实现 Session 切换、重连和 revision conflict 后的 TUI 状态恢复与清理。
- [ ] 8.6 添加 TUI reducer、键盘交互、焦点、窄终端和恢复测试，并用交互式 TUI 验收关键路径。

## 9. M8 — 恢复、安全与集成验收

- [ ] 9.1 实现启动和 Session 恢复时的 PlanStore/Process Table 对账，覆盖 Planner 重启和 pending interaction 重发。
- [ ] 9.2 对无法安全恢复的 approved/executing Plan 转入 `needs_replan`，禁止自动继续副作用。
- [ ] 9.3 添加序列化边界检查，证明 PlanStore、events、WebSocket 和 UI 不含 hidden prompt 或 Chain-of-Thought。
- [ ] 9.4 实现终态 Plan 的统一 recovery TTL retention，在保留期内不单独淘汰 command receipts。
- [ ] 9.5 运行 `npm run typecheck`、相关 Vitest suites、`npm test` 和 architecture checks，并修复本 change 引入的失败。
- [ ] 9.6 对照全部 capability scenarios 完成端到端验收：Direct、forced Plan、四种决策 action、审批、effect scope 扩张阻止、执行、取消、失败、冲突、replanning、重启与 Web/TUI 一致性。
- [ ] 9.7 将 `prototype.md` 中每个 `pending` retention 决策更新为 `archive` 或 `delete`；执行对应移动/删除和断链检查。
