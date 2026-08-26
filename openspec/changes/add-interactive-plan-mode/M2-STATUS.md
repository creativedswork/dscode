# M2 Status - Planner Agent Process 与 RAP-lite

## State

`COMMITTED`

M2 tasks 3.1-3.6 已实现。最终独立 reviewer 已确认无 BLOCKER/HIGH，M2 可进入人工
验收。此前报告的 1 BLOCKER、2 HIGH、1 MEDIUM、1 LOW 已逐项完成根因修复并通过
确定性回归。用户已在 can-dev-loop 确认弹窗选择“通过并提交”，授权提交 M2 并进入
M3；M2 提交仅包含 File Ownership 列出的 35 个文件，未 push，M3 实现尚未开始。

## Scope

- 注册不可被用户同名定义覆盖的内部 `planner` AgentApplication，固定
  `permissionMode: plan`、`tools: ["*"]` 和无 memory/skills profile。
- 在 Runtime/worktree/process 创建前原子取得 Session foreground reservation；同 Main
  并发启动幂等返回同一 Planner handle，原始并发 spawn 则拒绝第二个 claim。
- Planner 所有退出统一提交 Plan 终态、清理 interaction waiter，并恢复 Main 与 TTY；
  未批准的 normal/model failure 为 `failed`，abort/shutdown 为 `cancelled`。
- 将 M1 `planner_requested` 接到真实 Planner process，并在启动前创建项目级 PlanRecord。
- 增加 Planner domain tools：目标/约束初始化、候选追加、公开事实记录、决策请求和最终
  审批请求。工具仅对 Planner 可见，使用 side-effect-free Plan operation metadata。
- 增加 `select | investigate | update_constraints | backtrack` action union；显式 action
  通过 PlanStore command receipt、payload digest 和 expectedVersion CAS 幂等提交。
- 在 PlannerService 和持久化 schema 双层限制每节点 1-3 candidates、每 revision 最多
  6 decision nodes；超限显式返回 `clarify | commit`，不截断。
- 仅依据公开候选字段判断非劣候选、高影响取舍和约束缺失；最终审批始终持久化 interaction
  并保持 Planner waiting。
- 项目切换先终止旧 Planner 并写回旧项目，再用不可变 PlanStore 重绑定新项目；旧 Runtime
  持有旧 service，不能把旧 Plan 写入新项目。
- Session 切换在 Main rebind 前同步等待活动 Planner shutdown/exit cleanup，保证 Main
  恢复 running、新 TTY 归 Main、旧 TTY 不再指向退出 Planner。
- HITL 在 `PlannerService.applyDecision` 提交点强制执行；仅低影响、约束完整的单候选
  可无 interaction 自动选择。
- interaction waiter 在持久化调用前注册；CAS 失败或无需交互时立即撤销，resolve/reject
  均可在 service 返回前单次消费且不泄漏。
- Planner mutation 的 CAS updater 同时校验 active identity 与允许状态；Coordinator
  decision 入口只信任活动 binding，不从 PlanRecord 回退身份。
- 当前 revision 最多保留 6 个节点；回溯保留 target 及之前路径，仅重开 target，并在
  trajectory 中记录全部被移除的后续 decision IDs。

## Non-Goals

- M3 revision+digest 审批校验、effect/resource execution binding、PlanItem 验收、
  replanning 和取消状态机。
- M4 HarnessAPI、UserInteractionPort 扩展和 Plan 领域事件。
- WebSocket、Web、TUI、恢复对账和 retention。
- prototype retention、consolidate、commit、push、PR 或 UI/视觉流程。

## File Ownership

生产文件：

- `src/agents/process/{foreground,spawner,supervisor,context,types}.ts`
- `src/application/{agent-runtime-coordinator,harness,project-coordinator,session-coordinator}.ts`
- `src/application/plan/{index,planner-actions,planner-application,planner-interactions,planner-policy,planner-process,planner-service,planner-tools,planner-types,schema,schema-parts,store}.ts`
- `src/kernel/tool-effects.ts`

测试文件：

- `tests/agents/process/supervisor.test.ts`
- `tests/application/coordinators.test.ts`
- `tests/application/plan/{harness-planner-exit,harness-routing,planner-final-review,planner-invariants,planner-lifecycle,planner-process-races,planner-project,planner-service,planner-tools}.test.ts`

控制文档：

- `openspec/changes/add-interactive-plan-mode/tasks.md`
- `openspec/changes/add-interactive-plan-mode/M2-STATUS.md`

## Automated Evidence

- M2 最终定向套件覆盖 Planner service/tools/lifecycle/races/project、真实 Harness
  normal/failure/abort、PlanStore interaction、Supervisor/effect filtering、Session
  与 Project coordinator：17 files、94 tests 全部通过。
- 核心 Session/race/backtrack 套件连续运行 5 轮，每轮 3 files、14 tests 全部通过；
  resolve-before-return 与 reject-before-return 使用 Promise barrier，无 sleep。
- 低并发全量：118 files、933 tests 通过，1 个需 live vision 环境的测试跳过。默认高并发
  首轮仅 `removed-paths` 固定 5 秒扫描超时；该文件独立 2/2 通过，低并发全量通过。
- `npm run typecheck`：通过。
- `npm run architecture:check`：通过，0 migration baseline entries。
- `./node_modules/.bin/openspec validate add-interactive-plan-mode --strict`：通过。
- `git diff --check`：通过。
- OpenSpec apply 回读：schema `spec-driven-plus`，19/59 complete，3.1-3.6 checked。
- 本轮新增/拆分的 M2 TypeScript 模块与测试均不超过 300 行；既有聚合入口
  `harness.ts` 仅增加 Session settle 接线，未在 M2 扩大重构范围。
- 按 Owner 收口要求未重复运行全量 `npm test`；M2 相关跨层路径由上述 17-file 套件覆盖。

## Reviewer Finding Closure

1. **BLOCKER Session switch**：SessionCoordinator 在 Main rebind 前同步 settle Planner；
   活动 Planner 切换测试证明 Main 不永久 waiting、旧 TTY 清空、shutdown 无 parent
   Session 错误。restore 异常路径仍通过双层 finally 清理 binding/waiter/start/exits map。
2. **HIGH lost-wakeup**：decision/approval tool 在 interaction 可见前预注册 waiter；
   CAS 失败/无需 interaction 时撤销。确定性 barrier 覆盖 resolve-before-wait 与
   reject-before-wait，保持单消费和无泄漏。
3. **HIGH stale Planner**：Coordinator 只接受仍存活的 active binding；Service 的 CAS
   updater 同时校验 Planner identity 与 drafting/awaiting 状态，测试证明 `failed`
   before/after 不变。
4. **MEDIUM backtrack**：`d0,d1,d2... -> backtrack(d1)` 保留已选 `d0` 与重开的 `d1`，
   移除后续节点并记录完整 ID 列表；当前 revision 预算按保留节点准确计算。
5. **LOW exits map**：settled exit promise 在 finally 中删除；重复 exit/shutdown 幂等。

## Final Reviewer Conclusion

- 最终独立 reviewer 未发现 BLOCKER/HIGH，结论为 M2 可进入人工验收。
- 没有需要在人工验收前继续修改生产代码或测试的未关闭问题。
- 17 files、94 tests 全部通过；核心竞态套件连续 5 轮、每轮 3 files、14 tests
  全部通过。
- `npm run typecheck`、`npm run architecture:check`、OpenSpec strict validation 和
  `git diff --check` 全部通过。
- M3 审批、执行绑定与重新规划尚未开始，也不属于本次验收范围。

## Acceptance Coverage

- Planner application 为 internal、plan mode、无用户 memory，普通 Agent 无法获得
  Planner-only tools。
- mutating、network、unknown、external write 和 nested spawn 均不在 Planner
  capability；read 与 side-effect-free Plan tools 可用。
- Main 与 Planner 的 running/waiting、parentAgentId、parentSessionId、唯一 foreground
  owner 和进程快照一致。
- 显式 Plan 不调用 Main 模型，返回前已创建 Supervisor-backed Planner。
- pending interaction、waiting 状态与 trajectory 原子落盘；waiter 在调用前预注册以避免
  resolve/reject lost-wakeup，decision receipt 消费后恢复。
- select/investigate/update_constraints/backtrack 可持久化并幂等重放。
- 1-3 candidate 和当前 revision 6-node 上限在 service/schema 双层执行；回溯后预算重置。
- 非劣候选、高影响取舍、约束缺失和最终审批触发 HITL。
- Planner identity 更换后，旧 Planner 写入被拒绝。

## Manual Acceptance

M2 是纯逻辑，无视觉验收，也不需要真实 LLM/provider。

1. 运行核心竞态验收：

   ```bash
   for run in 1 2 3 4 5; do
     npx vitest run \
       tests/application/plan/planner-final-review.test.ts \
       tests/application/plan/planner-process-races.test.ts \
       tests/application/plan/planner-invariants.test.ts \
       --reporter=verbose --testTimeout=15000 || exit 1
   done
   ```

   预期每轮 3 files、14 tests 全部通过。用例应证明：并发 start 只产生一个 Planner，
   第二个原始 foreground claim 被拒绝；Main/Planner waiting 与 foreground 唯一；
   normal/failure/abort/shutdown/session switch 均清理 binding、waiter 和 foreground；
   pending/waiting/trajectory 原子提交且 resolve/reject 无 lost-wakeup；HITL 不能在
   mutation 边界绕过；stale Planner 不能复活或修改终态 Plan。

2. 运行其余 M2 行为与门禁：

   ```bash
   npx vitest run \
     tests/agents/process/capability.test.ts \
     tests/agents/process/context.test.ts \
     tests/agents/process/effect-filtering.test.ts \
     tests/agents/process/supervisor.test.ts \
     tests/application/plan/harness-planner-exit.test.ts \
     tests/application/plan/harness-routing-boundary.test.ts \
     tests/application/plan/harness-routing.test.ts \
     tests/application/plan/interaction.test.ts \
     tests/application/plan/planner-final-review.test.ts \
     tests/application/plan/planner-invariants.test.ts \
     tests/application/plan/planner-lifecycle.test.ts \
     tests/application/plan/planner-process-races.test.ts \
     tests/application/plan/planner-project.test.ts \
     tests/application/plan/planner-service.test.ts \
     tests/application/plan/planner-tools.test.ts \
     tests/application/plan/route.test.ts \
     tests/application/plan/store.test.ts \
     --reporter=verbose --testTimeout=15000
   npm run typecheck
   npm run architecture:check
   ./node_modules/.bin/openspec validate add-interactive-plan-mode --strict
   git diff --check
   ```

   预期 Vitest 为 17 files、94 tests 全部通过，随后所有门禁退出码为 0。用例应证明：
   Planner 固定 `permissionMode: plan` 且无
   memory/skills profile；mutation 与 nested spawn 被拒绝；批准后 Main 恢复；
   `select | investigate | update_constraints | backtrack` 四种 action 可持久化并幂等
   重放；候选上限 3、当前 revision 节点上限 6 且不静默截断；项目切换后旧 store 与
   新项目隔离。

失败判定：任一命令非零；核心套件任一轮不是 3 files/14 tests 全通过；出现两个
foreground owner；Main/Planner 状态或 foreground 恢复错误；Planner 获得 mutation、
nested spawn、memory 或 skills；未批准的 normal/failure/abort/shutdown/session switch
遗留 binding、waiter 或 foreground；HITL 被绕过；pending/waiting/trajectory 非原子或
发生 lost-wakeup；action receipt 非幂等；预算被静默截断；旧 Planner 可覆盖终态；
旧项目 Plan 写入新项目；或出现 M3+ 实现。

## Review And Risks

- 最终 reviewer 已确认无 BLOCKER/HIGH，状态 `AWAITING_ACCEPTANCE`；尚未完成人工验收。
- M2 仅提供 `completeApproved()` 生命周期入口并要求 Plan 已处于 `approved`；创建和校验
  approval 属于 M3，未在本轮实现。
- pending interaction 是持久真相；`PlannerInteractionBroker` 只负责当前进程内等待，
  重启恢复与重发属于 M8。
- 全量测试已通过；残余风险是 M2 之外的恢复对账、审批与执行绑定仍按计划留在 M3/M8。

## Suggested Commit

- Message: `feat(plan): add supervised planner process`
- Scope: 仅 File Ownership 列出的 M2 生产、测试和控制文档。
- Exclusions: proposal、design、prototype、specs、`.openspec.yaml`、HTML、其他 change、
  本机配置和所有其他未跟踪文件。
- Authorization: 用户已在 can-dev-loop 确认弹窗选择“通过并提交”，授权提交 M2 并进入
  M3。
- Pre-commit gates: 重跑 Manual Acceptance 的 5 轮核心竞态套件和 17-file M2 套件，
  再运行 `npm run typecheck`、`npm run architecture:check`、OpenSpec strict validation
  与 cached diff check；任一失败均不得提交。
- 不 push、amend 或 rebase。
