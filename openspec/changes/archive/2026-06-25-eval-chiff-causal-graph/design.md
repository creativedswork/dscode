## Context

当前 `/eval` 实现在 `src/eval/` 下，依赖 `SessionStore.loadSessionFile()` 读取 session JSON，然后执行：规则引擎分析（metadata、tool stats、regex phase 检测、Jaccard 偏离检测、固定模式根因推断）+ LLM one-shot 深度分析（发送压缩后的 session abstract，让 LLM 一次性输出 phases/deviations/rootCauses/suggestions）。Dashboard 为纯静态暗色 HTML。

CHIFF 论文（2026）提出了从 flat logs 到 causal graph 的 6 步方法：Step1 子任务分解 → Step2 子任务边（Data_Transfer + Failure Modes）→ Step3 Agent 节点 OTAR + 步级数据流 → Step4 Agent 间边 → build_dag_graph → Step5 候选错误集 → Step6 反事实根因裁决（Rule1/2/3）。发布代码为 1152 行 Python 纯脚本，temperature=0，正则解析，串行 6 次 LLM 调用。

CHIEF-ReAct 实现规格书（基于原代码的工程化分析）提出三个关键改造方向：(1) 图操作全部工具化/代码化（确定性、可单测），(2) structured output 替代正则解析，(3) 建图阶段保持确定性链、只在回溯/裁决阶段引入受约束 agentic 循环。

dscode session 日志的特殊性：session JSON 已包含结构化的 `thinking → toolCall → toolResult` 序列，比 CHIFF 原版处理的 Magnetic-One/CaptainAgent 日志更结构化。我们不需要 LLM 猜 agent 身份——`toolCall.name` 天然就是 agent-action identity；`thinking` 就是 Thought；`toolResult.content` 就是 Observation；`toolCall.arguments` 就是 Action。

## Goals / Non-Goals

**Goals:**
- 将 `/eval` 分析引擎从「规则+one-shot LLM」重构为「CHIFF 6 步因果图流水线」
- Step1-4 构建因果图：子任务分解 → 子任务间边 → Agent 节点（OTAR）+ 步级数据流 → Agent 间边
- Step5-6 反事实归因：候选错误集 → 3 条 Rule 裁决 → 单一根因（Agent + Step + Reason）
- Dashboard 展示因果图、数据流路径、Rule 推理链
- 保留现有规则引擎分析路径作为 LLM 失败时的降级方案
- 保持 `/eval` 命令接口不变（参数、输出位置、浏览器打开行为）

**Non-Goals:**
- 不引入受约束 ReAct 控制器（固定 6 步流水线已足够，避免 agentic 循环的调试复杂度和准确率退化风险）
- 不改动 SessionStore / SessionManager 的写路径
- 不引入 function-calling / tool_choice（避免增加 LLM 调用复杂度，structured output 通过 prompt 约束 + JSON.parse 实现）
- 不做增量/缓存分析（每次 `/eval` 都完整重跑 6 步）
- 不做实时监控或 batch 批处理

## Decisions

### 1. 架构选择：固定 6 步流水线（vs 受约束 ReAct）

**选择**: 固定 6 步串行流水线，每步一次 LLM 调用 + 确定性解析。

**替代方案**: 受约束 ReAct（CHIEF-ReAct 规格书推荐）。拒绝原因：
- `/eval` 是诊断工具，非持续运行的 agent，固定流水线的可复现性和 debug 友好度更重要
- dscode session 规模（单用户，通常 <200 条消息）远小于多 agent 系统，全量日志按步喂给 LLM 的 token 成本可控
- 建图阶段的确定性链（step1→4 严格顺序）本身就是 pipeline 最优形态，agentic 循环不会带来额外收益
- 回溯/裁决阶段改为循环可能退化掉点（CHIFF 论文消融实验已证明：只给图让 LLM 自由归因反而掉点）

### 2. Session 日志 → CHIFF 输入映射

dscode session 消息结构天然满足 CHIFF 的 OTAR 范式：

```
dscode 消息序列                CHIFF OTAR 四元组
─────────────────────────────────────────────────
assistant.thinking (type:thinking)  → Observation + Thought
   "Let me look at the current   →  用户上条回复 + 当前状态认知
    state of the project..."
assistant.toolCall[]              → Action
   {name:"read_file", args:{...}}  →  工具名 + 参数
toolResult.content[]              → Result
   {type:"text", text:"..."}       →  工具输出文本
```

**映射规则**：
- **agent 身份** = `toolCall.name`（如 `read_file`、`write_file`、`execute_blender_code`），一个 assistant 消息含多个 toolCall 时拆为多个 agent 节点
- **Observation** = 用户上一条消息内容 + 当前 toolResult 的前序 toolResult（上下文窗口）
- **Thought** = `thinking` 块文本
- **Action** = `toolCall.name + JSON.stringify(args)`
- **Result** = `toolResult.content` 中 text block 的前 500 字符

无需 LLM 推断 agent 身份——这是相对 CHIFF 原版的最大简化。

### 3. 6 步流水线详细设计

```
SerializedSession JSON
       │
       ▼
┌─────────────────────────────────────────┐
│  Step 0: Session Parser (确定性)          │
│  + 解析为 HistoryStep[]                  │
│  + 提取 metadata                         │
│  + 统计 tool stats                       │
├─────────────────────────────────────────┤
│  Step 1: 子任务分解 (LLM)                 │
│  + 输入: question + history 摘要          │
│  + 输出: Subtask[] (含 name, step_range,   │
│          oracle, loop_info)              │
├─────────────────────────────────────────┤
│  Step 2: 子任务边 (LLM)                   │
│  + 输入: subtasks + history              │
│  + 输出: SubtaskEdge[] (Data_Transfer     │
│          + Failure Modes)               │
├─────────────────────────────────────────┤
│  Step 3: Agent 节点 + 步级数据流 (LLM)     │
│  + 输入: subtasks + history              │
│  + 输出: AgentNode[](OTAR) +              │
│          StepDataFlow[]                  │
├─────────────────────────────────────────┤
│  Step 4: Agent 间边 (LLM)                │
│  + 输入: subtasks + agent_nodes          │
│  + 输出: AgentEdge[] (agent_failure_modes)│
├─────────────────────────────────────────┤
│  buildCausalGraph() (确定性)              │
│  + 组装 dag_graph                        │
│  + 计算拓扑序、数据流路径、循环组           │
├─────────────────────────────────────────┤
│  Step 5: 候选错误集 (LLM)                 │
│  + 输入: question + history + dag_graph   │
│  + 输出: CandidateSet (≥5 steps)          │
│  + 标注 loop/data/irrecover/impact       │
├─────────────────────────────────────────┤
│  Step 6: 反事实根因裁决 (LLM)             │
│  + 输入: candidate_set + dag_graph        │
│  + 输出: Attribution (agent+step+reason   │
│          + rules_applied)                │
│  + 执行 Rule1/2/3 推理                   │
└─────────────────────────────────────────┘
```

**Step 1-4 输入策略**：不像 CHIFF 原版那样 `str(history)` 全量塞入每次 prompt，而是：
- Step 1：喂 question + history 摘要（每步的 role + tool name + thinking 首 100 字）
- Step 2-4：喂前一步的结构化输出 + history 摘要
- 单步 prompt token 控制在 ~2000-4000 tokens

### 4. Structured Output 策略

**选择**: Prompt 约束输出格式 + JSON.parse + Zod schema 校验 + 解析失败 retry（最多 2 次）。

不使用 function-calling / tool_choice / JSON mode，原因：
- 保持与现有 `completeSimple` 调用方式兼容
- 避免 tool schema 定义的复杂度
- Prompt 约束在实践中对现代模型（DeepSeek-V3、Claude Sonnet 4）足够可靠

**Schema 校验层**：每个 step 的 LLM 输出先经 `extractJSON(text)` 提取 JSON 块，再经 Zod schema 校验。校验失败 → 重试（带修正提示）。

### 5. Graph Store 设计（确定性代码）

```typescript
class CausalGraphStore {
  // 写操作（Step 1-4 输出后调用）
  addSubtasks(subtasks: Subtask[]): void
  addSubtaskEdges(edges: SubtaskEdge[]): void
  addAgentNodes(nodes: AgentNode[]): void
  addAgentEdges(edges: AgentEdge[]): void
  addStepDataFlows(flows: StepDataFlow[]): void

  // 确定性查询（Step 5-6 用，纯代码，无 LLM）
  getTopoOrder(): string[]                    // 子任务拓扑序
  getPredecessors(stepId: number): number[]   // 数据流前驱
  getLoopGroups(): Map<string, number[]>      // 循环组
  getDataflowPath(dataItem: string): StepDataFlow[]  // 数据污染链
  getSubtaskOfStep(stepId: number): string | null

  // 校验
  isGraphComplete(): boolean                  // 子任务覆盖全部 step + OTAR 齐全 + 边齐全
  validateCoverage(): string[]                // 返回覆盖问题列表

  // 快照（给 Step 5-6 prompt）
  snapshot(): CausalGraphSnapshot
}
```

所有图操作是纯 TypeScript 函数，无 LLM 参与——消除幻觉，可单测。

### 6. 反事实归因 3 条 Rule 适配

CHIFF 的 3 条 Rule 直接适配到 dscode 的 tool-call 轨迹：

**Rule 1（控制流/循环）**：检测 agent 是否陷入了 repair-retry 循环。
- dscode 场景：同一 tool 在同一文件上反复调用（如连续 3+ 次 `edit` 修复同一行的不同问题）
- 判责：如果循环由错误的环境假设引起（如 MCP server 未连接但 agent 不断重试），归因于触发循环的第一个 tool call；如果循环本身合理但某次操作造成不可逆后果，归因于该操作

**Rule 2（数据流）**：追溯最终失败用到的错误数据来自哪里。
- dscode 场景：`read_file` 读到的内容被误解 → `write_file` 写了错误内容 → `bash test` 失败
- 判责：上游来但被误读 → 怪当前执行者；凭空生成无上游依据 → 怪生成者；本身正确但被误用 → 怪误用节点

**Rule 3（不可恢复点）**：根因归于第一个使正确路径无法再通过常规手段恢复的节点。
- dscode 场景：`write_file` 覆盖了关键配置，后续所有修复都基于错误配置进行
- 判责：即使最早出现偏差的是 M12，但如果 M18 的 `write_file` 才是第一个不可逆操作，归因于 M18

### 7. Dashboard 升级

**选择**: 保留暗色 HTML 主题，新增以下 section：
- **因果图可视化**：SVG 绘制 subtask→subtask 和 agent→agent 的依赖图，节点颜色编码 status（ok/warn/danger）
- **数据流路径**：表格式展示关键 data item 从产生到消费的完整链路
- **Rule 推理链**：折叠展示 Step 5→Step 6 的推理过程，标注每条 Rule 的判断逻辑和证据
- **保留内容**：Session 元数据卡片、Tool Stats 统计、Phase 时间线（从 step1 的 subtask 划分推导）

### 8. 降级策略

当 LLM 调用失败（网络错误、配额耗尽、JSON parse 重试仍失败）时：
- Step 1-4 中任一步失败 → 回退到规则引擎完整分析路径（复用现有 `analyzer.ts`）
- Step 5-6 失败 → 用规则引擎的 root cause inference 替代
- Dashboard 顶部标注「规则引擎降级分析（因果图构建失败）」

## Risks / Trade-offs

| 风险 | 缓解措施 |
|------|----------|
| 6 步串行 LLM 调用延迟高（20-40s） | 显示进度提示（"Step 1/6: 分解子任务..."）；Step 0 统计结果立即可展示 |
| LLM 输出格式不稳定导致解析失败 | Zod schema 校验 + 最多 2 次 retry + 最终降级规则引擎 |
| Token 成本增加（6 次 vs 1 次调用） | 每步输入精简（仅喂必要上下文，不塞全量日志）；总成本控制在 $0.03-0.08 |
| 因果图构建错误导致归因偏差 | Graph Store 确定性校验（coverage/consistency checks），不完整时不进入 Step 5 |
| OTAR 四元组提取质量依赖 thinking 块存在 | 无 thinking 时用 assistant text 块作为 Thought 降级；dscode session 几乎总有 thinking |
| Dashboard 复杂度增加 | 折叠面板 + 摘要先行，详细内容按需展开；保持整体暗色主题一致性 |

## Open Questions

- Step 1 子任务分解是否需要 RAG（检索相似任务的分解范例作为 few-shot）？初期不做，先验证纯 LLM 分解质量；如效果不佳后续添加
- 是否需要在 Dashboard 中做交互式因果图（可点击展开节点详情）？初期静态 SVG，后续迭代可加 JS 交互
