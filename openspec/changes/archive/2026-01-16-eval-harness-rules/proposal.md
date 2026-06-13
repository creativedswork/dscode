## Why

当前 `/eval` 是一个"验尸报告"——它分析单个 session 中发生了什么错误，产出的是与该 session 绑定的具体建议（如 "Agent 在修复问题时引入了新问题，建议…"）。这些建议是 case-by-case 的，不可复用、不可跨 session 追踪、不可积累为系统性的配置优化知识。dscode 的 Agent 配置（system prompt 各层、工具描述、skill 激活策略、classify 策略）需要的是一个能从每个 session 中抽象出**可复用规则**的 harness，使 eval 成为持续优化 Agent 本身的引擎，而非仅针对单次失败的诊断工具。

## What Changes

- `/eval` 命令保持，在其分析管道中增加 **规则抽象层**：CHIFF pipeline 的 Step 6（根因归因）之后，增加 Step 7（规则抽象）和 Step 8（规则去重与合并），从因果图中提取出与具体 session 解耦的 `HarnessRule`
- 新增 **规则分类法（Rule Taxonomy）**：将所有可检测的规则按 dscode Agent 配置层分类——Identity/Soul、Tool Use Rules、Tool Registry、AGENTS.md、Skills——每条规则映射到具体的配置段落
- 新增 **跨 session 规则存储（Rule Store）**：`~/.dscode/eval/rules.json`，每条规则积累来自多个 session 的证据，当 `evidence_count >= 5` 时升级为建议持久化到配置
- 规则由**模板化检测器**生成（确定性、可复现），少数需要 LLM 判断的规则标注 `needs_llm: true`
- Dashboard 增加规则累积趋势视图：session 级分析 + 跨 session 规则热度/趋势

## Capabilities

### New Capabilities
- `harness-rule-taxonomy`: 规则分类法——将所有可检测的 Agent 配置问题映射到 System Prompt、Tool Registry、Skills 等层的结构化规则定义，每条规则包含抽象的触发模式、检测器、严重度和建议模板
- `harness-rule-extraction`: 规则提取引擎——从 CHIFF causal graph + attribution 中抽象出 HarnessRule，将具体的 session 事件（如 "write_file at step 12 caused fix cascade"）去具体化为可复用规则（如 "consecutive failed edits → revert guidance missing in Tool Use layer"）
- `harness-rule-store`: 跨 session 规则持久化——存储规则及其证据积累，支持规则去重、合并、严重度升级（evidence_count 阈值：1=INFO, 3=WARN, 5=ERROR），输出可操作的配置修改建议

### Modified Capabilities
- `eval-causal-graph`: CHIFF pipeline 在 Step 6 之后新增 Step 7（规则抽象）和 Step 8（规则去重与合并），EvalResult 中 `suggestions: string[]` 替换为 `rules: HarnessRule[]`
- `eval-dashboard`: Dashboard 增加规则累积趋势视图，展示跨 session 的规则热度、严重度变化、建议的配置修改 diff

## Impact

- `src/eval/types.ts`: EvalResult.suggestions 替换为 EvalResult.rules，新增 HarnessRule、RulePattern、RuleEvidence、RuleSuggestion 类型
- `src/eval/analyzer.ts`: 移除硬编码的 suggestion 字符串，改为调用 rule extraction 引擎
- `src/eval/llm.ts`: 在 runCausalGraphPipeline 末尾增加 Step 7/8
- `src/eval/prompts.ts`: 新增 Step 7/8 的 prompt 模板（可选，用于 needs_llm 规则）
- `src/eval/dashboard.ts`: 新增规则累积趋势视图
- 新增 `src/eval/rules/` 目录：taxonomy.ts, extraction.ts, store.ts
- `~/.dscode/eval/rules.json`: 新增跨 session 规则存储文件
- 不影响 Harness API、slash command 接口、session 存储格式
