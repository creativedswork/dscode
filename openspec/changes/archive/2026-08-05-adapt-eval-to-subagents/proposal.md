## Why

当前 `/eval` 只分析 Main Session 的 `messages`，并把 `read_file`、`write_file` 等工具名当作 Agent，既遗漏了 Session v3 中 `agentMessages` 关联的 SubAgent 完整执行记录，也违背 CHIEF 论文对“真实 Agent + Step”责任归因的定义。与此同时，Focus Pipeline 自建轻量 Agent Loop、其余阶段直接调用模型，绕过了 dscode 已确立的 `AgentSupervisor` 同构执行链。

## What Changes

- 将评估输入从单一 Main Session 扩展为 Multi-Agent Trajectory：以 Session `agentMessages` 为成员索引，从 `AgentProcessStore` 加载对应完整 transcript，并与 Main 消息、spawn/exit 控制事件稳定合并。
- 重构 `HistoryStep`，使用真实 `agentId`、Application、角色和父子关系标识执行者，将工具名保留为 Action，而不再作为 Agent 身份。
- 按论文正式名称统一为 CHIEF，并补齐 Hierarchical Oracle-Guided Backtracking：按 Subtask、Agent、Step 三级逐层缩小候选集，再执行 Local、Planning-Control、Data-Flow、Deviation-Aware 反事实归因。
- 用 `AgentSupervisor` 启动只读、同构的 CHIEF 评估 Application，替换 eval 内部的 `completeSimple()` 和自建 Agent Loop；`/eval` 仅负责确定性的数据准备、进程编排、Schema 校验与结果持久化。
- CHIEF 评估进程以 Main Process 为共同父进程运行，不放宽全局 SubAgent 深度；评估进程实时进入 Agent Activity，但使用 process-only 记录策略，避免后续 `/eval` 把历史评估过程纳入被评估轨迹。
- 为缺失 AgentProcess transcript 的旧 Session 提供 summary-only 降级，并显式输出证据完整度、归因粒度和置信度；无 SubAgent 的 Session 继续走单 Agent 兼容路径。
- 扩展 eval 统计、规则归因、Recovery Arc 和 HTML Dashboard，展示 Agent Process Lanes、真实 `application + 6 位 agent id`、跨 Agent 因果路径、三级回溯结果及 transcript 缺失告警。
- 保持 `/eval [session_id]` 命令语法和 `~/.dscode/eval/` 输出位置不变。

## Capabilities

### New Capabilities

- `eval-multi-agent-trajectory`: 聚合 Main Session 与其 SubAgent Process transcript，生成带真实进程身份、控制边、数据边和证据质量的统一评估轨迹。
- `chief-evaluation-workers`: 通过 `AgentSupervisor` 和声明式 Agent Applications 执行 CHIEF 各阶段，定义只读工作区、结构化输出校验、重试和 process-only 记录行为。

### Modified Capabilities

- `eval-causal-graph`: 从工具级伪 Agent 图改为真实 Multi-Agent Hierarchical Causal Graph，并补齐 Oracle 合成、Subtask/Agent/Step 三级回溯和论文定义的渐进式反事实归因。
- `chiff-agent-loop`: 移除 eval 私有轻量 Agent Loop，由统一 SubAgent Runtime 承担自主探索；现有能力迁移为 CHIEF worker 执行契约。
- `chiff-workspace`: 工作区改为按 eval run 隔离，并写入 Main/SubAgent 轨迹、进程拓扑和证据完整度，供只读 CHIEF workers 使用。
- `chiff-progress-display`: 进度来源改为 AgentSupervisor 生命周期事件与 CHIEF 阶段事件，并使用正确的 CHIEF 名称。
- `eval-stats-computation`: 统计范围扩展到 Main 与 SubAgent transcript，新增 Agent 数量、Application 数量、进程成功率和 transcript 完整度。
- `eval-dashboard`: 新增 Agent Process Lanes、跨 Agent 因果路径、三级回溯和证据质量展示，根因使用真实 Application、短 Agent ID 与 Step。
- `eval-llm-rule-attribution`: 规则归因接收真实责任 Agent 的 Application 快照与来源，将配置建议定向到对应 Agent Application 或共享 Harness 层。
- `eval-recovery-arc`: Recovery Arc 支持错误 Agent 与修复 Agent 不同的跨进程恢复路径，并使用真实 Agent 身份。

## Impact

- **核心代码**：`src/eval/` 的 trajectory、schema、workspace、pipeline、stats、rules、dashboard 和命令入口。
- **Agent 运行时**：`AgentSupervisor`、`AgentProcessStore`、`SpawnAgentRequest` 增加通用的持久化策略与按 Agent ID 批量读取能力；不提高 `maxDepth`。
- **Agent Applications**：`resources/agents/` 新增 CHIEF graph、backtrack、attribution、rule attribution 和 semantic merge 等只读 Application 定义。
- **Session 兼容性**：Session v3 `agentMessages` 仍是成员索引；旧 Session 和 transcript 缺失场景可降级，不修改 Main Agent 推理上下文。
- **类型与输出**：`HistoryStep`、`Attribution`、`EvalResult` 和统计结构增加进程身份及证据质量字段；旧 Dashboard 文件无需迁移，重新运行 `/eval` 即生成新格式。
- **UI**：生成式 eval Dashboard 发生可见变化，设计依据为 `docs/prototypes/adapt-eval-to-subagents.html`。
