## Why

`/eval` 的 CHIFF 因果图管线（及 Focus 迭代聚焦管线）目前只归因"哪个工具在哪一步犯了什么错"，不追踪 Agent 从失败到正确的纠正轨迹。这导致评估 dashboard 缺失关键的诊断信息：错误是如何被发现的、如何被纠正的、纠正是否有效、纠正过程中走了多少弯路。对于需要理解 Agent 行为模式的团队，这些恢复轨迹数据是诊断 Agent 配置问题和改进系统提示词的关键输入。

## What Changes

- 在 `Attribution` schema 中新增 `recoveryArcs: RecoveryArc[]` 字段，每个 arc 包含 error→detection→correction 轨迹 + `rootCauseHypothesis`（基于恢复方式反推初始失败原因）
- 在 CHIFF Step 6 的 LLM prompt 中增加 recovery arc 识别指令 + rootCauseHypothesis 推理指令
- 在 Focus Pipeline Pass 3 的 LLM prompt 中同样增加
- 将 `recoveryArcs` 传递给 Step 7（Harness Rule 提取），让恢复模式成为生成 Agent 配置建议的证据
- 在 Dashboard HTML 中新增 "Recovery Timeline" 章节，同时展示 rootCauseHypothesis
- **向后兼容**：`recoveryArcs` 为可选字段，旧逻辑不受影响

## Capabilities

### New Capabilities
- `eval-recovery-arc`: Recovery trajectory tracking — 在 eval 归因中追踪 Agent 从犯错到纠正的完整弧线，包括错误事件、检测事件、纠正事件、纠正有效性评估、误判次数、恢复耗时。

### Modified Capabilities
- `eval-causal-graph`: Step 6 Attribution schema 扩展 `recoveryArcs` + `rootCauseHypothesis` 字段；Step 6 prompt 增加恢复轨迹识别 + 根因反推指令
- `eval-dashboard`: Dashboard 新增 Recovery Timeline 章节渲染（含 rootCauseHypothesis 展示）
- `eval-llm-rule-attribution`: Step 7 接收 recoveryArcs 作为额外证据，从恢复模式中生成 Harness Rules

## Impact

- **Schema**: `src/eval/schemas.ts` (Attribution, 新增 RecoveryArc), `src/eval/types.ts` (EvalResult), `src/eval/focus/types.ts` (FocusAttribution)
- **Pipeline Logic**: `src/eval/llm.ts` (executeStep6, mergePipelineResults, runCausalGraphPipeline), `src/eval/focus/synthesize.ts` (parse + validate), `src/eval/focus/index.ts` (composeEvalResult)
- **Harness Rule Extraction**: `src/eval/rules/extraction.ts` (attributeWithLLM 接收 recoveryArcs), `src/eval/prompts.ts` (buildStep7Prompt 增加 recovery arcs 摘要)
- **Dashboard**: `src/eval/dashboard.ts` (新增 recovery timeline 渲染，含 rootCauseHypothesis 展示)
- **No impact**: `src/eval/analyzer.ts`, `src/eval/graph-store.ts`, `src/eval/rules/`, `src/eval/focus/scan.ts`, `src/eval/focus/zoom.ts`
