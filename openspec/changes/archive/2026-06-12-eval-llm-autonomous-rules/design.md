## Context

当前 `eval-harness-rules` 在 CHIFF pipeline 的 Steps 1-6 中完全信任 LLM 的判断力（子任务分解、因果图构建、反事实归因），但在 Steps 7-8 突然切换为确定性规则系统——预置 15 条规则的目录、统计检测器注册表、硬编码 CHIFF→Rule 映射、template 化 suggestion 文案。这在架构上形成了一个智力断层。

更根本的问题是：硬编码检测器只能验证**已知假设**（bash 用多了？file 超过 300 行了？连续 edit 失败了？），而 LLM 有能力从完整的因果图和分析上下文中发现**设计者未曾预料的配置缺陷**——例如 "Soul 段落的 'taste over clutter' 被 Agent 误解为 'minimalist everything'" 或 "AGENTS.md 的编码规范与 Skill 指令存在语义冲突"。

本设计将整个规则层交给 LLM：Step 7 由 LLM 基于完整因果图自主发现规则并归因，Step 8 由 LLM 做语义匹配合并跨 session 证据。

## Goals / Non-Goals

**Goals:**
- 移除所有确定性规则组件：detector registry、预置规则目录、CHIFF→Rule 硬编码映射、template suggestion
- Step 7 改为 LLM 自主规则归因：LLM 接收完整 CHIFF 上下文，自主识别 Agent 配置问题
- Step 8 改为 LLM 语义合并：LLM 判断新旧规则是否为同一问题，决定合并或新增
- 简化 HarnessRule 类型：移除 `pattern`、`needsLlm`，保留 LLM 自由生成的字段
- 保持 `/eval` 命令接口不变，保持 Rule Store 本地 JSON 存储不变

**Non-Goals:**
- 不改变 CHIFF Steps 1-6 的 LLM pipeline（这些已经工作良好）
- 不改变 Rule Store 的持久化位置（`~/.dscode/eval/rules.json`）
- 不引入自动修改 Agent 配置的能力（规则建议仍需人工审核）
- 不改变 session 存储格式或 Harness API

## Decisions

### Decision 1: 规则由 LLM 自主生成，移除所有确定性检测器

**选择**: 删除 `detectors.ts`（detector registry + 所有统计/行为/结构检测器函数）和 `taxonomy.ts`（预置规则目录 + suggestion 模板）。Step 7 由一个 LLM 调用完成：输入完整 CHIFF 上下文（subtasks、因果图 snapshot、data flows、candidate set、attribution）加 session 关键片段，LLM 自主输出 `HarnessRule[]`。

**理由**:
- LLM 在 Step 6 已完成反事实归因——它理解 "为什么出错"。要求 LLM 进一步回答 "Agent 配置哪里需要改" 是自然的推理延伸，不需要正则表达式接手
- 硬编码检测器的覆盖范围永远落后于 LLM 的语义理解范围。bash 用了 sed 是 easy case，但 "Soul 段落表述模糊导致 Agent 行为不一致" 才是真正需要改造 System Prompt 的发现
- 2025 年的模型在推理成本（token 价格、延迟）上已足够成熟，一次额外 LLM 调用的成本远低于维护 15+ 检测器 + 模板的工程成本
- 单一来源：所有规则来自同一个 LLM，避免了 "前半段 LLM 分析 + 后半段正则匹配" 的语义断裂

**需要保留的部分**:
- `RuleStore` 的 `loadRuleStore()` / `saveRuleStore()` 保留——这是纯文件 I/O，与 LLM 无关
- `computeSeverity()` 保留——证据计数到 severity 的映射是纯数学
- `RuleCategory` 枚举保留——LLM 自主选择 category，但 category 本身作为 Agent 配置层的结构化标签仍有价值

### Decision 2: 跨 session 合并由 LLM 做语义匹配

**选择**: Step 8 不再按 `rule.id` 精确匹配合并。而是将新规则列表 + 已有规则列表喂给 LLM，由 LLM 输出匹配合并决策：`{ match: true, targetId: "R_X" }` 或 `{ match: false }`。

**理由**:
- LLM 自主命名的 rule ID 在不同 session 间必然不一致（Session A 命名为 `R_WRITE_BEFORE_READ`，Session B 命名为 `R_FILE_OVERWRITE_WITHOUT_VALIDATION`），精确匹配不可行
- 语义匹配本身就是 LLM 的强项——"这两条规则描述的是同一个 Agent 配置问题吗？"
- 匹配合并后，保留最早的 rule ID 和 description，新增 `mergedFrom` 追踪合并来源

**替代方案**: 用 embedding + cosine similarity 做语义匹配 — 部分可行但增加了 embedding 模型依赖。LLM 直接判断更准确且不需要额外基础设施。

### Decision 3: HarnessRule 类型简化

**选择**: 
- 移除 `pattern: RulePattern` — 不再需要检测器类型、阈值、参数
- 移除 `needsLlm?: boolean` — 所有规则均由 LLM 生成
- `abstract` 保留，由 LLM 自由撰写
- `suggestion.current` 仍由 extraction 阶段从 System Prompt 中读取后填入，其余字段由 LLM 自主撰写
- 新增 `mergedFrom?: string[]` — 追踪跨 session 合并来源
- 新增 `rawDescription: string` — LLM 的原始描述，用于 dashboard 展示和语义匹配

**RuleCategory 保留但由 LLM 选择**:
LLM 输出规则时选择一个 category（`identity` | `tool_use` | `tool_registry` | `agents_md` | `skill`），这为 dashboard 分组提供了结构。但 LLM 也可以输出 `category: "other"` 表示这个问题跨越多层或不属于现有分类。

### Decision 4: LLM 调用的 prompt 结构

**Step 7 prompt 包含**:
1. System prompt: 简短定义 "你是一个 dscode Agent 配置审计专家"
2. CHIFF 分析摘要：subtasks 概览、因果图关键路径、data flows 中 correctness 异常项、candidate set 中 top-5 问题、attribution 结论
3. Session 关键片段：attribution 指向的 mistake step 周边 5 步的 thought/action/result
4. 当前 Agent 配置：Identity、Soul、Tool Use Rules、AGENTS.md 的关键段落
5. 输出要求：JSON 格式的 `HarnessRule[]`，每条包含 id、category、abstract、suggestion、severity（LLM 自主评估 0.0-1.0）、rawDescription

**Step 8 prompt 包含**:
1. 新规则列表（完整 HarnessRule JSON，不含 evidence）
2. 已有规则摘要（id + abstract + category + evidence_count）
3. 输出要求：每条新规则匹配到已有规则的决策 `{ newRuleId, decision: "merge"|"new", targetId?: string, reasoning: string }`

### Decision 5: 结构化输出与 validation

LLM 输出经过 Zod schema 验证（`validateHarnessRules`、`validateMergeDecisions`）。如果 JSON 解析失败或 schema 验证失败，重试一次。两次失败后，Step 7 返回空规则（不阻塞 pipeline），Step 8 返回原始新规则（不合并，全部新增）。

### Decision 6: Step 7 在 rule-engine fallback 时仍执行

当 CHIFF Steps 1-6 fallback 到 rule-engine 时，Step 7 仍然执行——但输入中缺少因果图和 attribution。此时 LLM 仅基于 session 统计数据和关键片段自主判断。输出质量可能低于完整 CHIFF 输入，但优于完全不生成规则。

## Risks / Trade-offs

**Risk**: LLM 在不同 run 对同一 session 产出不同规则
→ **Mitigation**: 这是 feature 而非 bug——不同视角可能发现不同问题。Rule Store 的语义合并会自然聚合重复发现。需要一致性时，用户可以在 dashboard 中对比多次 eval 的结果

**Risk**: LLM 过度生成规则（把每个 minor issue 都变成一条规则）
→ **Mitigation**: prompt 中明确要求 "只输出严重度 ≥ 0.4 的规则，minor issues 合并到更高级别规则中"。LLM 自主评估的 severity 会由跨 session 证据计数进一步调整

**Risk**: 语义合并误匹配（把两个不同问题的规则合并了）
→ **Mitigation**: LLM 的合并决策包含 `reasoning` 字段，dashboard 中展示合并推理。用户可以手动审核。误合并的后果是 evidence 被聚合到错误规则——但规则本身只是建议，不会自动修改配置

**Risk**: LLM 调用失败导致无规则产出
→ **Mitigation**: Step 7/8 失败不阻塞 eval pipeline。fallback 返回空规则或未合并的新规则。rule store 的 load/save 不受影响

**Risk**: token 成本增加（每次 eval 多 1-2 次 LLM 调用）
→ **Mitigation**: Step 7 的 context 经过压缩（causal graph 用 snapshot 精简版，关键片段只取 5 步），预计 token 消耗约 Step 5-6 的 50-70%。Step 8 只需规则摘要列表，token 消耗很低
