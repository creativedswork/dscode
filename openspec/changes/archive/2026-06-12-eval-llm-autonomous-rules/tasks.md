## 1. 类型系统重构

- [x] 1.1 简化 `src/eval/rules/types.ts` 中的 `HarnessRule`: 移除 `pattern: RulePattern`、`needsLlm?: boolean`，新增 `rawDescription: string`、`mergedFrom?: string[]`，`category` 扩展为 `RuleCategory | "other"`
- [x] 1.2 移除 `RulePattern` 接口、`DetectorContext` 接口、`DetectorFn` 类型
- [x] 1.3 新增 `HarnessRuleOutput` Zod schema（LLM Step 7 输出验证用）: id, category, targetLayer, abstract, rawDescription, severity, suggestion
- [x] 1.4 新增 `MergeDecision` 类型和 Zod schema（LLM Step 8 输出验证用）: newRuleId, decision, targetRuleId?, reasoning
- [x] 1.5 保留 `RuleEvidence`、`RuleSuggestion`、`RuleStore`、`SEVERITY_THRESHOLDS`、`computeSeverity()`、`severityLabel()`、`RuleCategory`、`CATEGORY_LABELS`

## 2. 移除确定性规则系统

- [x] 2.1 删除 `src/eval/rules/detectors.ts` 及其所有内容（detector registry + 所有检测器函数）
- [x] 2.2 删除 `src/eval/rules/taxonomy.ts` 及其所有内容（`RULE_CATALOG`、`CHIFF_TO_HARNESS`、`TOOL_TO_RULE`、`CATEGORY_LAYER_MAP`、`getRuleById`、`getRuleIds`）
- [x] 2.3 从 `src/eval/types.ts` 清理对 `taxonomy.ts` 和 `detectors.ts` 的导出引用
- [x] 2.4 更新 `src/eval/analyzer.ts`：移除旧的 `generateSuggestions()` 调用（若还存在），确认 analyzer 不再引用 rules 模块

## 3. Step 7 — LLM 自主规则归因

- [x] 3.1 重写 `src/eval/rules/extraction.ts`：新建 `attributeWithLLM()` 函数，接收 CHIFF 上下文（graphStore, attribution, steps, stats, meta）、session 数据、Harness API
- [x] 3.2 构建 Step 7 prompt（在 `src/eval/prompts.ts` 新增 `buildStep7Prompt()`）：包含 subtasks 摘要、causal graph 关键路径、data flows 异常项、top-5 候选错误、attribution 结论、session 关键片段（mistake_step 前后 5 步）、当前 Agent 配置摘录
- [x] 3.3 实现 Step 7 LLM 调用、JSON 解析、Zod 验证、重试逻辑（最多 2 次，失败返回空数组）
- [x] 3.4 在 `src/eval/llm.ts` 的 `runCausalGraphPipeline` 中将 Step 7 调用从 `extractRules()` 改为 `attributeWithLLM()`
- [x] 3.5 在 rule-engine fallback 分支中同样调用 `attributeWithLLM()`，但传入简化上下文（无 causal graph、无 attribution）

## 4. Step 8 — LLM 语义规则合并

- [x] 4.1 重写 `src/eval/rules/store.ts` 中的合并逻辑：新建 `semanticMerge()` 函数，接收新规则、已有 RuleStore、Harness API
- [x] 4.2 构建 Step 8 prompt（在 `src/eval/prompts.ts` 新增 `buildStep8Prompt()`）：新规则列表（无 evidence）、已有规则摘要（id + abstract + evidence_count）
- [x] 4.3 实现 Step 8 LLM 调用、JSON 解析、Zod 验证、重试逻辑（最多 2 次，失败则全部新增不合并）
- [x] 4.4 实现合并执行逻辑：对 "merge" 决策追加 evidence 到目标规则、更新 mergedFrom、重算 severity；对 "new" 决策直接添加
- [x] 4.5 在 `src/eval/index.ts` 的 `runEval` 中将 `mergeRules()` 调用改为 `semanticMerge()`
- [x] 4.6 处理边界：空 store 跳过 Step 8 LLM 调用、空 new rules 跳过 Step 8、部分合并决策覆盖不全时警告并处理

## 5. Rule Store 兼容

- [x] 5.1 在 `loadRuleStore()` 中添加旧格式兼容：反序列化时检测并移除 `pattern`、`needsLlm` 字段，缺失的 `rawDescription` 用 `abstract` 填充，缺失的 `mergedFrom` 设为 `undefined`
- [x] 5.2 `saveRuleStore()` 写入新格式（无 `pattern`、`needsLlm`）

## 6. Dashboard 适配

- [x] 6.1 更新 Harness Rules 渲染函数：按 `category` 分组（包含 "other"），显示 `rawDescription`（可折叠）、`mergedFrom` 合并链
- [x] 6.2 移除对 `pattern.type` 的引用（不再显示 "statistical"/"behavioral"/"structural" 标签）
- [x] 6.3 更新 Rule Trends 渲染函数：适配新 rule 结构，显示合并链指示器
- [x] 6.4 移除对 `taxonomy.ts` 的任何导入（`RULE_CATALOG`、`CATEGORY_LAYER_MAP`）
- [x] 6.5 移除旧的 `dscode-Specific Improvement Suggestions` 渲染代码（如果还有残留）

## 7. Prompt 和 Schema 基础设施

- [x] 7.1 在 `src/eval/schemas.ts` 中新增 `validateHarnessRuleOutput` Zod schema（验证 Step 7 的 LLM 输出）
- [x] 7.2 新增 `validateMergeDecisions` Zod schema（验证 Step 8 的 LLM 输出）
- [x] 7.3 新增 Step 7 的 system prompt 常量 `RULE_ATTRIBUTION_SYSTEM` — 定义 "dscode Agent 配置审计专家" 的角色
- [x] 7.4 新增 Step 8 的 system prompt 常量 `RULE_MERGE_SYSTEM` — 定义语义匹配规则

## 8. 集成和清理

- [x] 8.1 更新 `src/eval/index.ts` 中的导出（`loadRuleStore`、`saveRuleStore`、`semanticMerge`、`getHighSeverityRules` 等）
- [x] 8.2 确保 `runEval` 在生成 dashboard 前调用 `semanticMerge` 并保存 store
- [x] 8.3 移除 `src/eval/rules/extraction.ts` 中所有旧的 `extractRules`、`extractAttributionRules`、`extractDetectorRules`、`gatherSampleSteps`、`buildDetectorContext` 函数
- [x] 8.4 移除 `src/eval/rules/store.ts` 中旧的 `mergeRules` 函数（被 `semanticMerge` 替代）

## 9. 测试

- [ ] 9.1 为 `validateHarnessRuleOutput` schema 编写测试（有效输出、缺失字段、无效 category）
- [ ] 9.2 为 `validateMergeDecisions` schema 编写测试（有效合并/新增决策、缺失字段）
- [ ] 9.3 为旧格式 Rule Store 兼容性编写测试（带 pattern 字段的旧 rule → 加载后移除）
- [ ] 9.4 为 `semanticMerge` fallback 编写测试（LLM 调用失败 → 全部新增）
- [ ] 9.5 为 `attributeWithLLM` fallback 编写测试（LLM 调用失败 → 空规则列表）
- [ ] 9.6 运行 `npm test` 确认所有测试通过
