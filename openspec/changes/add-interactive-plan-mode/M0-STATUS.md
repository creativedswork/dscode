# M0 Status — Plan 领域模型与持久化

## State

`COMMITTED`

M0 tasks 1.1-1.6 已实现。此前 reviewer 报告的问题及复核发现的最后 1 个 HIGH 已逐项
修复，并通过 M0 专项测试和仓库门禁。最终独立 reviewer 已确认无 BLOCKER/HIGH，
M0 可进入人工验收。用户已于当前会话明确授权“提交 M0 并进入 M1”。提交前已核对
最终 staged 集合精确为本文件列出的 25 个 M0 文件，并在该状态通过专项 Vitest、
typecheck、architecture check 与 OpenSpec strict validation；仅在全部门禁通过后创建
M0 原子提交。本状态文件不预写尚未知的 commit SHA。

## Scope

- PlanRecord、相关 discriminated unions、version/revision 和 exhaustive assertion。
- canonical semantic payload 与 SHA-256 digest。
- project-scoped PlanStore、递归 closed-object schema 校验、损坏隔离、durable atomic
  write，以及 Windows 不支持目录 fsync 时的提交后兼容语义。
- per-plan 进程内队列、带可靠性与 scheme 的进程启动身份、完整 owner 原子发布、按
  文件年龄回收 malformed/future-dated lock、仅比较同 scheme 可靠 OS identity 的 PID
  复用识别、unknown/runtime fallback 下的 live owner 保护、stale recovery 和
  expectedVersion CAS。
- pending interaction、command payload digest、单次消费和全量 receipt ledger。
- 候选摘要、一般事实及既有选择/证据/回溯/状态迁移的可审计 trajectory。
- 创建、摘要稳定性、并发、真实进程崩溃、锁、写中断、损坏与幂等测试。

## File Ownership

M0 实现与测试文件（23 个）：

- 生产文件（12 个）：
- `src/application/plan/{command,digest,index,lock,lock-owner,path,schema-parts,schema,storage-io,store-types,store,types}.ts`
- 测试文件（8 个，当前共 40 个 tests）：
- `tests/application/plan/{concurrency,fault-recovery,interaction,lock,model,storage-io,store,validation}.test.ts`
- 测试辅助与 fixture（3 个）：
- `tests/application/plan/helpers.ts`
- `tests/application/plan/fixtures/{fault-worker,update-worker}.ts`

M0 控制文档（2 个）：

- `openspec/changes/add-interactive-plan-mode/tasks.md`
- `openspec/changes/add-interactive-plan-mode/M0-STATUS.md`

本次收口仅修改 `openspec/changes/add-interactive-plan-mode/M0-STATUS.md`，未修改生产
代码、测试或 `tasks.md`。

当前仓库没有 staged change。上述实现、测试和 change 文件均为未跟踪文件；change 的
proposal、design、prototype、specs、`.openspec.yaml`、HTML 原型以及其余
dirty/untracked 文件均视为用户已有资产，不修改、不暂存、不纳入 M0 建议提交范围。

## Non-Goals

- M1+ 的路由、effect metadata、Planner、执行门禁、PlanService、Harness API/events、
  WebSocket、Web/TUI 和恢复接线。
- prototype retention 或 consolidate。
- commit、push、PR 或任何无关工作区清理。

## Automated Evidence

- 本次收口复跑 `npx vitest run tests/application/plan`：Vitest 4.1.7，8 files、40
  tests passed。
- `npm run typecheck`: passed。
- `npm run architecture:check`: passed，0 migration baseline entries。
- `git diff --check`: passed。
- 23 个 M0 实现/测试文件与 2 个控制文档通过逐文件
  `git diff --no-index --check`。
- `npx openspec validate add-interactive-plan-mode --strict`: passed。
- OpenSpec status/apply 回读：schema `spec-driven-plus`，6/59 complete，仅 1.1-1.6
  checked。

## Reviewer Findings Closed

1. **HIGH — 持久化 schema 接受未知字段**
   - `schema-parts.ts` 和 `schema.ts` 的所有持久化 `Type.Object` 均递归设置
     `additionalProperties: false`。
   - `validation.test.ts` 遍历完整 schema，并证明未知顶层和嵌套字段通过真实
     `PlanStore.load()` 被隔离到 `corrupt/`。
2. **HIGH — lock owner 非原子发布**
   - `lock.ts` 先将完整 owner 写入同目录临时文件并 fsync，再以 hard link 排他发布；
     失败路径按 token 清理临时文件和已发布 lock。
   - `fault-worker.ts`/`fault-recovery.test.ts` 让真实子进程分别在 owner fsync 后、
     owner 发布后 `SIGKILL`，证明前者不产生权威 lock，后者留下完整可恢复 owner。
3. **MEDIUM — interaction 与 receipt 不变量不足**
   - `persistInteraction()` 拒绝覆盖 pending 和重用已消费 interactionId。
   - schema 领域校验重算 pending payload digest，检查 receipt/result interactionId
     一致，并拒绝重复消费 ID；对应 interaction/validation 测试已覆盖。
4. **MEDIUM — command digest 漏掉 operation**
   - command canonical payload 已包含 `operation`；同 commandId、同 payload、不同
     operation 返回 `command_id_reused`。
5. **MEDIUM — trajectory 事件不完整**
   - union/schema 新增 `candidate_summarized` 与 `fact_recorded`，validation switch
     使用 `assertNever` 保持穷尽，model 测试覆盖两类事件。
6. **MEDIUM — 故障与并发测试边界不足**
   - 新增 owner 发布前后、data temp fsync 后的真实子进程退出测试，以及 live PID
     不可回收测试。
   - CAS 测试由首个 worker 明确持锁后再启动 contender，确定性证明首个提交成功、
     后者收到 version conflict。
7. **HIGH — Windows 目录 fsync 在 rename 后谎报提交失败**
   - `storage-io.ts` 仅在 `win32` 且目录句柄 `sync()` 返回 `EPERM` 时视为平台不支持；
     目录 open、文件 write/fsync/close、非 Windows 错误和其他 Windows 错误仍传播。
   - `storage-io.test.ts` 走真实临时文件和 rename，只注入目录句柄，证明 Windows
     `EPERM` 返回成功且目标内容已提交，同时非 Windows `EPERM` 与 Windows `EIO`
     继续抛出。
8. **MEDIUM — malformed lock 或 PID 复用导致永久不可恢复**
   - lock owner 新增 `processStartIdentity`：Linux 使用 `/proc` 启动 tick，Windows 使用
     PowerShell `StartTime` ticks，其余平台使用 `ps lstart`；探测不可用时保守保留活
     PID，避免误抢 live owner。
   - malformed lock 使用文件 mtime 判定 stale，并只在持有 exclusive recovery marker
     后原子移出权威路径；fresh malformed lock 保留。
   - `lock.test.ts` 确定性覆盖 malformed stale recover、malformed fresh 不抢、同 PID
     不同启动身份 recover，以及同 PID 同启动身份 live owner 不抢。
9. **HIGH — Unix `ps lstart` 身份受 TZ/locale 影响**
   - `lock-owner.ts` 对 Unix `ps` 同时固定 `LC_ALL=C`、`LANG=C`、`TZ=UTC`，并保留
     当前 `PATH`（缺失时使用 `/usr/bin:/bin`）；owner 发布与 contender 校验复用同一
     reader。
   - `fault-recovery.test.ts` 启动两个真实子进程，分别使用
     `C + Pacific/Honolulu` 与 `en_US.UTF-8 + Asia/Tokyo`；在 lock 超过 5ms stale
     阈值后，断言 contender 读取的 identity 与 owner 发布值完全一致、获取结果为
     timeout，且 owner 仍存活。
10. **MEDIUM — future `createdAt` 可永久阻塞 dead owner**
   - `lock-owner.ts` 集中时间分类与 owner identity 判定：仅有限、非负且不超过阈值的
     owner age 可直接视为 fresh；future/非有限 age 先检查 owner，只有 owner dead 或
     identity mismatch 且 lock 文件 mtime 也超过阈值时才允许恢复。
   - `lock.test.ts` 覆盖 stale-file + dead future owner 可恢复、stale-file + live future
     owner 不可抢，以及 fresh-file + dead future owner 仍需等待文件阈值。
11. **HIGH — runtime fallback 与真实 OS identity 被误判为 PID 复用**
   - `processStartIdentity` 改为显式携带 `reliability`、`scheme` 和 `value`；OS 探测成功
     标记为 reliable，随机进程内 fallback 标记为 `fallback/runtime`。
   - 活 PID 仅在 owner 与 contender identity 均可靠、scheme 相同且 value 明确不等时
     判定为 PID reuse；任一侧 unknown/runtime fallback 或 scheme 不同均保守视为 live。
   - `lock.test.ts` 覆盖可靠同 scheme mismatch、runtime fallback、unknown contender
     和跨 scheme；`fault-recovery.test.ts` 在 macOS 启动真实 owner/contender 双进程，
     分别令 owner 和 contender 的 `PATH` 指向不存在目录。两个场景均超过 5ms stale
     阈值并得到 `timeout`、`ownerAlive: true`，未回收仍存活 owner。

## Final Reviewer Conclusion

- 最终独立 reviewer 未发现 BLOCKER/HIGH，结论为 M0 可进入人工验收。
- 没有需要在人工验收前继续修改代码或测试的未关闭问题。
- reviewer 接受以下 LOW 风险继续保留：`SIGKILL` 可能留下非权威随机 `.tmp`；Windows
  目录 fsync 兼容分支仅通过注入平台与目录句柄的方式测试。

## Residual Risk / Scope Decision

- 进程在 data temp fsync 后、rename 前终止会留下随机 `.tmp`。它不是权威 Plan 文件，
  `load`、CAS 与 lock 均不会读取或发布它，因此不影响 M0 正确性；当前残余风险仅为
  长期磁盘占用。
- M0 规格没有临时文件 retention/清理要求。清理需要定义年龄、活跃 writer 排除和扫描
  时机，属于独立生命周期策略；本轮不无依据扩 scope，可在 M8 retention 或出现实际磁盘
  卫生需求时处理。
- Windows 目录 fsync 的 `EPERM` 兼容路径有真实文件/rename 测试，但平台分支通过依赖
  注入触发，尚未在原生 Windows 文件系统上执行。

## Manual Acceptance

M0 没有用户界面；人工验收通过终端直接操作隔离的真实 PlanStore，并核对落盘结果。

目标：

- 确认真实文件系统上的 create、update、load 和 stale CAS 行为。
- 确认运行态更新只增加 version，语义更新同时增加 revision 并改变 digest。
- 确认正常完成后只有权威 JSON，没有残留权威 lock 或随机 `.tmp`。

步骤：

1. 在仓库根目录运行自动化门禁：

   ```bash
   npx vitest run tests/application/plan
   npm run typecheck
   npm run architecture:check
   npx openspec validate add-interactive-plan-mode --strict
   ```

   预期：Vitest 4.1.7 报告 8 files、40 tests passed，其余命令退出码均为 0，
   architecture check 报告 0 migration baseline entries。

2. 创建隔离目录并执行真实 PlanStore smoke：

   ```bash
   export M0_ACCEPT_DIR="$(mktemp -d)"
   node --import tsx --input-type=module <<'EOF'
   import { PlanStore } from "./src/application/plan/store.ts";
   import { makePlanInput } from "./tests/application/plan/helpers.ts";

   const store = new PlanStore({
     dataDir: `${process.env.M0_ACCEPT_DIR}/data`,
     projectPath: `${process.env.M0_ACCEPT_DIR}/project`,
   });
   const created = await store.create(makePlanInput("acceptance-plan"));
   if (!created.ok) throw new Error("create failed");
   const runtime = await store.update(created.plan.planId, created.plan.version, (draft) => {
     draft.telemetry = { lastProgressAt: 100, counters: { tokens: 1 } };
   });
   if (!runtime.ok) throw new Error("runtime update failed");
   const semantic = await store.update(runtime.plan.planId, runtime.plan.version, (draft) => {
     draft.goal = "Accepted semantic goal";
   });
   if (!semantic.ok) throw new Error("semantic update failed");
   const stale = await store.update(semantic.plan.planId, runtime.plan.version, () => {});
   const loaded = await store.load(semantic.plan.planId);
   if (!loaded.ok || !loaded.plan) throw new Error("load failed");
   console.log(JSON.stringify({
     created: [created.plan.version, created.plan.revision],
     runtime: [
       runtime.plan.version,
       runtime.plan.revision,
       runtime.plan.digest === created.plan.digest,
     ],
     semantic: [
       semantic.plan.version,
       semantic.plan.revision,
       semantic.plan.digest !== runtime.plan.digest,
     ],
     stale: stale.ok ? "unexpected-success" : stale.reason,
     loaded: [loaded.plan.version, loaded.plan.revision],
   }, null, 2));
   EOF
   ```

   预期：输出依次包含 `created: [1,1]`、`runtime: [2,1,true]`、
   `semantic: [3,2,true]`、`stale: "conflict"` 和 `loaded: [3,2]`。

3. 检查并清理验收目录：

   ```bash
   find "$M0_ACCEPT_DIR/data" -type f -print
   find "$M0_ACCEPT_DIR/data" -type f \( -name '*.lock' -o -name '*.tmp' \) -print
   rm -rf "$M0_ACCEPT_DIR"
   ```

   预期：第一个命令只列出 `acceptance-plan.json`，第二个命令无输出。

失败判定：任一命令非零退出；文件/测试数量不再是 23 个实现/测试文件、8 files/40
tests；smoke 输出不匹配；正常写入后出现 lock/`.tmp`；权威 JSON 无法重载；或出现新的
BLOCKER/HIGH。原生 Windows 未实测和 `SIGKILL` 后的非权威 `.tmp` 属已接受 LOW 风险，
不单独判定本轮人工验收失败。

## Suggested Commit

- Message: `feat(plan): add durable plan model and store`
- Scope: 仅 File Ownership 中列出的 23 个实现/测试文件与 2 个 M0 控制文档，共 25 个
  文件。
- Exclusions: proposal、design、prototype、specs、`.openspec.yaml`、HTML 原型、其他
  untracked 文件，以及 M1+ 的任何实现。
