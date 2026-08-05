## 变更综述

`/eval` 从最初的 Session 统计与偏离报告，逐步演进为基于因果图、Recovery Arc、LLM 规则归因和文件工作区的分析系统；与此同时，dscode 建立了统一的 Agent Process、Application、Supervisor 和 Session v3 `agentMessages` 模型。本次变更将两条演进线合并：以 Main transcript 和冻结的 SubAgent Process transcript 构建真实 Multi-Agent Trajectory，使用 AgentSupervisor-backed CHIEF workers 完成 Virtual Oracle 指导的 Subtask → Agent → Step 回溯及渐进式归因，并让进度、规则和 Dashboard 都使用真实 Agent 身份与证据质量。旧实现中把工具名当 Agent、仅分析 Main、直接调用模型、自建轻量 Agent Loop、重复评估污染目标轨迹等结构性问题由此消除。

## 变更时间线

- 2026-06-03: `eval-slash-command` — 创建 `/eval`、Session 分析引擎和自包含 HTML Dashboard。
- 2026-06-12: `eval-llm-autonomous-rules` — 将规则归因和语义合并从硬编码检测器迁移为 LLM 推理。
- 2026-06-14: `chiff-iterative-focusing` — 为大 Session 引入 Scan/Zoom/Synthesize 分块聚焦和 Budget Guard。
- 2026-06-15: `chiff-agent-tools` — 引入 eval 文件工作区和可使用只读工具自主探索的轻量 Agent Loop。
- 2026-06-15: `deterministic-agent-nodes` — 将已知 OTAR 数据的搬运改为确定性构建，减少不必要模型调用。
- 2026-06-15: `eval-recovery-arc` — 增加错误发现、纠正、恢复效果和根因反推。
- 2026-06-15: `eval-remove-rule-engine` — 删除低质量规则引擎降级，让推理失败显式传播。
- 2026-06-15: `fix-eval-progress-and-crash-logging` — 补充阶段进度与崩溃日志。
- 2026-06-25: `eval-chiff-causal-graph` — 将扁平分析升级为分层因果图和反事实根因归因。
- 2026-08-04: `subagent-design-proposal` — 建立 Agent Process、Application、Supervisor、Process Store 和统一 SubAgent Runtime。
- 2026-08-04: `show-subagents-in-conversation` — 将 Agent 生命周期投影到共享 Web/TUI Agent Activity。
- 2026-08-04: `include-subagents-in-session-dashboard` — 让 Session Dashboard 统计持久化的 SubAgent 执行。
- 2026-08-04: `adapt-eval-to-subagents` — 将 `/eval` 统一为真实 Multi-Agent CHIEF Pipeline。

## 初始设计

最初的 `/eval` 用于回答“AI 在这个 Session 中表现如何、哪里偏离目标、根因是什么”。它读取单个 Session，执行 Phase 划分、关键词偏离检测、根因推断和工具统计，随后在 `~/.dscode/eval/` 生成并打开 HTML Dashboard。该版本建立了稳定的命令语法、Session 查找入口和输出位置，但分析对象只有 Main Session，根因主要来自启发式规则和扁平日志。

随后 `eval-chiff-causal-graph` 引入 Subtask、OTAR、因果边、候选集和反事实裁决。不过当时没有 Agent Process 模型，设计将 tool name 当作 agent-action identity；这在单 Main ReAct 轨迹中能够区分动作类别，却不能表达真实 Multi-Agent 系统中的责任主体。

## 变更记录

### 变更: 从硬编码分析迁移到 LLM 因果推理
- **触发**: 正则、关键词白名单和固定规则只能发现已知偏差，无法处理创意漂移、数据污染和复杂配置问题。
- **改动**: 删除 deterministic rule-engine fallback；阶段、偏差、根因和 Harness Rule 改由因果上下文中的 LLM 推理产生，semantic merge 改为语义判断。
- **影响**: `src/eval/analyzer.ts` 收缩为纯统计，失败不再伪装成低质量成功结果。

### 变更: 为大 Session 引入聚焦与文件工作区
- **触发**: 全量历史反复注入 prompt 会导致上下文膨胀、输出截断和 JSON 解析失败。
- **改动**: 先引入 Scan/Zoom/Synthesize、Budget Guard 和 Session Skeleton，随后把材料落入 workspace，让分析 Agent 用 `read_file`、`grep`、`glob` 主动读取。
- **影响**: 大 Session 可按区域和 Step 范围分块；workspace 成为可复现分析输入。

### 变更: 增加 Recovery Arc
- **触发**: 单一错误点无法解释错误如何被发现、由谁修复、修复是否有效以及恢复成本。
- **改动**: Attribution 增加 error → detection → correction 轨迹，并把恢复证据传给最终归因、规则生成和 Dashboard。
- **影响**: 当前实现进一步支持不同 Agent 间的恢复路径、`agent_review` 和 Actor-Step 一致性校验。

### 变更: 建立统一 Agent Process Runtime
- **触发**: Main、Vision 和未来 SubAgent 需要共享进程身份、Application 快照、生命周期、持久化和权限派生，而不是各自维护平行运行时。
- **改动**: 引入 AgentSupervisor、Process Store、AgentApplication、Process Activity 和 Session v3 `agentMessages` 成员摘要。
- **影响**: `/eval` 可以从冻结的 Session 成员索引精确加载完整 SubAgent transcript，并通过同一 Supervisor 启动诊断 workers。

### 变更: 从 CHIFF 单轨迹实现统一为 Multi-Agent CHIEF
- **触发**: 旧 `/eval` 仍只解析 Main `messages`，把 `read_file` 等工具名当 Agent；Focus 私有 Loop 与直接 completion 又绕过统一 Runtime。
- **改动**: 新增 MultiAgentTrajectory、run-isolated workspace、Virtual Oracle、三级回溯、progressive attribution 和六个 bundled Applications；删除运行时 fast/focus 语义分叉、私有 Agent Loop 和 eval 内直接 `completeSimple()`。
- **影响**: Stats、Recovery、Rules、Progress 和 Dashboard 共用真实 `agentId + Application + role`；工具名只保留在 Action。

## 修复记录

### 修复: 大 Session 输出截断与崩溃不可见
- **症状**: 大 Session 的模型输出被截断并触发 `Unterminated string in JSON`，用户只看到长时间等待或空分析。
- **根因**: 全量 prompt、无严格预算、JSON 解析保护不足，且进度和 stack trace 未进入 eval 日志。
- **修复**: 分块工作区、结构化输出校验、一次 fresh-process retry、统一 CHIEF stage progress，以及失败 manifest/log 记录。

### 修复: 工具名被误认为 Agent
- **症状**: Dashboard 和 Attribution 把 `read_file`、`write_file` 等动作类型显示为责任 Agent，无法定位真实 SubAgent。
- **根因**: 早期实现建立于单 Main ReAct 日志，没有真实进程身份来源。
- **修复**: Actor 只来自 Main identity 或冻结 Session 的 `agentMessages`；Application 与 digest 只从 Process snapshot 推导；tool name 仅进入 Step Action。

### 修复: 旧 Session 证据不足时可能产生过度精确归因
- **症状**: 只有 Agent 摘要或 Process record 已丢失时，系统仍可能给出没有 transcript 支撑的内部 Step。
- **根因**: 输入模型未区分完整 transcript、终态摘要和成员存在但证据缺失。
- **修复**: 引入 `full / summary / missing`，summary 最多生成一个 coarse Step，missing 保留 Actor 但生成零个内部 Step；Step attribution 必须通过 Actor ownership 和 evidence-quality 校验。

### 修复: eval 诊断进程污染后续 eval
- **症状**: 若诊断 workers 作为普通 SubAgent 写入目标 Session，重复 `/eval` 会把上一次评估过程当成用户任务轨迹。
- **根因**: Agent Process 持久化与 Session `agentMessages` 投影此前是同一个不可分策略。
- **修复**: 增加通用 `recording: "session" | "process-only"`；CHIEF workers 保留 Process record 和实时 Activity，但不写入任务 Session。

## 最终状态

### Why

当前 `/eval` 只分析 Main Session 的 `messages`，并把 `read_file`、`write_file` 等工具名当作 Agent，既遗漏了 Session v3 中 `agentMessages` 关联的 SubAgent 完整执行记录，也违背 CHIEF 论文对“真实 Agent + Step”责任归因的定义。与此同时，Focus Pipeline 自建轻量 Agent Loop、其余阶段直接调用模型，绕过了 dscode 已确立的 `AgentSupervisor` 同构执行链。

### What Changes

- 将评估输入扩展为 Multi-Agent Trajectory：以冻结的 Session `agentMessages` 为成员索引，从 `AgentProcessStore` 精确加载完整 transcript，并与 Main 消息及显式控制/数据边稳定合并。
- 使用真实 `agentId`、Application、role 和 parent relationship 标识 Actor；tool name 仅作为 Step Action。
- 统一论文正式名称 CHIEF，按 Graph Construction → Virtual Oracle → Subtask/Agent/Step Backtracking → Progressive Attribution 执行单一 Pipeline。
- 通过标准 `AgentSupervisor.spawn()` 启动 `chief-graph`、`chief-oracle`、`chief-backtrack`、`chief-attribution`、`eval-rule-attribution` 和 `eval-rule-merge`。
- CHIEF workers 使用 foreground、read-only、`process-only` 记录策略，实时进入 Agent Activity，但不污染任务 Session。
- workspace 使用 `<target-prefix>/runs/<run-id>/` 隔离，原子写入 manifest、library、最多 200 Steps 的 chunks 和 stage outputs；保留最近 10 个 completed runs 并额外保护 active runs。
- 对旧 Session 提供 `summary` 和 `missing` 降级，显式输出证据完整度、归因粒度和置信度；Main-only Session 保持兼容。
- Recovery Arc 支持跨 Agent 修复；Harness Rule 定向到责任 Application snapshot，缺少 snapshot 时不虚构路径并回退 shared layer。
- Dashboard 展示 Agent/Application 统计、Process Lanes、真实 Agent nodes、control/result/data/recovery edges、三级回溯和 partial-evidence 告警。
- 保持 `/eval [session_id]`、最终 `<prefix>.html` 兼容路径和成功后自动打开行为；失败时不覆盖最近成功 Dashboard。

### Capabilities

新增：

- `eval-multi-agent-trajectory`
- `chief-evaluation-workers`

更新：

- `eval-causal-graph`
- `chiff-agent-loop`
- `chiff-workspace`
- `chiff-progress-display`
- `eval-stats-computation`
- `eval-dashboard`
- `eval-llm-rule-attribution`
- `eval-recovery-arc`

### Impact

- `src/agents/process/` 增加 recording 策略与按 Agent ID 批量读取。
- `src/core/harness.ts` 隔离 process-only Session 投影，并在 shutdown 终止仍运行的诊断 workers。
- `src/eval/` 增加 trajectory、CHIEF workspace/runner/pipeline/validation，统一 stats、rules、progress 和 dashboard；旧 Focus 执行文件只保留确定性兼容逻辑。
- `resources/agents/` 和构建资源清单增加六个只读 Applications。
- Session v3 格式与 Main 推理上下文保持兼容；SubAgent transcript 不注入 Main messages。
- UI 依据 `docs/prototypes/adapt-eval-to-subagents.html` 升级生成式 eval Dashboard。
