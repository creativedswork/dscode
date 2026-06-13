## Why

当前 `eval-harness-rules` 在 CHIFF pipeline 的 Step 7-8 引入了确定性规则系统（预置规则目录、统计检测器、硬编码 CHIFF→Rule 映射、template 化 suggestion），与 Steps 1-6 对 LLM 判断力的信任形成架构断层。LLM 在 Step 6 已完成反事实归因，有能力直接从因果图中识别 Agent 配置缺陷——却被一个正则表达式查找表接替。更根本的是：硬编码检测器只能验证已知假设，而 LLM 能发现设计者未曾预料的配置问题。2025 年的模型在语义理解、归因推理、自由文本生成上已足够成熟，整个规则层应交由 LLM 自主决策、自主归因。

## What Changes

- **移除**确定性规则检测器系统：删除 `src/eval/rules/detectors.ts` 中的 detector registry 和所有统计/行为/结构检测器函数
- **移除**预置规则目录：删除 `src/eval/rules/taxonomy.ts` 中的 `RULE_CATALOG`（15+ 条预置规则）、`CHIFF_TO_HARNESS` 映射表、`TOOL_TO_RULE` 映射表、硬编码 suggestion 模板
- **移除** `HarnessRule.pattern` 字段——不再需要检测器类型、阈值、参数；规则由 LLM 自由生成，不依赖预定义触发条件
- **移除** `HarnessRule.needsLlm` 字段——所有规则均由 LLM 生成，不再区分 "需要 LLM" 和 "不需要 LLM" 的规则
- **Step 7 重构为 LLM Rule Attribution**：将完整 CHIFF 分析上下文（subtasks、因果图、data flows、candidate set、attribution）及 session 关键片段喂给 LLM，由 LLM 自主识别 Agent 配置问题、自主命名规则、自主撰写建议
- **Step 8 重构为 LLM Semantic Merge**：新规则与已有 Rule Store 的合并不再按 `id` 精确匹配，而是由 LLM 做语义匹配判断——"这两条规则描述的是同一个配置问题吗？"
- **Rule Store 结构简化**：`HarnessRule` 不再包含 `pattern`、`needsLlm`，新增 `mergedFrom?: string[]` 追踪合并来源

## Capabilities

### New Capabilities
- `eval-llm-rule-attribution`: LLM 自主规则归因——替代 CHIFF Step 7 的确定性规则提取，LLM 基于完整因果图和分析上下文，自主发现 Agent 配置缺陷并生成结构化规则
- `eval-semantic-rule-merge`: LLM 语义规则合并——替代 CHIFF Step 8 的确定性 ID 匹配合并，LLM 判断新旧规则是否为同一问题的不同表述，决定合并还是新增

### Modified Capabilities
- `eval-causal-graph`: Step 7 从 "deterministic rule extraction via detector registry + CHIFF mapping" 改为 "LLM autonomous rule attribution from full causal graph context"。Step 8 从 "deterministic rule merge by id" 改为 "LLM semantic rule merge"。EvalResult.rules 从预置目录 rule 变为 LLM 自由生成的 rule
- `eval-dashboard`: Harness Rules 展示不再依赖预置 `RuleCategory` 分组和 `RulePattern.type` 标识，适配 LLM 自由生成的规则结构。Rule Trends 展示适配语义合并后的 cross-session 规则

### Removed Capabilities
- `harness-rule-taxonomy`: 移除预置规则目录及 Category→Layer 映射
- `harness-rule-extraction`: 移除确定性检测器注册表和 CHIFF→Rule 硬编码映射
- `harness-rule-store`: 规则合并逻辑从 ID 匹配改为 LLM 语义匹配（合并到 `eval-semantic-rule-merge`）

## Impact

- **BREAKING**: `src/eval/rules/types.ts` — `HarnessRule` 移除 `pattern`、`needsLlm`，新增 `mergedFrom?: string[]`、`rawDescription: string`
- **BREAKING**: `src/eval/rules/taxonomy.ts` — **删除**
- **BREAKING**: `src/eval/rules/detectors.ts` — **删除**
- **BREAKING**: `src/eval/rules/extraction.ts` — 重写为 LLM-based `attributeWithLLM()`
- **BREAKING**: `src/eval/rules/store.ts` — `mergeRules()` 重写为 LLM-based `semanticMerge()`
- **BREAKING**: `src/eval/types.ts` — `EvalResult.rules` 类型变化
- `src/eval/llm.ts` — Step 7/8 改为调用 LLM-based 函数
- `src/eval/prompts.ts` — 新增 Step 7/8 的 LLM prompt 模板
- `src/eval/schemas.ts` — 新增 LLM rule attribution 和 semantic merge 的 JSON schema
- `src/eval/dashboard.ts` — 适配新规则结构
- `~/.dscode/eval/rules.json` — store 内 rule 结构变化，需兼容旧格式
