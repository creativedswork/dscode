## Context

CHIEF 的目标是从 LLM Multi-Agent System 的失败轨迹中定位真实的 `(agent, step)` 根因。论文假设每个 Step 都有明确的执行 Agent，并通过 Subtask、Agent OTAR、Step 数据流和进程间依赖构建 Hierarchical Causal Graph，再以 Virtual Oracle 进行 Subtask → Agent → Step 三级回溯。

当前实现存在四个结构性偏差：

| 维度 | 当前实现 | CHIEF / dscode 目标 |
|---|---|---|
| Agent 身份 | `HistoryStep.agent = toolCall.name` | `agentId + Application + role` |
| 输入范围 | 仅 `SerializedSession.messages` | Main transcript + Session 成员 SubAgent transcript |
| 搜索过程 | 全图候选集或自定义 SCAN/ZOOM | Oracle 指导的 Subtask → Agent → Step 回溯 |
| 执行运行时 | `completeSimple()` + eval 私有 Agent Loop | `AgentSupervisor` + `PiAgentRuntimeAdapter` |

Session v3 已通过 `agentMessages` 保存 SubAgent 的成员索引与摘要，完整 transcript 则位于 `AgentProcessStore` 的 `runtimeSnapshot.messages`。两者必须联合读取，但 SubAgent transcript 不能混入 Main Agent 的推理 `messages`。

dscode 允许并发 SubAgent，而论文以单 Agent 每时刻行动的 turn-based MAS 为基础。因此实现需要保留稳定的展示顺序，同时以显式控制边和数据边表达真实的偏序关系，不能仅依赖数组位置推断因果。

## Goals / Non-Goals

**Goals:**

- 对 Main Agent 和 Session 成员 SubAgent 进行统一、可追溯的真实 Agent 归因。
- 使用一个规范化的 Multi-Agent Trajectory 同时服务统计、CHIEF Pipeline、规则归因和 Dashboard。
- 补齐 Virtual Oracle 合成与 Subtask → Agent → Step 三级回溯。
- 将所有 eval LLM 工作迁移到声明式 Agent Applications 和 `AgentSupervisor`。
- 保持 `/eval [session_id]`、Session v3 Main/SubAgent 隔离和旧 Session 可用性。
- 让评估过程实时可见，但不污染未来再次评估的目标轨迹。

**Non-Goals:**

- 不提高全局 `maxDepth=1`，也不允许 CHIEF worker 再派生子进程。
- 不把 SubAgent transcript 注入 Main Agent 对话上下文。
- 不复现 Who&When benchmark 的显式 ground-truth answer 输入；dscode 继续从用户目标、执行结果和后续反馈合成 Virtual Oracle。
- 不在本变更中建立自动回放、故障注入或训练数据生成系统。
- 不迁移已生成的旧 HTML Dashboard；重新运行 `/eval` 即可生成新格式。

## Decisions

### 1. `agentMessages` 定义成员集合，`AgentProcessStore` 提供完整证据

评估器 SHALL 先冻结目标 `SerializedSession` 快照，再按其中 `agentMessages[].agentId` 批量加载 `SerializedAgentProcess`。Session 记录决定“哪些 SubAgent 属于本次用户任务”，Process Store 只补充这些成员的完整 transcript。

不采用 `AgentProcessStore.list(parentSessionId)` 作为成员来源，原因是同一 Session 下可能存在历史诊断进程、系统进程或保存顺序差异；仅按 `parentSessionId` 扫描会把评估器自身纳入下一次评估。

加载结果分为：

- `full`：存在合法 `runtimeSnapshot.messages`，可进行 Step 级归因。
- `summary`：只有 `AgentSessionMessage`，生成一个带明确低证据等级的 coarse Step。
- `missing`：索引存在但 Process Store 无记录且摘要不足，保留进程节点和缺失告警，不伪造 transcript。

Main transcript 直接来自 Session `messages`。若 `agentMessages.parentAgentId` 可推断 Main ID，则复用该 ID；否则使用稳定的 Session-local Main identity，不伪造 UUID。

### 2. 引入统一的 `MultiAgentTrajectory`

新增规范化数据模型：

```ts
interface TrajectoryActor {
  agentId: string;
  application: string;
  role: "main" | "subagent";
  parentAgentId?: string;
  applicationSource?: string;
}

interface TrajectoryStep {
  stepId: number;
  actor: TrajectoryActor;
  kind: "response" | "tool_call" | "spawn" | "exit" | "summary";
  toolName?: string;
  observation: string;
  thought: string;
  action: string;
  result: string;
  timestamp: number;
  localOrder: number;
  evidenceQuality: "full" | "summary";
}

interface MultiAgentTrajectory {
  session: SerializedSession;
  actors: TrajectoryActor[];
  steps: TrajectoryStep[];
  controlEdges: TrajectoryEdge[];
  evidence: TrajectoryEvidenceSummary;
}
```

工具名只出现在 `toolName/action`，不得再作为 Actor。Main 和每个 SubAgent transcript 各自在本地保持原始顺序；全局 `stepId` 按 `timestamp → actor stable key → localOrder` 确定性排序。spawn、child start、child exit、parent tool result 之间建立控制边，工具输入输出及消息引用建立数据边。并发执行依赖图边表达，时间排序只用于稳定编号和展示。

所有后续模块只接收 `MultiAgentTrajectory`，避免 stats、Focus workspace 和 causal graph 各自重复解析 Session。

### 3. 用一条 CHIEF Pipeline 替代 fast/focus 双语义

移除基于 `FOCUS_PATH_THRESHOLD` 的两套归因语义。Session 大小只影响 workspace 分块和 worker 读取策略，不改变分析阶段：

1. **Prepare（确定性）**：构建 trajectory、stats、workspace index。
2. **Graph Construction**：生成 Subtask、真实 Agent OTAR、Subtask/Agent/Step edges。
3. **Virtual Oracle Synthesis**：按 Subtask 顺序生成 Goal、Preconditions、Key Evidence、Acceptance Criteria，并进行全局一致性检查。
4. **Hierarchical Backtracking**：逆拓扑执行 Subtask → Agent → Step 三级筛选。
5. **Counterfactual Attribution**：依次应用 Local、Planning-Control、Data-Flow、Deviation-Aware/Irrecoverability Screening，输出单一根因。
6. **Harness Rule Attribution / Merge**：结合责任 Application 快照生成并合并配置规则。

大 Session 写入按 Actor 和 Step range 分块的 library；小 Session 使用同样的文件格式但块数更少。这样保留 Iterative Focusing 的成本控制目标，同时避免两条 Pipeline 产生不同定义的候选集与根因。

### 4. CHIEF 阶段由声明式 SubAgent Applications 执行

新增 bundled Applications：

- `chief-graph`
- `chief-oracle`
- `chief-backtrack`
- `chief-attribution`
- `eval-rule-attribution`
- `eval-rule-merge`

Application 使用 `permissionMode: plan`，工具限定为 `read_file`、`grep`、`glob`，`cwd` 指向本次 eval workspace。项目或用户可通过既有 Agent Application 优先级覆盖模型、effort 和 prompt，无需修改 Pipeline 代码。

`/eval` 使用一个通用 `runStructuredAgent()`：

1. 以 Main Process 为 `parentAgentId` 调用 `AgentSupervisor.spawn()`。
2. 等待 foreground worker 退出。
3. 从 `AgentExitResult.output` 提取 JSON 并执行 TypeScript Schema 校验。
4. 校验失败时启动一个新的同 Application worker，输入验证错误与前次输出摘要；最多重试一次。
5. 将通过校验的输出由 coordinator 写入 workspace `output/`，worker 本身保持只读。

所有 workers 都是 Main Process 的直接子进程。`/eval` coordinator 是确定性 Kernel 逻辑，不建模为 Agent，不需要放宽 SubAgent 深度。

### 5. 增加通用的 process-only 记录策略

`SpawnAgentRequest` 和 `AgentProcess` 新增可选 `recording: "session" | "process-only"`，默认值为 `"session"`：

- 两种策略都进入 Process Table、AgentProcessStore 和实时 Agent Activity。
- `"session"` 继续在退出后写入父 Session `agentMessages`。
- `"process-only"` 不写入 `agentMessages`，适用于诊断、索引、维护等不属于用户任务轨迹的系统进程。

CHIEF workers 使用 `"process-only"`。这不是 eval 专用分支，避免 Application 名称或业务逻辑泄露到 Supervisor/Harness。

评估历史 Session A 时，workers 仍属于发起命令的当前 Main Process/Session B，目标 Session A 仅作为只读输入。目标快照必须在 spawn 第一个 worker 前完成。

### 6. Workspace 按 run 隔离且只读暴露

目录结构调整为：

```text
~/.dscode/eval/<target-session-prefix>/
  latest.html
  runs/<eval-run-id>/
    manifest.json
    library/
      session.md
      actors.json
      topology.json
      steps-0000-0199.json
      actor-<short-id>-*.json
    output/
      graph.json
      oracles.json
      candidates.json
      attribution.json
      rules.json
```

为保持外部兼容，最终 Dashboard 仍同时写入既有 `~/.dscode/eval/<session-prefix>.html`。run 目录避免重复评估互相覆盖，也为问题复现保留输入和阶段输出。worker capability 校验将所有文件访问限制在该 run 目录。

### 7. 归因结果显式携带粒度与证据质量

`Attribution` 增加：

- `mistakeAgentId`
- `mistakeApplication`
- `mistakeStep: number | null`
- `granularity: "step" | "agent"`
- `confidence: number`
- `evidenceQuality: "complete" | "partial"`
- `screeningStages`

完整 transcript 必须输出 Step 级归因。summary-only Actor 可进入 Agent 级候选，但系统不得虚构具体 Step；若最终只能定位该 Actor，则 `mistakeStep=null`、`granularity="agent"`，并在 Dashboard 显示证据不足。规则建议只有在 Application 快照存在时才能定向到该 Application；否则回退到共享 Harness 层并说明依据。

### 8. Dashboard 以进程和因果证据为主线

Dashboard 保留现有统计、Causal Graph、Recovery Arc、Harness Rules 和 Rule Trends，并新增：

- Main/SubAgent 总数、Application 数、进程成功率、transcript 完整度。
- Agent Process Lanes，使用 Application 与 6 位短 Agent ID。
- 跨 Agent 控制流和数据流路径。
- Subtask、Agent、Step 三级 backtracking 候选范围。
- 根因 Actor、Step/Agent 粒度、置信度和四阶段筛选证据。
- summary-only/missing transcript 的醒目告警。

交互和视觉依据为 `docs/prototypes/archive/2026-08-05-adapt-eval-to-subagents/adapt-eval-to-subagents.html`。Dashboard 仍是无外部依赖的自包含 HTML。

### 9. CHIFF 更正为 CHIEF

用户可见文案、代码注释、类型名和新 Application 统一使用论文正式名称 CHIEF。现有 OpenSpec capability 目录 `chiff-*` 通过 delta spec 修改行为，归档时保持历史可追踪性；实现中没有必要保留拼写错误的公开 API。

## Risks / Trade-offs

- **[旧 Session 缺少完整 SubAgent transcript]** → 使用 summary-only Actor 和 Agent 级归因，显式降低置信度，绝不伪造 Step。
- **[并行 Agent 的时间戳不能表达完整因果]** → 稳定时间排序只负责编号，实际归因依赖 spawn/control/data edges。
- **[多个 CHIEF workers 增加模型成本与延迟]** → 统一 workspace 分块、严格候选剪枝、阶段输出复用；不再维护语义不同的第二条 Pipeline。
- **[Application override 输出不符合 Schema]** → coordinator 做强校验并以新进程重试一次，仍失败则明确终止，不生成误导性 Dashboard。
- **[process-only 引入新的通用进程状态]** → 字段可选且默认 `"session"`；旧 SerializedAgentProcess 加载时按 `"session"` 解释。
- **[Virtual Oracle 没有 benchmark ground truth]** → 同时使用初始用户目标、后续用户反馈、工具结果和最终状态合成，并在结果中暴露置信度。
- **[Process Store 读取扩大 I/O]** → 仅按 `agentMessages` 中的精确 Agent IDs 批量读取，不扫描或加载无关进程。
- **[统一 Pipeline 改动面大]** → 先固定 trajectory 和 worker runner 契约，再逐阶段替换；旧实现保留在短期 feature branch 中作为回滚点，不在运行时维护双路径。

## Migration Plan

1. 先扩展 Agent process recording 与批量读取 API，默认行为保持不变。
2. 实现 `MultiAgentTrajectory` 和 fixtures，验证 Main-only、完整 SubAgent、缺失 transcript、并发 SubAgent。
3. 新增 CHIEF Applications 与 `runStructuredAgent()`，在测试中以 fake runtime 验证生命周期和 Schema 重试。
4. 用统一 CHIEF Pipeline 替换 fast/focus 路由，删除 eval 私有 Agent Loop 和直接模型调用。
5. 接入 stats、rule attribution、recovery arcs 和 Dashboard。
6. 完成旧 Session 兼容测试、全量 typecheck/test/build，并用真实含 SubAgent 的 Session 运行 `/eval`。

回滚时可整体回退统一 Pipeline 提交；process recording 新字段为向后兼容的可选字段，不需要数据回滚。

## Open Questions

- eval run 目录的长期清理策略沿用当前“保留最近 N 个 workspace”，N 的默认值在实现阶段根据现有 `cleanOldWorkspaces(10)` 保持为 10。
- CHIEF worker 的默认模型与 effort 先继承 Harness 配置；后续可通过 bundled Application frontmatter 独立调优，不阻塞本变更。
