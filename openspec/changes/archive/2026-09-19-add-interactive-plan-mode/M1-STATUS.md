# M1 Status - 复杂度路由与副作用门禁

## State

`COMMITTED`

M1 tasks 2.1-2.7 仍全部满足。三个 reviewer HIGH 已按 Pi Agent 的真实 request
snapshot、tool batch aggregate 和 Harness execution context 语义修复；reviewer LOW
所缺的真实 Harness/Pi 调度覆盖也已补齐。最终 reviewer 提出的两个 HIGH 已关闭：
动态工具刷新保留 Main wrappers，Plan handoff 不再依赖 Pi 的 ToolResult
`terminate` 聚合。用户已通过 can-dev-loop 交互确认弹窗选择“通过并提交
(Recommended)”，授权提交 M1 并进入 M2。未实现 M2 Planner process。

提交仅在最终 5-file/30-test acceptance（`--testTimeout=15000`）、
`npm run typecheck`、`npm run architecture:check` 和
`openspec validate add-interactive-plan-mode --strict` 全部通过后创建；提交范围还须
通过 staged ownership 集合核对和 `git diff --cached --check`。

## Scope

- Harness conversation submission 支持 `auto | plan` mode，每次请求生成独立
  request identity。
- Auto 请求通过五维 0..2 `PlanRouteAssessment` 进入集中式确定性路由；显式 Plan
  直接返回 M2 可消费的 `planner_requested` contract。
- Main Agent 在 tool dispatch 边界执行副作用门禁；Plan Agent capability 根据
  effect metadata fail closed。
- MCP 图片后处理和 Auto 用户图片路径服从 route / process 权限，不在 Plan 或尚未
  assessment 的上下文写 image cache 或启动 Vision Agent。

## Reviewer Findings

### HIGH 1 - Request identity prompt snapshot

**Finding**

Route instructions 原先在 `transformContext` 中写回 `agent.state.systemPrompt`。Pi
`Agent.prompt()` 已在此之前调用 `createContextSnapshot()`，因此当前请求的首轮
stream context 看不到 requestId，并可能继续使用上一请求的 prompt state。

**Fix**

- `beginRequest()` 后、提交给 `Agent.prompt()` 前同步调用
  `syncMainRequestContext()`，安装当前 request route instructions 和 Main tool
  snapshot。
- `endRequest`、异常 `finally` 和 `abort()` 都清理 guard、terminal call state，并
  重建无 route instructions 的 Main prompt。
- 下一轮通过 `prepareNextTurnWithContext` 从当前 guard state 构造 context，不依赖
  对已快照 `agent.state` 的迟到修改。

**Evidence**

`tests/application/plan/harness-routing.test.ts` 使用真实 Harness 和 Pi Agent stream
context 验证：

- 两个连续请求各自只包含当前 requestId。
- reset 后的新 Session 不包含前一 Session 的 requestId。
- abort 时 route prompt 立即清除，随后请求不继承被取消 requestId。

### HIGH 2 - Batch terminal / handoff

**Finding**

Pi 仅在同批所有 finalized tool result 都满足 `terminate === true` 时终止。Plan
assessment 自身 terminal 不足以终止包含普通 read 或 `beforeToolCall` blocked
mutation 的混合 batch；后者生成的普通 error result 也不带 terminal。

**Fix**

- Assessment tool 固定为 sequential execution，使混合 batch 没有并行 preflight
  竞态。
- Main request 的 tool snapshot 使用局部 wrapper；assessment 同批 mutation 以
  toolCallId 命中 synthetic blocked result，原 mutation `execute` 不运行，结果带
  `terminate: true`。
- Assessment 同批的其他已执行 sibling 在 `afterToolCall` 被标记 terminal。Plan
  assessment 自身也 terminal，因此 Pi batch aggregate 成立，不再调用 Main 模型。
- Wrapper 不改写 DriverRegistry 中共享 tool 对象，避免并发 SubAgent 污染。

**Evidence**

`tests/application/plan/harness-routing.test.ts` 通过真实 Pi batch 调度分别覆盖：

- `assessment + write_file`：原 mutation execute 0 次，Main stream 仅 1 次。
- `assessment + read_file`：read execute 1 次，Main stream 仍仅 1 次。
- 两种情况都返回 `planner_requested`。

### HIGH 3 - Vision composed effect

**Finding**

MCP tool 可声明为 `read`，但图片结果后处理会进一步写 image cache，并可能启动
Vision Agent。Auto 用户图片也会在 Main 完成 route assessment 前进入同一处理链。

**Fix**

- MCP image post-processing 通过 `processMcpImages()` 读取真实 execution context。
  Plan permission process、未知 process，以及尚未形成 Direct decision 的 Main
  request 均 fail closed，返回未处理结果，不写 cache、不启动 Vision Agent。
- 非 native Auto 图片先以 pending marker 提交给 Main；只有 assessment batch
  完成且 Direct decision 激活后，才在 `prepareNextTurnWithContext` 处理图片并把
  结果注入下一轮。

**Evidence**

`tests/application/plan/harness-vision-routing.test.ts` 验证：

- Auto 首轮 stream 时 image pipeline / image store 均未调用；Direct assessment
  后才处理，并在下一轮 context 中出现图片文本。
- 真实 `permissionMode: plan` Agent 通过 Pi 调用外层 `effect: read` 的 MCP image
  tool；MCP client 正常执行，但 image store、image pipeline 和 Vision Agent 均未
  启动。

### LOW - Harness/Pi integration coverage

**Finding**

原测试以纯 guard、capability 和 MCP manager 单元测试为主，不能证明 Pi snapshot
和 batch aggregate 的实际行为。

**Fix**

新增真实调度 fixture，实例化 Harness、Pi Agent、AgentSupervisor、Session 和 MCP
tool；仅模型 stream、图片端口和 process persistence 使用确定性测试替身。

**Evidence**

- `tests/application/plan/harness-routing.test.ts`
- `tests/application/plan/harness-vision-routing.test.ts`
- `tests/helpers/routed-harness.ts`

## Final Reviewer Findings Closure

### HIGH 1 - Deferred discovery bypassed Main wrappers

**Finding**

`search_tools` 完成后曾用 `ToolRegistry.buildToolsForRequest()` 的原始工具直接替换
当前 Pi context。随后同批发现的 MCP mutation 虽通过 `beforeToolCall` 记录了 route
block，却执行了没有对应 wrapper 的原工具。

**Fix**

- `search_tools`、skill 切换、MCP catalog refresh、request snapshot 和 next-turn
  refresh 全部通过 `buildMainToolsForRequest()` 构造 Main 工具。
- deferred discovery 仍在当前 Pi batch 内刷新 `ctx.context.tools`；route guard 和既有
  permission hook 顺序不变。

**Evidence**

`tests/application/plan/harness-routing-boundary.test.ts` 通过真实 ToolRegistry、
`search_tools`、Harness 和 Pi Agent 执行
`search_tools -> assessment(plan) -> deferred MCP mutation`，断言：

- deferred MCP mutation 原 `execute` 调用 0 次；
- 返回 `planner_requested`；
- 实际模型 stream 调用 1 次。

### HIGH 2 - Plan terminal depended on ToolResult aggregation

**Finding**

Pi 0.80.10 只在同批所有 finalized result 都有 `terminate: true` 时停止；unknown
tool、invalid args 等 immediate result 不经过 `afterToolCall`，重复 assessment 的错误
结果也不能可靠满足该聚合条件。

**Fix**

- Harness 包装 Main Agent 的实际模型 stream 边界。当前 active request 已形成
  `route: "plan"` 时，不再调用 provider stream，而以本地终止响应完成当前 Main run，
  由 `submitRoutedRequest()` 读取 decision 并完成 handoff。
- ToolResult `terminate` 仍可避免普通批次的多余续轮，但 Plan terminal 的正确性不再
  依赖其 `every()` 聚合。
- `route: "direct"` 继续调用原 stream，工具 permission 与 request cleanup 保持原语义。

**Evidence**

真实 Harness/Pi integration 覆盖：

- assessment + unknown tool，前后两种顺序；
- assessment + invalid args，前后两种顺序；
- 双 assessment；
- Direct assessment 后继续一轮并执行 mutation；
- assessment + read sibling 仍执行 read；
- 每个 Plan case 的实际模型 stream 调用均为 1。

## Final Reviewer Conclusion

- 最终独立 reviewer 未发现 BLOCKER/HIGH，结论为 M1 可进入人工验收。
- 没有需要在人工验收前继续修改代码或测试的未关闭问题。
- 全量 110 files、905 tests passed；唯一 skipped 为需要显式
  `DSCODE_VISION_E2E=1` 和真实 provider 凭据的 live Vision smoke，不阻塞 M1。
- M1 和相关聚焦门禁均通过；M2 Planner process 仍未实现且不得在本轮启动。

## File Ownership

M1 生产文件（22 个）：

- `src/kernel/tool-effects.ts`
- `src/application/plan/{route,route-guard,index,types}.ts`
- `src/application/{harness,harness-api,agent-runtime-coordinator}.ts`
- `src/agents/process/{context,supervisor}.ts`
- `src/agents/tools/process-tools.ts`
- `src/drivers/{discovery,fs,registry,search,shell,tool-registry,types}.ts`
- `src/drivers/edit/{edit-undo,tool}.ts`
- `src/mcp/{manager,types}.ts`

M1 测试文件（8 个）：

- `tests/application/plan/{route,harness-routing,harness-routing-boundary,harness-vision-routing}.test.ts`
- `tests/agents/process/{effect-filtering,capability}.test.ts`
- `tests/agents/definitions/registry.test.ts`
- `tests/helpers/routed-harness.ts`

M1 控制文档（2 个）：

- `openspec/changes/add-interactive-plan-mode/tasks.md`
- `openspec/changes/add-interactive-plan-mode/M1-STATUS.md`

仓库当前没有 staged change。既有未跟踪 proposal、design、prototype、specs、
`.openspec.yaml`、HTML、上传内容和编辑器配置未被本轮修复修改，也不属于 M1
修复提交范围。

## Automated Evidence

- 真实调度测试：
  `npx vitest run tests/application/plan/harness-routing.test.ts tests/application/plan/harness-routing-boundary.test.ts tests/application/plan/harness-vision-routing.test.ts --testTimeout=15000`
  通过，3 files、13 tests passed。
- M1 相关回归：15 files、84 tests passed。
- 全量：
  `npx vitest run --testTimeout=15000`
  通过，110 files passed、1 skipped，905 tests passed、1 skipped。跳过项为需显式
  `DSCODE_VISION_E2E=1` 的 live provider smoke。
- `npm run typecheck`：passed。
- `npm run architecture:check`：passed，0 migration baseline entries。
- `git diff --check`：passed。
- `./node_modules/.bin/openspec validate add-interactive-plan-mode --strict`：
  passed。
- OpenSpec status：schema `spec-driven-plus`；M0 1.1-1.6 和 M1 2.1-2.7 checked，
  M2+ 全部未完成。
- 所有本次新增 TypeScript 文件均不超过 300 行；最大为
  `tests/application/plan/harness-routing-boundary.test.ts` 268 行。

## Acceptance Coverage

- Direct、强制 Plan、总分阈值、显式 Plan、畸形/重复/错误 identity assessment。
- assessment 前 read、无 assessment mutation、Plan mutation 和 assessment 混合
  batch。
- 内置、动态和 MCP effect metadata；missing/unknown fail closed；Main-only route
  tool 不进入 Plan Agent capability。
- request identity 的正常完成、连续请求、Session reset、abort/finally 清理。
- Pi batch aggregate 对 assessment+mutation 和 assessment+read 的 terminal 行为。
- 动态发现 MCP mutation 的 Main wrapper、Plan immediate-result terminal、Direct
  continuation 和 request cleanup。
- Auto image assessment 前无 process/write；Plan Agent MCP image result 无 cache
  write 或 Vision spawn。

## Non-Goals And Residual Risk

- M2 Planner Agent process、RAP-lite decisions、TTY handoff 和附件交接未实现。
  `planner_requested` 仍只是结构化 handoff contract。
- Plan route 的 Auto 图片不会在 M1 中处理或缓存；后续 Planner attachment transfer
  属于 M2，当前行为有意 fail closed。
- MCP effect 依赖 server declaration；缺失或非法声明归一为 `unknown` 并拒绝。
  声明可信度治理不属于 M1。
- Pi 0.80.10 的高层 `Agent` 尚未暴露低层 `shouldStopAfterTurn`；当前 Harness 在公开
  `streamFn` 边界阻止 Plan provider 续轮。升级 Pi 时应优先迁移到该原生 hook，并保留
  本轮真实调度测试。
- live provider Vision smoke 未运行；本轮验证覆盖确定性 Harness/Pi/MCP 调度，不依赖
  外部凭据。

## Manual Acceptance

M1 没有用户界面；人工验收通过现有确定性 Vitest 用例观察真实 Harness/Pi 调度边界，
不需要真实 LLM 或 Vision 凭据。

目标：

- 确认 Auto 路由阈值、显式 Plan bypass 和 assessment 前副作用门禁。
- 确认 Plan handoff 的混合 batch 不执行副作用，且 Main 不再请求模型续轮。
- 确认 Plan capability、request cleanup 和 Vision pre-route 均 fail closed。

步骤：

1. 在仓库根目录运行 M1 最小行为验收：

   ```bash
   npx vitest run \
     tests/application/plan/route.test.ts \
     tests/application/plan/harness-routing.test.ts \
     tests/application/plan/harness-routing-boundary.test.ts \
     tests/application/plan/harness-vision-routing.test.ts \
     tests/agents/process/effect-filtering.test.ts \
     --reporter=verbose \
     --testTimeout=15000
   ```

   预期：5 files、30 tests passed、0 skipped，并可从 verbose 用例名及断言确认：

   - 简单 assessment 返回 `direct`；`impact`、`risk` 或 `coordination` 任一为 2 时强制
     `plan`；五维总分达到 4 时返回 `plan`。
   - 显式 `plan` 提交直接返回 `planner_requested` 且 `source: "explicit"`，不接受 Auto
     assessment。
   - assessment 前 mutation 被阻断；Plan assessment 与 mutation 同批时 mutation
     executor 调用 0 次，实际模型 stream 仅 1 次。
   - Plan assessment 与 unknown tool、invalid args 或动态发现的 MCP
     `external_write` 同批时不执行副作用，返回 `planner_requested`，实际模型 stream
     仅 1 次；Direct assessment 后的后续 mutation 仍执行 1 次。
   - 正常完成、连续请求、Session reset、abort、Direct continuation 和 Plan handoff
     后均清除当前 request route context，不把 request identity 泄漏到下一请求。
   - Plan capability 允许 `read` 和无副作用 Plan operation，拒绝 `network`、
     `external_write`、missing 和 `unknown` effect；MCP 工具遵循同一规则。
   - Auto 图片在 Direct assessment 生效前不调用 image pipeline/store；Plan process
     的 MCP 图片结果不写 cache、不启动 Vision Agent。

2. 运行 M1 交付门禁：

   ```bash
   npm run typecheck
   npm run architecture:check
   ./node_modules/.bin/openspec validate add-interactive-plan-mode --strict
   git diff --check
   ```

   预期：所有命令退出码为 0；architecture check 报告 0 migration baseline entries；
   OpenSpec strict validation 通过；`git diff --check` 无输出。

失败判定：任一命令非零退出；聚焦验收不是 5 files/30 tests 全部通过且 0 skipped；上述
任一路由、batch 副作用、Main 续轮、request cleanup、capability 或 Vision 断言不成立；
测试尝试访问真实 provider；出现新的 BLOCKER/HIGH；或 M2 task/实现被纳入本轮。live
Vision smoke 继续 skipped 属已记录残余风险，不单独判定 M1 人工验收失败。

## Scope Confirmation

- tasks 2.1-2.7 保持 checked。
- tasks 3.1 及以后保持 unchecked。
- M1 已获交互弹窗提交授权；不 push，不 amend，不 rebase，不修改 `node_modules`
  或无关未跟踪资产。
