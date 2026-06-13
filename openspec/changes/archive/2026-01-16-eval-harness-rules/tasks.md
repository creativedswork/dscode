## 1. 规则类型体系

- [x] 1.1 创建 `src/eval/rules/` 目录，新增 `types.ts`：定义 `HarnessRule`、`RulePattern`、`RuleEvidence`、`RuleSuggestion`、`RuleCategory`、`RuleStore` 类型
- [x] 1.2 在 `src/eval/types.ts` 中将 `EvalResult.suggestions: string[]` 替换为 `EvalResult.rules: HarnessRule[]`
- [x] 1.3 创建 `src/eval/rules/taxonomy.ts`：定义预置规则目录（≥15 条规则），每条规则包含 `id`、`category`、`targetLayer`、`abstract`、`pattern`、`suggestion` 模板
- [x] 1.4 将 `RuleCategory` 映射到 `Harness.buildSystemPrompt()` 的每个章节（Identity、Soul、Tool Use、AGENTS.md、Skills）

## 2. 规则检测器实现

- [x] 2.1 创建 `src/eval/rules/detectors.ts`：实现 registry（`registerDetector` / `getDetector`）
- [x] 2.2 实现统计类检测器：`bashFileOpRatio`（bash 中文件操作占比）、`parallelUnderuseRatio`（可并行但串行的调用占比）、`toolErrorRate`（工具错误率）、`searchToolsHitRate`（search_tools 命中率）
- [x] 2.3 实现行为类检测器：`consecutiveFailedEdits`（连续 edit 失败 ≥3 次）、`skillActivationLatency`（skill 激活晚于需求出现）、`bashOnProjectFiles`（bash sed/cat/awk 操作项目文件）
- [x] 2.4 实现结构类检测器：`fileLengthViolation`（write_file 产出 >300 行文件）、`missingSemicolons`（输出文件缺少分号）

## 3. 规则提取引擎（CHIFF Step 7）

- [x] 3.1 创建 `src/eval/rules/extraction.ts`：实现 `extractRules(graphStore, attribution, stats) → HarnessRule[]`
- [x] 3.2 实现 attribution→rule 映射：CHIFF Rule1/2/3/4 分别映射到对应规则 ID
- [x] 3.3 执行所有注册的检测器，收集触发结果
- [x] 3.4 实现规则证据生成（创建 `RuleEvidence` 对象，包含 sessionId、occurrences、sampleSteps）
- [x] 3.5 在 `src/eval/llm.ts` 的 `runCausalGraphPipeline` 末尾调用 Step 7

## 4. 规则存储（CHIFF Step 8）

- [x] 4.1 创建 `src/eval/rules/store.ts`：实现 `loadRuleStore(projectPath)` 和 `saveRuleStore(store)`
- [x] 4.2 实现 `mergeRules(newRules, existingStore) → HarnessRule[]`：按 `id` 匹配，追加 evidence，重算 severity
- [x] 4.3 实现严重度升级逻辑：`SEVERITY_THRESHOLDS = { 1: 0.2, 2: 0.4, 3: 0.6, 4: 0.8, 5: 1.0 }`
- [x] 4.4 在 `src/eval/index.ts` 的 `runEval` 末尾调用 Step 8，保存 merged store

## 5. 移除旧建议系统

- [x] 5.1 从 `src/eval/types.ts` 移除 `suggestions: string[]` 字段
- [x] 5.2 从 `src/eval/analyzer.ts` 移除 `generateSuggestions()` 函数及所有硬编码文案
- [x] 5.3 从 `src/eval/llm.ts` 的 `mergePipelineResults` 中移除 `suggestions` 字段，改为 `rules`

## 6. Dashboard 升级

- [x] 6.1 在 `src/eval/dashboard.ts` 中新增 Harness Rules 渲染函数（按 category 分组，severity 色标，expandable suggestion）
- [x] 6.2 新增 Rule Trends 渲染函数（从 Rule Store 加载，水平柱状图，按 evidence count 排序）
- [x] 6.3 在 summary stat cards 中增加 "Triggered Rules" 计数
- [x] 6.4 移除旧的 suggestions 渲染代码（对应 `dscode-Specific Improvement Suggestions` 段落）

## 7. 测试

- [ ] 7.1 为每个检测器编写单元测试（≥1 触发场景 + ≥1 非触发场景）
- [ ] 7.2 为 `extractRules` 编写测试（mock 因果图 + attribution）
- [ ] 7.3 为 `mergeRules` 编写测试（新规则、已有规则追加、严重度升级、空 store）
- [ ] 7.4 为 `loadRuleStore` / `saveRuleStore` 编写测试（文件不存在、损坏 JSON、正常读写）
- [ ] 7.5 运行 `npm test` 确认所有测试通过
