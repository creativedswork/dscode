# M3 Status - 审批、执行绑定与重新规划

## State

`COMMITTED`

M3 tasks 4.1-4.8 已完成第二轮独立修复，收口 cancel token、MCP observable envelope
和 Planner 旧测试 3 个 HIGH，并补齐 permission throw 与活跃 SubAgent terminal cleanup
真实测试。最终 reviewer 无 BLOCKER/HIGH，结论为 M3 可验收。用户已在确认弹窗选择
“通过并提交，进入下一 Milestone”；提交前门禁通过后，M3 已按精确 ownership 原子提交，
M4 获得准入。

## Scope

- 将已选公开决策轨迹编译为有序 PlanItems、验收条件、effect grants、canonical
  resource scopes 和副作用摘要；不持久化私有推理或 CoT。
- 审批严格绑定 revision、digest、interaction payload 和副作用 acknowledgement
  receipt；任何 semantic change 清除 approval、pending interaction 和 execution
  bindings，stale approval 返回 typed rejection。
- Main 与 SubAgent 通过现有 AgentContext/Supervisor 继承 Plan binding。副作用工具先经
  Plan effect/scope guard，再进入原有 capability/permission 检查；Plan approval 不扩大
  普通工具权限。
- Agent progress、tool result 和 Agent/SubAgent exit 只追加 PlanItem evidence。Agent
  exit 不完成 item，evidence 是否可用于验收由独立字段记录。
- 仅绑定 Main 可调用 `verify_item`。command、observable、human criteria 分别校验命令
  结果、显式观测结果和已消费 human receipt。
- material conflict 立即进入 `needs_replan` 并停止新副作用调用；已在途调用允许 settle，
  但其输出标记为不可用于验收。settle 后复用 AgentSupervisor 启动新 Planner，设置
  `baseRevision`，生成新 revision 并要求重新审批。
- cancellation 覆盖 drafting、waiting、approved、needs_replan 和 executing；executing
  等待在途调用 settle。终态不可变，blocked 可恢复，skipped 必须给出原因并触发重规划。

## Review Finding Closure

1. **BLOCKER shell scope**：依赖树没有可靠 shell parser。新增单命令词法扫描器；仅批准
   command class 时拒绝未引用/未转义的管道、重定向、`;`、`&&`、`||`、命令替换、
   换行、后台和子 shell，覆盖 quoted/escaped 边界及 `npm test && rm ...`。
2. **HIGH permission deny leak**：Plan authorization 在 permission deny、throw 或 abort
   时显式 release；不再假设 blocked call 会收到 Pi `afterToolCall`。
3. **HIGH stale material conflict**：material conflict 改为 command receipt + typed
   mutation result；旧 version 返回 conflict，并在内存中 fail closed 阻止后续调度。只有
   同 command receipt 且当前仍为 `needs_replan` 才返回幂等成功。
4. **HIGH replan trigger**：Execution lifecycle 在全部 in-flight settle 后单次回调
   `PlannerProcessCoordinator.replan`；Coordinator 重新校验 status/version，派生
   `baseRevision` 后启动真实 Planner，并处理重复 conflict/cancel race。
5. **HIGH acceptance evidence**：evidence 持久化 `planId + revision + itemId`，human
   receipt 另绑定 `criterionId` 和 durable acceptance interaction；receipt 单次消费且
   approval receipt 不可复用。observable 只接受显式 structured success，业务错误和
   unknown 均拒绝；command 同时校验命令、退出码和预期输出。
6. **HIGH terminal cleanup**：completed/cancelled 终态提交后清理 Main/SubAgent Plan
   bindings、终止仍活跃 SubAgent、停止 Main 当前 run，并恢复 Planner foreground。
7. **HIGH empty approval**：`requestApproval` 与 `approve` 均调用 compiled-plan invariant，
   强制非空 items、逐项 acceptance、canonical 且无重复的 grants/scopes、非空且与实际
   effect 一致的 side-effect summary。
8. **MEDIUM concurrent cancel**：共享 cancel promise 在首次 await 前登记；立即提交、
   in-flight settle 和异常路径统一 resolve，所有并发调用均结束。
9. **MEDIUM real paths**：新增 unknown MCP、真实 PermissionManager deny、SubAgent
   inherited binding、Harness verify/terminal cleanup、Supervisor replan、cancel race
   覆盖；删除 permission deny 测试中伪造 `afterToolCall` 的假设。
10. **HIGH cancel token**：cancel 接受阶段在 PlanStore CAS 内持久化
    `commandId + expectedVersion + acceptedVersion`，并同步登记内存 token；in-flight
    settle 后只允许该 token 完成取消。并发同请求共享结果，不同 stale 请求返回 typed
    conflict；stale version 不登记取消且不改变执行态。
11. **HIGH MCP envelope**：统一识别真实 MCP manager 外层 `details.error`、
    `details.structuredContent`、`details.mcpResult.isError` 与内部业务状态；错误优先，
    只有显式结构化成功才产生可验收 success，普通非错误结果保持 unknown。
12. **HIGH Planner regression**：`planner-tools.test.ts` 先完成 decision，再通过真实
    `plan_compile` 生成非空计划后请求审批；空计划 request/approve 拒绝继续由
    `compiler-approval.test.ts` 覆盖，等待 promise 立即绑定 rejection handler。
13. **Coverage gaps**：新增 Harness + 真实 PermissionManager prompt throw 后释放授权的
    测试；新增活跃 SubAgent 在 terminal callback 中被 terminate 且 Main/SubAgent
    Plan binding 同时清理的测试。

## Non-Goals

- M4 HarnessAPI、Plan EventBus、UserInteractionPort 或领域事件。
- M5+ WebSocket、TUI、Web 协议和视觉实现。
- M8 启动恢复、对账、重发或 retention。
- push、PR 或视觉验收。

## File Ownership

M3 精确 ownership 为 53 个文件：33 个生产文件、18 个测试文件、2 个控制文档。

生产文件（33）：

- `src/agents/process/context.ts`
- `src/agents/process/spawner.ts`
- `src/agents/process/types.ts`
- `src/application/agent-runtime-coordinator.ts`
- `src/application/harness.ts`
- `src/application/plan/{compiler,digest,execution-acceptance,execution-approval,execution-binding,execution-guard,execution-lifecycle,execution-outcome,execution-rules,execution-runtime,execution-service,execution-state,execution-tools,execution-types,index,planner-application,planner-process,planner-service,planner-spawn,planner-tools,resource-scope,schema,schema-parts,shell-command,store,store-types,types}.ts`
- `src/kernel/path-safety.ts`

测试文件（18）：

- `tests/agents/process/plan-binding.test.ts`
- `tests/application/plan/{compiler-approval,execution-acceptance,execution-cancellation,execution-command-acceptance,execution-evidence-binding,execution-guard,execution-mcp-acceptance,execution-state,harness-execution,harness-permission-release,planner-lifecycle,planner-tools,resource-scope}.test.ts`
- `tests/application/plan/{execution-helpers,harness-execution-helpers,helpers}.ts`
- `tests/helpers/routed-harness.ts`

控制文档（2）：

- `openspec/changes/add-interactive-plan-mode/tasks.md`
- `openspec/changes/add-interactive-plan-mode/M3-STATUS.md`

## Automated Evidence

- M3 targeted + Planner/MCP/permission/SubAgent suite：15 files、60 tests 全部通过
  （`--testTimeout=15000`），Vitest 未报告 unhandled rejection。
- MCP manager、PermissionManager 与 AgentSupervisor 支撑套件：3 files、52 tests
  全部通过。
- 真实 Harness/Supervisor 路径覆盖 scoped side effect、真实 permission deny 后 release、
  permission prompt throw 后 release、verify/terminal cleanup、活跃 SubAgent terminate
  与 binding cleanup、自动 replanning 与 Planner races。
- 真实 MCPManager 包装结果覆盖 unknown、`isError` 优先和 structured success。
- `npm run typecheck`：通过。
- `npm run architecture:check`：通过，0 migration baseline entries。
- `./node_modules/.bin/openspec validate add-interactive-plan-mode --strict`：通过。
- `git diff --check`：通过。
- 本轮新增或拆分的 Plan 生产模块均不超过 300 行；既有大型聚合入口
  `harness.ts`/`agent-runtime-coordinator.ts` 仅做必要接线。
- 按 Owner 收口要求未运行全量测试；风险路径由上述定向与支撑套件覆盖。

## Acceptance Coverage

- stale approval 不消费 interaction，返回 `stale_approval`。
- effect 或 canonical scope 扩张被拒绝并进入 `needs_replan`。
- Plan guard 通过后，普通 permission 仍可独立拒绝调用。
- Agent exit、tool result 与完成判定分离；仅 Main verification 可完成 item。
- human criterion 必须引用已记录 receipt，command criterion 匹配命令和退出码。
- conflict 后在途输出可记录但不可作为 acceptance evidence，新 item 不再调度。
- replan 等待在途调用 settle，复用真实 Supervisor 创建新 Planner，并设置
  `baseRevision`、新 revision 和空 approval。
- cancellation、终态保护、blocked/resume/skipped 迁移均有状态机覆盖。

## Final Review

- 最终 reviewer 结论：无 BLOCKER、无 HIGH，M3 可进入人工验收。
- 已关闭项覆盖 compile/approval/stale、acknowledgement、effect/scope/shell、
  permission 独立性、Main/SubAgent binding、evidence/acceptance、MCP observable、
  `verify_item`、material conflict + in-flight settle + auto replan、cancel token/concurrency
  以及 terminal cleanup/state machine。
- reviewer 未要求修改 M3 scope、生产代码、测试或 tasks；M4 仍保持未开始。

## Acceptance Authorization

- 2026-08-26，用户在确认弹窗选择“通过并提交，进入下一 Milestone”。
- 授权提交 message 为 `feat(plan): add approval-bound plan execution`，范围仅限 File
  Ownership 所列 53 个文件。
- 授权要求提交前重跑两组 targeted tests、typecheck、architecture check、OpenSpec
  strict validation 和 cached diff 检查；任一失败均恢复为 `AWAITING_ACCEPTANCE` 且不提交。
- 不授权 amend、rebase、push、PR 或纳入明确排除项。

## Minimal Acceptance

以下命令均不需要外部服务、网络账号或模型/API 凭据；在仓库根目录执行。

1. 运行 M3 定向验收（15 files / 60 tests）：

   ```bash
   npx vitest run --testTimeout=15000 \
     tests/agents/process/plan-binding.test.ts \
     tests/application/plan/compiler-approval.test.ts \
     tests/application/plan/execution-acceptance.test.ts \
     tests/application/plan/execution-cancellation.test.ts \
     tests/application/plan/execution-command-acceptance.test.ts \
     tests/application/plan/execution-evidence-binding.test.ts \
     tests/application/plan/execution-guard.test.ts \
     tests/application/plan/execution-mcp-acceptance.test.ts \
     tests/application/plan/execution-state.test.ts \
     tests/application/plan/harness-execution.test.ts \
     tests/application/plan/harness-permission-release.test.ts \
     tests/application/plan/planner-lifecycle.test.ts \
     tests/application/plan/planner-process-races.test.ts \
     tests/application/plan/planner-tools.test.ts \
     tests/application/plan/resource-scope.test.ts
   ```

   预期：15 个文件、60 个测试全部通过，无 unhandled rejection。该组覆盖
   compile/approval/stale 与 ack；effect、canonical scope 和 shell command 边界；
   permission 独立拒绝/throw 后授权释放；Main/SubAgent binding；evidence 与 acceptance
   分离；MCP observable envelope；仅 Main 可执行的 `verify_item`；material conflict
   后停止新调度、in-flight settle 与自动 replan；cancel token 和并发幂等；terminal
   cleanup、终态保护及 blocked/skipped 状态迁移。

   失败判定：任一测试失败、超时、出现 unhandled rejection，或汇总不是
   `15 passed (15)` / `60 passed (60)`，均拒绝 M3 验收并回到当前里程碑修复。

2. 运行真实支撑组件回归（3 files / 52 tests）：

   ```bash
   npx vitest run --testTimeout=15000 \
     tests/mcp/manager.test.ts \
     tests/permissions/manager.test.ts \
     tests/agents/process/supervisor.test.ts
   ```

   预期：3 个文件、52 个测试全部通过，证明 M3 与 MCP manager、PermissionManager、
   AgentSupervisor 既有行为兼容。失败判定：任一失败、超时或汇总计数不符，均拒绝验收。

3. 运行静态与规格门禁：

   ```bash
   npm run typecheck
   npm run architecture:check
   ./node_modules/.bin/openspec validate add-interactive-plan-mode --strict
   git diff --check
   ```

   预期：四条命令退出码均为 0；architecture check 报告 0 migration baseline entries，
   OpenSpec strict validation 通过，diff 无 whitespace error。失败判定：任一非零退出、
   新增 architecture baseline、OpenSpec error 或 diff error，均拒绝验收。

## Commit Recommendation

- 建议 message：`feat(plan): add approval-bound plan execution`
- 建议提交范围：仅 File Ownership 所列 53 个 M3 文件，逐文件显式暂存。
- 明确排除：本 change 中不属于 M3 ownership 的 `.openspec.yaml`、`design.md`、
  `proposal.md`、`prototype.md` 和 `specs/`，以及其他 OpenSpec change、`.claude/`、
  `.cline/`、`.clinerules/`、`.dscode/skills/`、`.dscode/uploads/`、`.superpowers/`、
  `.tmp/`、`.trae/`、`.ttadk/`、`.vscode/`、根目录临时 HTML/图片/OCR 数据、
  `docs/` 下无关原型和 `PR_DESCRIPTION.md`；不 amend、push、建 PR，也不纳入 M4 文件。

## Risks

- 未运行全量测试，遵循用户要求停止额外调查和重复全量；剩余风险集中在未被定向套件
  触及的既有非 Plan 功能，以及 M4 才会提供的外部 human acceptance API/event 接线。
- M4+ API/事件/UI 和 M8 恢复仍未实现，不能通过本 M3 状态推断其行为。
- 工作区原有 dirty/untracked 资产均保留，未回滚、清理或纳入提交。
- M3 已获人工验收与提交授权并完成原子提交；未 push、未 amend、未 rebase，M4 可由新的
  Milestone Owner 开始。
