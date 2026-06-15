## Context

dscode 的 eval 系统通过 CHIFF 因果图管线（<500 steps）或 Focus 迭代聚焦管线（≥500 steps）对 session 日志进行根因归因。当前两条管线都输出单一 `Attribution`（mistakeAgent + mistakeStep + reason），只描述"哪里错了"，不描述"怎么纠正的"。

此次变更在已有管线基础上增加 recovery arc 追踪，不引入新的 LLM 调用，不影响现有管线结构。

### 当前数据流

```
CHIFF Pipeline:                      Focus Pipeline:
  Step 1-4: Build causal graph         Pass 1: Scan → AttentionZones
  Step 5: Candidate Error Set          Pass 2: Zoom → ZoneAnalyses
  Step 6: Attribution ← 单点归因       Pass 3: Synthesize → FocusAttribution
       │                                      │
       └────────────┬─────────────────────────┘
                    ▼
              EvalResult
                    │
                    ▼
              Dashboard HTML
```

### 目标数据流（本次变更后）

```
CHIFF Pipeline:                      Focus Pipeline:
  Step 1-5: (unchanged)                Pass 1-2: (unchanged)
  Step 6: Attribution                  Pass 3: Synthesize
       ├ mistakeAgent                        ├ mistakeAgent
       ├ mistakeStep                         ├ mistakeStep
       ├ reason (enriched)                   ├ reason (enriched)
       ├ rulesApplied                        ├ rulesApplied
       └ recoveryArcs[] ← NEW               ├ cascadePath
                    │                         └ recoveryArcs[] ← NEW
                    │                              │
                    ├──────────────────────────────┘
                    │
                    ▼
              Step 7: Rule Attribution
              (receives recoveryArcs
               as additional evidence)
                    │
                    ▼
              EvalResult
                    │
       ┌────────────┼────────────┐
       ▼            ▼            ▼
**Goals:**
- 在 eval 归因中捕获 error→detection→correction 的完整恢复弧线
- 利用恢复轨迹反哺根因归因：通过 "如何被纠正的" 推断 "为什么一开始会失败"
- 将 recoveryArcs 传递给 Step 7（Harness Rule 提取），让恢复模式成为生成 Agent 配置建议的证据
- 在 dashboard 中渲染恢复时间线，**并将每个 recovery arc 与根因假说关联展示**
- 向后兼容，`recoveryArcs` 为可选字段，不影响旧逻辑
- 复用现有 LLM 调用，不新增 LLM 开销

**Non-Goals:**
- 不在规则引擎（analyzer.ts）中实现 recovery arc 检测（规则引擎缺乏语义理解能力）
- 不改变现有 CHIFF Step 1-5 和 Focus Pass 1-2 的逻辑
- 不修改 graph-store 或 rule store 的存储结构
- 不在 recovery arc 中做跨 session 的聚合分析
- 向后兼容，`recoveryArcs` 为可选字段，不影响旧逻辑
- 复用现有 LLM 调用（Step 6 / Synthesize），不新增 LLM 开销

**Non-Goals:**
- 不在规则引擎（analyzer.ts）中实现 recovery arc 检测（规则引擎缺乏语义理解能力）
- 不改变现有 CHIFF Step 1-5 和 Focus Pass 1-2 的逻辑
- 不修改 graph-store 或 rule store
- 不在 recovery arc 中做跨 session 的聚合分析

## Decisions

  correctionAgent: string;      // 执行纠正的工具
  correctionSummary: string;    // 纠正动作简述
  effective: boolean;           // 纠正是否有效
  stepsToRecover: number;       // 从 error 到 correction 的步数
  misdiagnosisCount: number;    // 中间误判次数（修了错的东西）
  rootCauseHypothesis: string;  // 【关键】基于恢复轨迹反推的初始失败根因假说
}
  errorSummary: string;         // 错误简述
  detectionStep: number;        // 错误被发现的步骤
  detectionType: "tool_error" | "user_complaint" | "test_failure" | "screenshot_divergence" | "self_correction";
  correctionStep: number;       // 纠正发生的步骤
  correctionAgent: string;      // 执行纠正的工具
  correctionSummary: string;    // 纠正动作简述
- 字段保持在 11 个以内，不使 LLM 输出过于复杂
- `rootCauseHypothesis` 是连接恢复轨迹和根因归因的桥梁："Agent 之所以在 Step 5 犯错，是因为 X；证据是纠正时不得不先做 Y 才能修复"

**Alternatives considered**:
- 方案 A: 在 `CascadeEdge` 中复用（只加方向标记）→ 语义混淆，cascade 是 error→error 传播，recovery 是 error→correct 恢复
- 方案 B: 在 CandidateStep 中加 recovery 标记 → CandidateStep 表达错误候选，不表达纠正
- 方案 C: rootCauseHypothesis 放在 `Attribution.reason` 中而不在 RecoveryArc 里 → `Attribution.reason` 描述整体根因；RecoveryArc 需要自己的假说来解释"这个特定的错误为什么会发生"，两者粒度不同

**Rationale**: 
- `errorStep`/`detectionStep`/`correctionStep` 三元组形成完整的弧线骨架
- `detectionType` 区分发现机制：工具报错、用户抱怨、测试失败、截图偏离、Agent 自纠
- `effective` 标记纠正质量，这是后续聚合分析的关键字段
- `misdiagnosisCount` 量化"弯路"程度
- 字段保持在 10 个以内，不使 LLM 输出过于复杂

**Alternatives considered**:
- 方案 A: 在 `CascadeEdge` 中复用（只加方向标记）→ 语义混淆，cascade 是 error→error 传播，recovery 是 error→correct 恢复
- 方案 B: 在 CandidateStep 中加 recovery 标记 → CandidateStep 表达错误候选，不表达纠正

### Decision 2: Recovery Arc 检测策略 — LLM 驱动

在 Step 6（CHIFF）和 Synthesize（Focus）的 LLM prompt 中增加 recovery arc 识别指令。LLM 从完整的 session 历史中识别以下模式：

1. **错误定位**: 从 Candidate Error Set 中识别哪些候选错误被后续纠正了
2. **检测点定位**: 找到第一个标志错误被发现的消息（user complaint / tool error / test failure / 用户 screenshot 反馈）
3. **纠正点定位**: 找到第一个使错误被消除或修复的工具调用
4. **有效性评估**: 判断纠正后的结果是否符合预期

**Rationale**: Recovery arc 检测需要语义理解（"这个 edit 是在修复之前的 bug 还是在做新功能"），规则引擎无法可靠判断。复用 Step 6/Synthesize 的 LLM 调用，同时给 LLM 提供完整的 step 历史上下文，让它完成 detection+correction 配对。

### Decision 2.5: rootCauseHypothesis — 从恢复轨迹反推初始失败原因

Step 6 / Synthesize 的 LLM 在识别 recovery arc 后，还必须为每个 arc 输出 `rootCauseHypothesis`：基于"这个错误最终是如何被纠正的"反推"为什么一开始会犯这个错误"。

推理模板：
> Agent 在 Step {errorStep} 犯了 {errorSummary}。纠正方式是在 Step {correctionStep} 通过 {correctionSummary} 完成。由此推断，初始失败的根本原因是：{rootCauseHypothesis}。

示例：
> Agent 在 Step 5 写了错误的 CSS 结构。纠正方式是在 Step 8 通过先 read_file 读取组件结构再 edit 修复完成。由此推断，初始失败的根本原因是：Agent 在 Step 5 时没有先理解目标组件的 DOM 结构就直接写入（write-before-read 模式），而非 CSS 语法知识不足。

**Rationale**: rootCauseHypothesis 是 recovery arc 的核心价值——不是仅仅记录"出错了又修好了"，而是从修复路径中推断出初始错误的本质原因。这个假说直接回答"为什么一开始失败了"，也是后续 Harness Rule 生成的关键输入（例如，从 write-before-read 模式可以生成 "R_READ_BEFORE_WRITE" 规则）。

### Decision 3: Prompt 注入策略 — 最小侵入

在 Step 6 prompt 末尾追加一节 "RECOVERY ARC DETECTION" 指令。在 Synthesize prompt 末尾追加同样指令。不改变 prompt 的主体结构。

输出格式：
```json
{
  // ... existing fields ...
  "recoveryArcs": [
    {
      "errorStep": 5,
      "errorAgent": "write_file",
      "errorSummary": "Wrote incorrect CSS structure",
      "detectionStep": 6,
      "detectionType": "test_failure",
      "correctionStep": 8,
      "correctionAgent": "edit",
      "correctionSummary": "Fixed CSS selector to match component",
在 Dashboard 中 Causal Graph 和 Rule Reasoning Chain 之间，新增 "Recovery Timeline" 章节。每个 recovery arc 渲染为一条水平时间轴，**同时展示 rootCauseHypothesis**：

```
🔴 Error (Step 5)  ──→  🔍 Detected (Step 6)  ──→  ✅ Fixed (Step 8)
write_file: 错误CSS      bash: test failed         edit: 修复CSS
                         test_failure              3 steps, 0 misdiagnoses

💡 根因假说: Agent 在 Step 5 没有先理解 DOM 结构就直接写入（write-before-read 模式）
```

**Rationale**: 时间轴展示"发生了什么"，rootCauseHypothesis 展示"为什么会发生"——两者结合才算完整的恢复轨迹分析。

### Decision 6: Recovery Arc → Harness Rule 传递（Step 7 集成）

`recoveryArcs` 作为 Step 7（LLM autonomous rule attribution）的额外输入。在构建 Step 7 prompt 时，将 recovery arcs 的摘要追加到 CHIFF 上下文中：

```
RECOVERY ARCS:
- Arc 1: error=write_file@Step5, detected by test_failure@Step6, corrected by edit@Step8, effective=true, misdiagnosis=0
  Root cause hypothesis: Agent didn't read component structure before writing (write-before-read pattern)
- Arc 2: ...
```

Step 7 的 LLM 可以从 recovery patterns 中识别出 Agent 配置层面的问题：
- `misdiagnosisCount >= 2` → 建议 "R_SHOTGUN_DEBUGGING: add 'diagnose before fix' to Tool Use Rules"
- `detectionType === "user_complaint"` → 建议 "R_USER_FEEDBACK_LOOP: strengthen perception/taste self-check in Agent workflow"
- `rootCauseHypothesis` 包含 "didn't read" → 建议 "R_READ_BEFORE_WRITE: require read_file before write_file for unfamiliar files"

**影响**: 需要修改 `buildStep7Prompt()` 和 `attributeWithLLM()` 以接收 `recoveryArcs` 参数。在 Focus 路径中，`composeEvalResult()` 需要传递 recoveryArcs 到 Step 7。

### Decision 4: Dashboard 渲染 — Recovery Timeline 章节

在 Dashboard 中 Causal Graph 和 Rule Reasoning Chain 之间，新增 "Recovery Timeline" 章节。每个 recovery arc 渲染为一条水平时间轴：

```
🔴 Error (Step 5)  ──→  🔍 Detected (Step 6)  ──→  ✅ Fixed (Step 8)
write_file: 错误CSS      bash: test failed         edit: 修复CSS
                         test_failure              3 steps, 0 misdiagnoses
```

**Rationale**: 时间轴是最直观的可视化方式。GMail/DevOps 风格：红色=错误，黄色=检测，绿色=修复。

## Risks / Trade-offs

- **[LLM 幻觉]**: LLM 可能把不相关的 edit 标记为 correction，或给出不准确的 rootCauseHypothesis → Mitigation: 验证 `correctionStep >= errorStep`，`stepsToRecover > 0`；不正确的 recovery arc 在 dashboard 上不会造成功能性错误，只是噪音；rootCauseHypothesis 的准确性依赖 LLM 质量，标注为"假说"而非定论
- **[Token 增加]**: recoveryArcs 的 prompt 指令约 +400 tokens（含 rootCauseHypothesis 推理和 Step 7 集成），输出约 +300 tokens/arc → 可接受范围内
- **[向前兼容]**: 旧版生成的 dashboard HTML 不包含 recovery timeline → 无影响；Step 7 在 recoveryArcs 缺失时降级为现有行为

## Open Questions

- 后续是否需要基于 recovery arc 做跨 session 聚合（例如 "最常见的纠正模式"、"最常见的初始失败原因"）？→ 暂不在此变更范围内
- 是否需要 `detectionType: "self_correction"` 的细化（Agent 自我反思 vs 外部反馈触发）？→ 当前 LLM prompt 已覆盖，后续可迭代
- `rootCauseHypothesis` 是否需要后续通过 RAG 检索已有 Harness Rules 来验证一致性？→ 暂不在此变更范围
