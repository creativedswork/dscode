## 1. Agent Process 通用基础设施

- [x] 1.1 在 Agent process types 中增加 `recording: "session" | "process-only"`，为旧调用和旧持久化记录提供 `"session"` 默认值
- [x] 1.2 将 recording 策略贯穿 `AgentSupervisor.spawn`、Process lifecycle、Store 序列化和 Harness 退出记录投影
- [x] 1.3 确保 process-only Agent 仍持久化 Process record、发布 lifecycle/activity 事件，但不写入 Session `agentMessages`
- [x] 1.4 为 `AgentProcessStore` 增加按显式 Agent ID 集合批量读取的只读 API，返回 found/missing 状态
- [x] 1.5 补充 recording 默认兼容、process-only 投影隔离、批量读取和缺失记录的单元测试

## 2. Multi-Agent Trajectory 数据模型

- [x] 2.1 新增 `TrajectoryActor`、`TrajectoryStep`、`TrajectoryEdge`、`TrajectoryEvidenceSummary` 和 `MultiAgentTrajectory` 类型
- [x] 2.2 实现 Main transcript 规范化，Actor 固定为 Main，tool name 仅写入 Step Action/toolName
- [x] 2.3 按 Session `agentMessages` 精确加载 SubAgent Process records，并规范化完整 runtime transcript
- [x] 2.4 实现 summary-only 与 missing transcript 降级，不伪造 thought、tool call 或内部 Step
- [x] 2.5 实现稳定全局 Step 排序，保持每个 Actor 本地顺序并处理并发时间戳
- [x] 2.6 构建 spawn/start/exit/result-return 控制边和可确定提取的数据引用边
- [x] 2.7 增加 Main-only、完整 SubAgent、重复 Application 实例、并发 SubAgent、summary-only、missing transcript fixtures 与测试
- [x] 2.8 验证历史 Session A 在当前 Session B 中评估时只读取 A 的冻结成员，不修改 A/B Session 数据

## 3. Eval Workspace 与统计

- [x] 3.1 将 workspace 调整为 `<target-prefix>/runs/<eval-run-id>/`，实现原子 manifest、library、output 创建
- [x] 3.2 写入 actor inventory、process topology、证据质量和不超过 200 Steps 的全局/Actor 索引 chunks
- [x] 3.3 实现 coordinator-only 的原子 stage output 写入，CHIEF workers 保持只读
- [x] 3.4 将保留策略调整为最近 10 个 completed runs，并保护 active run 与最新兼容 Dashboard
- [x] 3.5 重构 `computeStats()` 以纯函数方式消费 MultiAgentTrajectory，统计 Main/SubAgent tools、状态和 transcript 完整度
- [x] 3.6 补充 workspace 隔离/清理、manifest 失败状态、chunk 唯一覆盖和 Multi-Agent stats 测试

## 4. CHIEF Agent Applications 与结构化 Runner

- [x] 4.1 在 `resources/agents/` 新增 `chief-graph`、`chief-oracle`、`chief-backtrack`、`chief-attribution` Application 定义
- [x] 4.2 新增 `eval-rule-attribution` 与 `eval-rule-merge` Application 定义，并配置只读 tools、plan permission 和默认 effort/maxTurns
- [x] 4.3 更新 package resource/bundled asset 测试，确认源码、构建产物和 npm 包均包含新增 Applications
- [x] 4.4 实现通用 `runStructuredAgent()`：从 active Main Process 启动 foreground process-only worker、等待退出并提取输出
- [x] 4.5 为 structured runner 接入 Schema/Actor/Step reference 校验和一次 fresh-process retry
- [x] 4.6 接入 AbortSignal/Harness shutdown，确保取消当前 worker 后不再启动后续阶段
- [x] 4.7 使用 fake runtime 覆盖成功、worker failure、invalid JSON、unknown Actor、retry success、retry exhausted 和取消测试

## 5. 统一 CHIEF Pipeline

- [x] 5.1 重构 graph schemas，使 AgentNode/AgentEdge/DataFlow 使用真实 Agent ID、Application、role 和 Tool Action
- [x] 5.2 实现 CHIEF Graph Construction 输入/输出校验，覆盖 Subtask、OTAR、control/data edges 和图完整性
- [x] 5.3 实现 Virtual Oracle Synthesis stage 及 Goal/Preconditions/Key Evidence/Acceptance Criteria 全局一致性校验
- [x] 5.4 实现 Subtask → Agent → Step 三级 hierarchical backtracking stage 与候选引用校验
- [x] 5.5 实现 Local、Planning-Control、Data-Flow、Deviation-Aware/Irrecoverability progressive attribution stage
- [x] 5.6 扩展 Attribution/EvalResult，加入真实责任 Actor、nullable Step、granularity、confidence、evidenceQuality 和 screening stages
- [x] 5.7 用统一 Pipeline 替换 `FOCUS_PATH_THRESHOLD` 路由，Session 大小只影响 workspace chunking/read strategy
- [x] 5.8 删除 eval 私有 `focus/agent-loop.ts`、自定义 tool sandbox 和 eval 中所有直接 `completeSimple()` 调用
- [x] 5.9 将用户可见文案、Prompt、注释和代码标识从 CHIFF 更正为 CHIEF
- [x] 5.10 增加完整 transcript Step 归因、summary-only Agent 归因、planner/executor loop、跨 Agent 数据污染和可逆偏差测试

## 6. Recovery Arc 与 Harness Rules

- [x] 6.1 将 RecoveryArc 扩展为 error/correction Agent ID + Application，并增加 `agent_review` detection type
- [x] 6.2 按统一 trajectory 校验 Recovery Arc 的 Actor-Step 一致性、顺序、距离和有效性
- [x] 6.3 将跨 Agent Recovery Arc 接入 CHIEF Final Screening 与 rule attribution context
- [x] 6.4 重构 Harness Rule attribution，使 Application-specific suggestion 定向到责任 Application source/digest
- [x] 6.5 在 Application snapshot 缺失时禁止虚构配置路径，并支持 shared-layer/empty-rule 降级
- [x] 6.6 将 semantic merge 迁移到 Supervisor-backed worker，保留 Rule Store 兼容与非阻断失败策略
- [x] 6.7 补充跨 Agent recovery、late correction、Application target validation、unknown target retry 和旧 Rule Store 测试

## 7. Progress 与 Dashboard

- [x] 7.1 用统一 CHIEF stage events 替换 SCAN/ZOOM/SYNTHESIZE progress，并关联 worker Agent ID/Application/run ID
- [x] 7.2 复用 shared Agent Activity 展示 process-only workers，验证历史 Session 不恢复这些诊断进程
- [x] 7.3 按原型扩展 Dashboard Summary：Agent/Application 数、进程成功率和 transcript 完整度
- [x] 7.4 实现 Agent Process Lanes，区分 Main/SubAgent、并发范围、状态和 6 位短 ID
- [x] 7.5 更新 causal graph/data-flow rendering，使用真实 Agent nodes 并展示 control/result/data/recovery 边
- [x] 7.6 实现 Subtask/Agent/Step backtracking、root-cause granularity/confidence/screening evidence 展示
- [x] 7.7 实现 summary-only/missing transcript 告警与 Main-only 空状态
- [x] 7.8 补充 Dashboard HTML escaping、重复 Application 实例、partial evidence、Process Lanes 和短 ID 渲染测试

## 8. 命令集成与验证

- [x] 8.1 重构 `runEval()`：先冻结目标 Session/成员，再准备 trajectory/workspace，最后顺序编排 CHIEF workers
- [x] 8.2 保持 `/eval [session_id]`、最终 `<prefix>.html` 路径和自动打开行为兼容，失败时不覆盖最新成功 Dashboard
- [x] 8.3 更新 `/eval` help/description、日志标签和完成摘要为 CHIEF Multi-Agent 语义
- [x] 8.4 运行 eval、Agent process、Session、UI 相关测试及完整 `npm test`
- [x] 8.5 运行 `npm run typecheck`、`npm run build` 和 package resource 校验
- [x] 8.6 使用真实含多个 SubAgent 的 Session 验证 Step 级归因、Process Activity、Dashboard 与重复 `/eval` 不自我污染
- [x] 8.7 使用 Main-only 与缺失 transcript 的历史 Session 验证兼容降级和证据告警

## 验收说明

- 本机 Process Store 不存在自然产生的多 SubAgent 历史 Session；8.6 使用两个真实 Vision Process captures 组合为冻结的多 SubAgent Session fixture，验证了三个独立 lanes、重复 Application 实例、真实 Agent ID、Step ownership 和归因。真实单 SubAgent Session 的重复 isolated run 验证了原 Session 与 `agentMessages` 不变。
- 8.7 使用真实 Main-only Session 验证空状态；使用真实历史成员索引派生 transcript 与 summary 均不可用的兼容条件，验证 missing Actor 保留且不生成内部 Step。
- 完整 `npm test` 已执行；本变更定向测试全部通过。仓库全量及扩展回归仍包含沙箱禁止写 `~/.dscode`、本机 MCP 配置和既有 UI 断言造成的非本变更失败，未修改无关代码掩盖这些结果。
