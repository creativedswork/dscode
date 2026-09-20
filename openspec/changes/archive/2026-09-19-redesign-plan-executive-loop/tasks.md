## 1. Agent loop 接入门禁

- [x] 1.1 将 `@earendil-works/pi-agent-core`、`pi-ai` 和 `pi-tui` 对齐升级到至少 `0.84.0`，将项目 Node.js engine 提升到 `>=22.19.0`，不混用不同 pi minor。
- [x] 1.2 用最小集成测试证明高层 `AgentOptions.shouldStopAfterTurn` 在 Tool batch 完成后、下一次 provider 请求前产生正常 `agent_end`，且不跳过当前 Tool result。
- [x] 1.3 运行现有 provider、Agent lifecycle、Tool hooks、TUI、typecheck 和 build 回归；若升级存在不相关破坏，先独立解决或停止本 change，不复制低层 Agent loop。

## 2. Executive Monitor 领域模型

- [x] 2.1 定义 execution episode policy、phase、progress snapshot、incident summary、recovery command/receipt 类型，并为旧 PlanRecord 保持 episode 字段可选和只读兼容。
- [x] 2.2 实现语义 progress snapshot：只比较通过的 verification、Plan step 状态和 TaskState/TodoItem outcome，排除版本、时间戳、标题、顺序、Tool 成功与 evidence 数量。
- [x] 2.3 实现 filesystem edit、command 和 generic Tool 的稳定 action fingerprint normalizer，排除 call ID、时间戳、格式差异与生成型 evidence ID。
- [x] 2.4 实现有限状态机和策略计数器，覆盖 running、一次 reflecting、paused_inconclusive、completed，并保证 hard budget 始终有限。
- [x] 2.5 为 progress 比较、fingerprint 等价类、预算边界、一次反思和二次 impasse 暂停编写确定性单元测试。

## 3. Episode 持久化与 evidence retention

- [x] 3.1 扩展 Plan execution schema/store，原子持久化当前 episode、bounded fingerprint window、incident summary 和 recovery receipts，且不改变既有 semantic digest。
- [x] 3.2 将 verification evidence retention 收敛为“当前 matcher 可复现证据 + 稳定 trace reference”，停止把普通 Tool/Agent progress 无界追加为 Plan evidence。
- [x] 3.3 验证旧 schema v1/v2 Plan、无 episode 的现有 Plan 和 paused episode 重启恢复均保持原 revision、digest、TaskState 与 TODO。
- [x] 3.4 为 CAS 冲突、commandId 幂等、evidence 剪裁上限和 paused snapshot 恢复编写 store 测试。

## 4. Harness 执行调度

- [x] 4.1 将 approved Plan 执行接入高层 `AgentOptions.shouldStopAfterTurn`，使 Tool batch 结束后可在下一模型 turn 前确定性停止。
- [x] 4.2 用 episode scheduler 替换 `continueIncompletePlan` 的 follow-up-only stall 判断，同时保留 Plan 完成后的 TaskState 对账与最终报告流程。
- [x] 4.3 在每次相关持久化提交和 Tool lifecycle 后读取一致 snapshot，更新 monitor，并保证 Tool 成功或 Plan version 增长不能单独重置 no-progress。
- [x] 4.4 首次 impasse 停止当前 episode，注入只含客观 incident facts 的 Main reflection frame，并用更小的独立 turn/Tool budgets 启动一次反思。
- [x] 4.5 反思后再次 impasse 时持久化 `paused_inconclusive`，保留 authorization、execution binding、Plan step、TaskState 和 TODO，不写入 blocked/failed/completed。
- [x] 4.6 为单 turn 持续 Tool Calls、hard cap、反思取得进展、反思后再停滞、已完成对账和 in-flight Tool 边界编写 Harness 集成测试。

## 5. 恢复协议与领域事件

- [x] 5.1 在 HarnessAPI 增加只读 episode snapshot，以及带 commandId、expectedVersion、revision 和 digest 的 adjust-plan / continue-execution 窄命令。
- [x] 5.2 实现 continue 创建新 episode 和全新预算但保留已验证进展；实现 adjust 将 incident facts 交给既有 replanning 流程。
- [x] 5.3 增加 presentation-neutral `plan:episode` 与 `plan:impasse` 事件，并限制 payload 为 bounded domain facts。
- [x] 5.4 扩展 WebSocket server/shared contract：广播 episode/impasse、处理 recovery commands，并在 Session ready/reconnect 时同步 paused snapshot。
- [x] 5.5 为 API stale conflict、重复命令幂等、断线不自动恢复和事件 payload 无 UI 文案编写协议测试。

## 6. Web 与 TUI 体验

- [x] 6.1 按原型在 Web Chat 的现有 Plan/TODO 层级中实现 running、reflecting、paused_inconclusive、completed 投影，不新增独立页面或 Critic persona。
- [x] 6.2 在 paused Web 状态显示 `未验证`、真实完成计数、incident reason、调整方案和继续执行，并处理 pending、conflict、reload/reconnect。
- [x] 6.3 在 TUI 对话层级实现同一 episode 投影和键盘可操作的两个 recovery actions，保持 Tool/Execution 详情可折叠。
- [x] 6.4 为 Web/TUI 增加投影测试，证明客户端不从 idle timer、spinner、断线或静默推断 pause/completion。
- [x] 6.5 浏览器验证亮暗主题、桌面和移动宽度、键盘焦点、可访问名称、无文本重叠和无横向溢出，并与 HTML 原型逐态对比。

## 7. 真实 incident 验收与交付

- [x] 7.1 将 Session `00MU6UD8KVT6VVQN5OHHN4D3YY` 的重复 action/progress 事实提炼为去敏固定 fixture，不依赖本机绝对路径或完整私有 transcript。
- [x] 7.2 回放 fixture，证明同一编辑动作不会达到 22 次，系统先执行一次反思，再在无语义进展时进入 `paused_inconclusive`。
- [x] 7.3 验证暂停前后 Plan revision/digest、authorization、current step、TaskState version 和 TODO outcome 保持正确，且未验证项未被标为 passed、blocked、failed 或 completed。
- [x] 7.4 验证 Adjust Plan 与 Continue Execution 两条恢复路径；Continue 使用新预算且 reconnect 本身不会触发恢复。
- [x] 7.5 运行相关单元/集成测试、`npm run typecheck`、`npm test`、`npm run build` 和 `openspec validate redesign-plan-executive-loop --strict`。
- [x] 7.6 根据最终 Web/TUI 实现决定原型 `archive` 或 `delete`，更新 `prototype.md`，并记录交付物、验证结论和未验证缺口。
