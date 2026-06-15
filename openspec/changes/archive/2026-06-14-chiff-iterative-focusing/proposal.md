## Why

CHIFF causal graph pipeline 对大 session（>500 steps，如 00MQCGO6 的 1.8MB / 11K 行）崩溃，原因是每步 LLM 调用全量注入 session 历史 → prompt 膨胀超出 context window → LLM 输出截断 → `JSON.parse` 抛 `Unterminated string in JSON`。同时 `JSON.parse` 缺乏 try/catch 保护，错误直接传播到用户界面。需要将 pipeline 从"全量一 pass"改造为"迭代聚焦三 pass"，保证任意规模 session 都能稳定完成归因。

## What Changes

- **SessionSkeleton 构建器**：新增确定性骨架构建，将规则引擎输出（phases, signals, deviations）转换为 5-10KB 的结构化骨架，替代全量 HistoryStep[] 作为 LLM 输入
- **三 Pass 迭代聚焦管线**：Pass 1 Scan（粗扫识别 3-5 个可疑区）→ Pass 2 Zoom（per-zone 因果子图深潜，可并行，支持递归）→ Pass 3 Synthesize（跨 zone 根因归因 + 级联路径）
- **Budget Guard**：prompt 构建层硬限制（≤60K chars），逐级裁剪低信号内容
- **JSON.parse 异常保护**：所有 LLM 响应解析统一包装 try/catch + 优雅降级
- **LLM 调用 maxTokens**：所有 eval LLM 调用传入 maxTokens 参数，防止输出截断
- **小 session 快速路径**：<500 steps 的 session 保持现有 7-step 管线不变，保证低延迟

## Capabilities

### New Capabilities

- `session-skeleton`: 确定性（无 LLM）的 session 骨架构建器。输入规则引擎的 phases/signals/deviations/stats，输出结构化的 SessionSkeleton（metadata, phase map, signal anchors, hot/cold zones, data item tracker），大小控制在 5-10KB。
- `eval-iterative-focusing`: 三 Pass 迭代聚焦管线，替代原 7-step 管线用于大 session（≥500 steps）。Pass 1 粗扫识别可疑区，Pass 2 逐区深潜构建因果子图（支持并行 + 递归拆分），Pass 3 跨区综合归因 + 级联路径。
- `eval-budget-guard`: Prompt 构建层硬限制。在每步 LLM 调用的 prompt builder 中植入 Budget Guard，确保 prompt ≤60K chars。超预算时按信号优先级逐级裁剪（cold zones → low-suspicion hot zones → per-step thought/result 截断）。

### Modified Capabilities

- `eval-causal-graph`: 归因模式从"全量 7-step 串行"扩展为"规模自适应"——<500 steps 走原管线（快速），≥500 steps 走迭代聚焦管线（稳定）。核心 CHIFF 概念（Subtask, AgentNode, SubtaskEdge, CandidateSet, Attribution）全部保留，但在 Pass 2 中 per-zone 生成、Pass 3 中跨 zone 合成。
- `eval-llm-rule-attribution`: Step 7 的 LLM 规则提取输入从"全量 session 上下文"改为"聚焦后的问题区域上下文 + 归因结果"，减少 prompt 大小同时保持分析质量。

## Impact

- `src/eval/focus/` — 新增 7 个文件（types, skeleton, scan, zoom, synthesize, prompts, budget-guard）
- `src/eval/llm.ts` — 新增 `runFocusPipeline()` 入口，`callLLM` 添加 maxTokens；保留 `runCausalGraphPipeline()` 作为快速路径
- `src/eval/index.ts` — `runEval` 增加路径选择逻辑
- `src/eval/rules/extraction.ts` — `attributeWithLLM` 中 JSON.parse 加 try/catch
- `src/eval/prompts.ts` — `extractJSON` 保留不变，新增 focus 相关 prompt 模板
- `src/eval/graph-store.ts` — 保持不变（Zone 内复用）
- `src/eval/schemas.ts` — 保持不变（HistoryStep, Subtask, AgentNode 等全部复用）
- `src/eval/analyzer.ts` — 保持不变（规则引擎，Pass 0）
- 无 Breaking changes：现有 7-step 管线完整保留作为 <500 steps 的快速路径
