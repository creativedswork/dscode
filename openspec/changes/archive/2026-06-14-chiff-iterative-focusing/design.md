## Context

CHIFF 因果图分析管线（`src/eval/llm.ts` — `runCausalGraphPipeline`）对大 session 崩溃。session 00MQCGO6（1.8MB / 11,136 行 / ~1000+ steps）触发 `Unterminated string in JSON`，链路如下：

```
runCausalGraphPipeline()
  → Step 1-6 某步: LLM prompt >100K tokens → 输出截断 → JSON.parse 💥
  → catch → attributeWithLLM() fallback
    → extraction.ts:215: JSON.parse(json) 再次 💥（无 try/catch 保护）
      → runEval() catch → ui.addError("eval: Unterminated string in JSON...")
```

根因有三个层面：一是 prompt 膨胀（每步 LLM 全量注入 session 历史），二是输出截断（未设置 maxTokens），三是 JSON.parse 裸奔（无异常保护）。

现有设计将所有步骤和历史作为单一 LLM 上下文传入，假设 session 总能装进 context window。对于大 session，这个假设不成立。

历史技术方案归档于
`docs/archive/implemented/eval/CHIFF-ITERATIVE-FOCUSING.md`，本文档聚焦架构决策和取舍。

## Goals / Non-Goals

**Goals:**
- 任意规模 session（从 10 步到 10,000+ 步）都能稳定完成 CHIFF 归因，不崩溃，不降级到纯规则引擎
- 每次 LLM 调用的 prompt 控制在 ~15K tokens 以内
- 保留现有 CHIFF 概念（Subtask, AgentNode, CandidateSet, Attribution）和类型
- <500 steps 的 session 保持现有 7-step 管线的低延迟（3-5 次 LLM 调用）
- 跨 zone 级联路径可视化——不仅报告"哪一步错了"，还展示"错误如何传播"

**Non-Goals:**
- 改变规则引擎（analyzer.ts）的任何行为——它作为 Pass 0 完整保留
- 改变 causal graph store 或 schemas 的类型定义
- 改变 dashboard 生成或 session 存储格式
- 实现真正的多 LLM 并行（单次 eval 内）——Pass 2 架构支持并行，但 V1 串行执行
- 改变语义规则合并（Step 8）的逻辑

## Decisions

### 1. 三 Pass 架构 vs. 单 Pass 压缩

**Decision**: 三 Pass 迭代聚焦（Scan → Zoom → Synthesize），而非在现有 7-step 管线内加 prompt 压缩。

**Rationale**: 
- 7-step 管线每步需求不同：Step 1 只需阶段信息，Step 3 需要每步细节。在单 pass 内做差异化压缩需要大幅修改每个 step 的 prompt builder，且难以验证每步拿到的是"足够"还是"太多"。
- 三 Pass 的更清晰：Scan 回答"看哪里"，Zoom 回答"发生了什么"，Synthesize 回答"为什么"。每个 Pass 的信息需求明确定义。
- 现有 7-step 完整保留作为 <500 steps 的快速路径——两种模式不互相污染。

**Alternative considered**: 在现有 buildStep1Prompt ~ buildStep6Prompt 中直接截断 history summary。Rejected — 截断策略对 6 个不同 step 需要 6 种不同逻辑，维护成本高，且仍无法解决"Step 3 需要全部细节但 Step 5 只需要候选"的矛盾。

### 2. Skeleton 构建：规则引擎驱动 vs. LLM 驱动

**Decision**: SessionSkeleton 由规则引擎（analyzer.ts）的确定性输出构建，无 LLM 调用。

**Rationale**:
- 规则引擎已经免费跑了一遍（runCausalGraphPipeline 的 Step 0），输出了 phases[], deviations[], rootCauses[], signals[], stats
- 这些信号直接可映射为 Hot/Cold Zones——用户投诉 → danger phase → Hot Zone；工具报错 → warn phase → Hot Zone
- 确定性构建意味着 Skeleton 永远可重现，不受 LLM 随机性影响
- 如果规则引擎误判（冷区其实有隐藏问题），Pass 1 Scan 仍有机会发现——Skeleton 包含 Cold Zones 的统计摘要，LLM 可能从数据模式中注意到异常

**Alternative considered**: 让 LLM 直接扫描 compressed history 来划分 Hot/Cold。Rejected — 引入不必要的 LLM 调用，且对于超大 session compressed history 仍然很大。

### 3. Zone 分析粒度：单次 Zoom LLM vs. 拆分 Step 1-5

**Decision**: 每个 Zone 内用一次 LLM 调用完成所有分析（子任务分解 + 数据流 + agent 节点 + 候选错误），而不是拆成 5 个独立 LLM 调用。

**Rationale**:
- Zone 只有 ~200 steps，LLM 可以在单次调用中全面理解
- 一次调用比 5 次调用更快（减少网络往返），且对 zone 内分析的一致性更好
- 每个 LLM 调用有固定开销（prompt processing），5 个 4K-token prompt 比 1 个 12K-token prompt 更贵

**Alternative considered**: 在 Zone 内保留原始 5-step 结构。Rejected — Zone 足够小，不需要再拆分；保留 5-step 会增加 LLM 调用次数 5×。

### 4. 递归阈值：200 steps

**Decision**: Zone >200 steps 触发递归拆分；Zone ≤200 steps 一次 Zoom 调用。

**Rationale**:
- 200 steps 的 prompt ~12K tokens，输出 ~3-5K chars，在 context window 内安全
- 递归保证了任意规模 session 都能处理——极端情况（全是 Hot Zones）会递归直到每个 sub-zone ≤200 steps
- 递归深度通常为 1 层（session → zones → done），极少数情况 2 层

**Alternative considered**: 固定 150 或 300 steps。Rejected — 200 是 prompt size 和 LLM 调用次数之间的平衡点。

### 5. 路径选择阈值：500 steps

**Decision**: <500 steps 走现有 `runCausalGraphPipeline`（快速路径），≥500 steps 走 `runFocusPipeline`（稳定路径）。

**Rationale**:
- 500 steps 的 session 全量注入 prompt ~25-30K tokens，在大多数模型的 context window 内安全
- 现有管线对于小 session 更快（7 次 LLM 调用且无 Skeleton 构建开销）
- 500 是保守阈值——比实际崩溃点（~1000+ steps）提前切换，留有余量

### 6. Budget Guard 策略：逐级裁剪

**Decision**: 超预算时按优先级逐级裁剪：Cold Zones 统计摘要 → 低 suspicion Hot Zones 降级为摘要 → per-step thought/result 截断 → 最少保留首尾各 5 step。

**Rationale**:
- 信号优先级明确：Hot Zone detail > Cold Zone summary > 无信息
- 逐级裁剪保证了最坏情况下仍有最小可用上下文
- 每一级裁剪都是语义保留的——不会产生语法破损的 prompt

### 7. JSON.parse 保护：统一 safeJsonParse 包装

**Decision**: 所有 eval 模块中的 `JSON.parse(json)` 调用统一替换为 `safeJsonParse(json, stepName, validator)`，失败时返回 null 而非抛异常。

**Rationale**:
- 当前有 7 处 `JSON.parse` 调用分布在 llm.ts 和 extraction.ts，其中 extraction.ts:215 没有 try/catch
- 统一包装消除重复的 try/catch 样板
- 失败时返回 null 允许上层做优雅降级（重试 LLM 调用、跳过该步骤、或返回部分结果）

### 8. 归因粒度：从 CHIFF 症状层扩展到病因层

**Context**: CHIFF 原方案定义了 3 种 FailureMode 分类（loop_issue / data_issue / irrecoverability_issue），dscode 扩展了 taste_drift。这 4 种分类回答的是"错误发生在什么结构位置"——它们描述**症状**，不追问**病因**。

00MQCGO6 实证：15 次 tool error 中大部分是 edit/delete_range 的 hash 匹配歧义，但 CHIFF 规则引擎输出"修复连锁反应"——正确但不可操作。问题不在 CHIFF 的 counterfactual 推理，而在它没有追问"这个 failure 是工具不可靠还是 Agent 判断失误"。

**Decision**: 在 CHIFF 现有 4 种 FailureMode 之上，新增**三层归因分类**，由 LLM 在 Zoom/Synthesize 阶段自主标注。这不是替代 CHIFF rules，而是在 CHIFF 回答"哪个 step 是根因"之后，继续回答"这个 step 为什么失败"。

**三层分类框架**：

| Layer | 维度 | 回答的问题 | 取值 |
|-------|------|-----------|------|
| L1 — 责任归属 | 谁出的错？ | 是工具本身失败了，还是 Agent 判断失误？ | `tool_error` / `agent_error` / `process_error` |
| L2 — 失败类型 | 什么类型的失败？ | 具体是什么机制导致的？ | 见下表 |
| L3 — 传播机制 | 怎么扩散的？ | 错误如何跨 zone 传播？ | CHIFF cascadePath 的 5 种 mechanism（data_contamination 等）|

**L2 失败类型详细分类**：

对 `tool_error`：hash_ambiguity / network_timeout / permission_denied / file_not_found / syntax_error / runtime_error / tool_misuse
对 `agent_error`：misdiagnosis / overcorrection / perception_gap / taste_degraded / scope_creep
对 `process_error`：repair_loop / deadlock / context_overflow

**与 CHIFF 的关系**：L3 直接复用 CHIFF 现有 cascadePath mechanism。L1/L2 是新增维度，由 LLM 在 Zoom candidate 中标注（`errorLayer` + `errorType` 字段），Synthesize 阶段用于推导根因和责任归属。CHIFF 的 Rule 1-4 和 FailureMode（loop_issue 等）保持不变——新字段是**补充**而非替代。

**Signal chain 改进**：除 LLM 层面的分类外，确定性层（skeleton/analyzer）也需保留错误详情：
- `SignalAnchor.label`: 从 `"agent error"` 扩展为 `"agent: 错误摘要前 70 chars"`
- `TimelineEvent.label`: 从 `"Tool error"` 扩展为 `"toolName: error summary"`
- `PhaseInfo` 中 phase 名称若源自 tool error，应包含工具名

**Alternative considered**: 保持 CHIFF 原有 4 种 FailureMode 不变。Rejected — 00MQCGO6 证明症状层归因不可操作，edit hash 歧义和 bash 网络超时需要完全不同的配置改进策略。


## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| LLM 调用次数增加（大 session 从 7 次到 6-9+ 次）→ eval 耗时增加 | Pass 2 架构支持并行（V2）；V1 串行但可通过 maxTokens 避免重试，实际耗时可能因无重试而持平 |
| Skeleton 可能漏掉冷区中的隐藏问题 | Pass 1 Scan 可以看到 Cold Zones 的统计摘要和数据项追踪，LLM 可以从模式中注意到异常；Cold Zones 保留数据项追踪信息 |
| 递归拆分可能无限递归（理论上） | 每次递归 zone size 减小；200 steps 阈值保证在 session 步数的 logN 层内终止 |
| 小 session 快速路径和聚焦路径可能产生不一致的归因结果 | 共享相同的类型系统和规则引擎；两种路径的差异只在于 LLM 看到多少上下文——聚焦路径通常更精准 |
| Budget Guard 裁剪可能丢失关键上下文 | 裁剪是逐级的，保留 Hot Zones 的首尾 steps；极端情况会触发 warn 日志 |
| 归因粒度过粗 — 无法区分"哪个工具"导致错误（如 edit hash 歧义 vs bash 网络超时）| SignalAnchor 保留错误摘要；Zoom candidate 标注 error type；Synthesize reason 强制包含工具名+错误类型 |

## Migration Plan

1. `src/eval/focus/` 作为独立子模块开发，不修改现有代码
2. `src/eval/index.ts` 中添加 `steps.length >= 500` 分支，调用新入口
3. 现有 `runCausalGraphPipeline` 完整保留，零改动
4. 回滚策略：若聚焦管线有问题，将阈值改为 `Infinity` 即可禁用新路径
5. 无需数据迁移——session 存储格式不变，EvalResult 类型不变

## Open Questions
- Pass 2 的 Zone 并行化如何实现？决策：V1 使用 `Promise.allSettled`（async I/O 并发, LLM 调用是纯 I/O-bound, 无需 Worker Threads/Child Processes）。V2 如需 provider rate limit 再加 `p-limit` 信号量。
- 500 steps 的快速路径阈值是否需要从配置读取？决策：V1 硬编码为常量 `FOCUS_PATH_THRESHOLD = 500`。后期如有需要再加环境变量 override。
- FocusAttribution 的 cascadePath 是否需要在 dashboard 中可视化？决策：需要。在 dashboard 中新增级联路径图，展示错误如何跨 zone 传播（见 eval-iterative-focusing spec）。
