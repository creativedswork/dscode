## Why

当前 CHIFF 因果分析管线将 LLM 视为 **completion API**——每次调用由 TypeScript 代码预计算完整 prompt，LLM 被动消费后返回 JSON。这导致：(1) prompt 构建器必须猜测 LLM 需要什么数据，造成信息冗余或遗漏；(2) 中间分析产物全部堆在 LLM 上下文窗口中，随 tool call 累计而膨胀；(3) LLM 无法跨 Pass 自主回溯或深入追问。需要将架构从"代码决定 LLM 看什么"翻转为"LLM 主动用工具探索数据"，用文件系统做 Agent 的工作记忆，实现真正的自主因果分析。

## What Changes

- **新增 Agent Tool Loop 引擎**：轻量 `while (!done) { call LLM; execute tools }` 循环，Agent 自主决定何时终止并输出结构化 JSON。每个 CHIFF Pass（Scan / Zoom / Synthesize）是独立的 Agent 会话。
- **新增 CHIFF 工作目录体系**：`~/.dscode/eval/{sessionId}/library/` 预落盘 session 分析材料（skeleton、steps、signals、data-items），Agent 通过 `read_file`/`grep`/`glob` 探索；`notebook/` 供 Agent 写入分析笔记；`output/` 供 Agent 写入结构化 JSON 结果。
- **三个 Agent Pass 替代现有三 Pass 的 completion 调用**：Pass 1 SCAN Agent 探索 library/ 识别 attention zones；Pass 2 ZOOM Agent 深潜各 zone 构建因果子图；Pass 3 SYNTHESIZE Agent 跨 zone 归因。
- **Phase 日志 + 进度条**：在终端会话窗口中展示阶段进度（Phase 0/3 落盘 → Phase 1/3 SCAN → Phase 2/3 ZOOM-Z1,Z2... → Phase 3/3 SYNTHESIZE）及实时 tool call 详情。
- **移除旧 prompt 构建器**：`focus/prompts.ts` 中 `buildScanPrompt`/`buildZoomPrompt`/`buildSynthesizePrompt` 替换为 Agent system prompt + task prompt；`scan.ts`/`zoom.ts`/`synthesize.ts` 中的 `callLLM → completeSimple` 单次调用替换为 Agent loop。
- **保留快速路径**：<500 steps 的 session 继续使用 `runCausalGraphPipeline`，仅 ≥500 steps 走新 Agent 路径。

## Capabilities

### New Capabilities

- `chiff-agent-loop`: 轻量 Agent 循环引擎，LLM 自主决定何时输出。支持 tool_call → tool_result → 继续思考 → 最终 JSON 的完整循环，带 soft limit 防死循环、schema 校验驱动 retry、进度回调。
- `chiff-workspace`: 工作目录生成器，将 SessionSkeleton + HistoryStep 数据渲染为 markdown 文件落盘到 `~/.dscode/eval/{sessionId}/library/`，包含 README 导航页、meta、skeleton、signals、data-items、按 phase 分片的 step 详情。
- `chiff-progress-display`: 终端进度展示，显示 Phase 日志（已完成/进行中/等待中）、tool call 计数和最近操作描述、进度百分比。

### Modified Capabilities

- `eval-causal-graph`: 归因管线从"completion API 三 Pass"变为"Agent 三 Pass"。外部接口不变（`runFocusPipeline` 仍返回 `EvalResult`），但内部执行方式从"TypeScript 构建 prompt → LLM 一次调用"变为"落盘 library → spawn Agent → 读取 output/*.json → 组装结果"。规则引擎（Pass 0 / analyzer.ts）保持不变。Dashboard 生成不变。

## Impact

- `src/eval/focus/` — 新增 `agent-loop.ts`（Agent 循环引擎）、`workspace.ts`（工作目录落盘）、`progress.ts`（进度展示）；重写 `scan.ts`、`zoom.ts`、`synthesize.ts`（从 completion 调用改为 Agent 调用）；重写 `prompts.ts`（从 prompt 模板改为 Agent system prompt + task prompt）；保留 `skeleton.ts`、`budget-guard.ts`、`types.ts`
- `src/eval/focus/index.ts` — `runFocusPipeline` 流程从 `buildSkeleton → scanSession → zoomZone → synthesize` 变为 `buildSkeleton + writeWorkspace → runAgent(SCAN) → runAgent(ZOOM × N) → runAgent(SYNTHESIZE) → composeEvalResult`
- `src/eval/llm.ts` — 不受影响（快速路径保留）
- `src/eval/index.ts` — 不受影响（路径选择逻辑不变）
- `~/.dscode/eval/` — 新增运行时工作目录，存放每次 eval 的 library/notebook/output/
