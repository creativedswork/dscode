## Context

当前 CHIFF 聚焦管线（`src/eval/focus/`）三 Pass 中，每 Pass 由 TypeScript 构建完整 prompt → `completeSimple` 一次调用 → JSON.parse。这适用于小 session，但随着 session 规模增长，存在根本性局限：LLM 无法主动索取信息，所有数据必须预计算进 prompt。本次改造将管线从"completion API"翻转为"Agent with tools"——LLM 通过文件系统工具自主探索预落盘的分析材料。

约束：
- 不能引入 `subagent-design-proposal` 的 Agent 引擎（尚未实现），需自建轻量 tool loop
- 需兼容现有 `HarnessAPI` / `completeSimple` / `resolveModel` 调用链
- 需保持 `EvalResult` 输出类型不变，dashboard 渲染不变
- 快速路径（<500 steps 的 `runCausalGraphPipeline`）零改动

## Goals / Non-Goals

**Goals:**
- LLM 通过 `read_file`/`grep`/`glob` 工具自主探索 session 分析材料，而非被动消费 TypeScript 预组装的 prompt
- 每个 CHIFF Pass（Scan / Zoom / Synthesize）是独立 Agent 会话，上下文干净
- Pass 间通过 `notebook/*.md` 文件传递分析笔记（Agent 主动读写），而非 orchestrator 传递 JSON 结构体
- 终端/Web 端展示 Phase 进度日志（已完成/进行中/等待中）及 tool call 计数
- Session 分析材料（skeleton, steps, signals, data-items）预落盘为 markdown 文件
- Agent 自主决定何时终止并输出结构化 JSON，`maxToolCalls=30` 作为软限制
- JSON 输出失败时 schema 校验驱动 retry

**Non-Goals:**
- 不改动规则引擎（`analyzer.ts`）和快速路径（`runCausalGraphPipeline`）
- 不引入 function-calling / tool_choice（与现有模式一致）
- 不实现 Agent 并行执行（ZOOM zones 仍串行，V2 可并行）
- 不持久化 Agent 对话历史到 session 存储
- 不修改 HarnessAPI 或 completeSimple 接口
- 不修改 dashboard 生成逻辑

## Decisions

### 1. 工作目录布局

**Decision**: `~/.dscode/eval/{sessionId}/` 三层目录：

```
~/.dscode/eval/00MQCGO6/
├── library/                     ← Pipeline (TS) 写入，Agent 只读
│   ├── README.md                ←   导航页
│   ├── meta.md                  ← session metadata + stats
│   ├── skeleton.md              ← phase map + hot/cold zones 摘要
│   ├── signals.md               ← signal anchors（按类型 + 优先级排序）
│   ├── data-items.md            ← hot data items 完整操作链
│   └── steps/                   ← 步骤分片（按 phase，>150 steps 二次拆分）
│       ├── P1-L000-L145.md
│       ├── P2-L146-L299.md
│       ├── P3-L300-L449.md
│       └── P4-L450-L600.md
├── notebook/                    ← Agent 写入（自由格式 .md 笔记，跨 Pass 传递）
│   ├── scan-notes.md
│   ├── zone-Z1-analysis.md
│   ├── zone-Z2-analysis.md
│   └── synthesis-notes.md
└── output/                      ← Agent 写入（结构化 JSON，schema 校验）
    ├── scan-result.json
    ├── zone-Z1-result.json
    ├── zone-Z2-result.json
    └── attribution.json
```

**Rationale**:
- library/ 是只读原材料，notebook/ 是 Agent 工作记忆，output/ 是结构化契约
- 三区分离让 Agent 不会误写原材料，也让 orchestrator 只解析 output/*.json
- `README.md` 导航页让 Agent 首次进入工作目录时知道探索顺序
- steps/ 按 phase 分片且单文件 ≤150 steps（~20KB），避免单文件过大仍导致上下文问题
- 人类可调试：eval 跑完后整个目录可手动阅读

**Alternative considered**: 单文件 `skeleton.json` + 自定义 tool schema（`getStepRange`, `getZoneDetail` 等）。Rejected — 自定义工具需要额外实现和文档，文件系统工具是 dscode Agent 的天然范式，可复用现有 tool 概念。

### 2. Agent Tool Loop 引擎

**Decision**: 自建轻量 `agentLoop()` 函数，不依赖 `subagent-design-proposal`。

```
agentLoop(config) {
  messages = [system, user]
  loop {
    response = completeSimple(messages)
    if response.toolCalls?.length > 0:
      execute tools, append to messages, emit progress, continue
    else:
      text = extractText(response)
      json = extractJSON(text)
      if validSchema(json): return json
      append "JSON 不合法，请修正" to messages, continue
  }
}
```

**Rationale**:
- subagent-design-proposal 未实现，且其涉及 AsyncLocalStorage、MCP隔离、Fork等复杂机制远超 CHIFF 需求
- CHIFF Agent 的工具范围明确（4 个文件工具）、生命周期短（单 Pass）、无并发
- 自建 30 行核心循环比引入整个 Agent 框架更简单且更可控

**Termination**: Agent 自主决定——当 LLM 不再产生 tool_calls 且输出通过 schema 校验时终止。`maxToolCalls=30` 软限制防死循环，超限后追加 "请立即输出 JSON" 强制要求。

**Tools**: `read_file`（scope: library/ + notebook/ + output/）、`write_file`（scope: notebook/ + output/）、`grep`（scope: library/ + notebook/）、`glob`（scope: library/ + notebook/）。工具 sandbox 通过路径前缀校验实现——拒绝访问 `../` 和 `/` 开头的绝对路径。

### 3. Pass 间信息传递：文件 vs. JSON 结构体

**Decision**: Pass 间通过 `notebook/*.md` 传递分析笔记，而非 orchestrator 传递 JSON 结构体。

**Rationale**:
- 符合"Agent 主动获取信息"的核心理念——Pass 2 Agent 启动时自己 `read_file("notebook/scan-notes.md")`，而不是等待 orchestrator 裁剪喂给它
- Markdown 笔记比 JSON 更易于 LLM 理解和扩展（LLM 擅长读/写 prose）
- 笔记可包含推理过程、证据引用、不确定性标记——这些非结构化信息在 JSON 中难以表达
- Pass 1 的 Agent 决定写什么、写多少——orchestrator 不用猜测 Pass 2 需要什么

**Alternative considered**: 保持当前模式——orchestrator 解析 ScanResult JSON，从中提取关键信息塞进 Pass 2 的 task prompt。Rejected — 即使 JSON 包含所有信息，orchestrator 仍然在"猜 LLM 需要什么"，而且笔记中的推理过程对跨 Pass 理解至关重要。

### 4. Phase 进度展示

**Decision**: `ProgressDisplay` 类，接收 `ProgressEvent` 回调，在终端输出可更新的 Phase 日志。

```
┌─ CHIFF 因果分析 — Session 00MQCGO6 ─────────────────────┐
│                                                          │
│  ██████████████░░░░░░░░░░░░░░░░░░░░  40%                 │
│                                                          │
│  ✓  Phase 0/4: 落盘                       < 0.1s        │
│  ✓  Phase 1/4: SCAN             3.2s · 8 tool calls      │
│  ⠋  Phase 2/4: ZOOM                                      
│     Zone Z1 [313-489]    ⠋  4 tool calls                 
│       最近: read_file("library/steps/P3-L300-L449.md")    
│     Zone Z2 [490-600]    ⏳ 等待中                        
│     Zone Z3 [150-200]    ⏳ 等待中                        
│  ⏳  Phase 3/4: SYNTHESIZE                               
│  ⏳  Phase 4/4: 生成报告                                  
└──────────────────────────────────────────────────────────┘
```

**Rationale**:
- 终端使用 `\r` + ANSI 控制码实现原地更新（单行 spinner + 多行 log）
- Web 端通过 WebSocket push ProgressEvent，前端渲染动态 Phase 面板
- 进度百分比 = completedPhases / totalPhases × 100 + 当前 phase 中 toolCalls / estimatedTotal × phaseWeight

### 5. Agent System Prompt 设计原则

**Decision**: 每个 Pass 有独立的 system prompt，遵循统一结构：

```
1. 角色定义：你是谁，你的任务边界
2. 工作目录说明：library/ 有什么，notebook/ 怎么用，output/ schema
3. 探索策略提示：建议的阅读顺序和工具使用模式
4. 输出格式：严格的 JSON schema（与现有 ValidationResult 对齐）
```

**Rationale**:
- 角色边界明确防止 Agent 越权（SCAN 不应尝试做 ZOOM 的因果推理）
- 探索策略提示是可选的引导，不是强制步骤——Agent 可自由决定探索路径
- 输出 schema 复用现有类型定义（ScanResult, ZoneAnalysis, FocusAttribution），确保向后兼容

### 6. Library 文件渲染

**Decision**: `library/` 文件由 `buildSkeleton` + 新增 `renderLibrary()` 生成，纯 TypeScript 确定性渲染。

- `README.md`: Markdown 导航页，列出目录结构和推荐阅读顺序
- `meta.md`: 键值对格式，question / totalSteps / errorRate / duration / model
- `skeleton.md`: Phase map 表格 + Hot zones (含 zone stats 和前 5 agent) + Cold zones (统计摘要) + 警告/建议
- `signals.md`: 按 `type` 分组（user_complaint / tool_error / screenshot_divergence 等），组内按 `priority` 排序
- `data-items.md`: 按 `operationCount` 排序，hot items 标注 🔥，含完整操作链（step→agent→action 摘要）
- `steps/P*.md`: 每步含 stepId, agent, action(150c), thought(100c), result(200c), isError

**Rationale**: Markdown 是 LLM 最熟悉的格式——无需额外解析指令，`read_file` 后直接理解。结构化字段用表格呈现（如 phase map），叙事性内容用段落（如 README 导航），细节数据用列表（如 signals）。

### 7. 错误处理与降级

**Decision**: 三层降级策略：

| 场景 | 处理 |
|------|------|
| Agent 超过 maxToolCalls | 追加 "请立即输出 JSON" → 再给 5 次 tool call → 仍失败则降级到 JSON 兜底 |
| Agent JSON 不合法 | 追加错误信息 + schema 提示 → 最多 retry 3 次 → 仍失败则降级到空 result |
| Agent tool_call 失败（如文件不存在） | 返回错误文本作为 tool_result，让 Agent 自行决定下一步 |
| Pass 2 某个 Zone 彻底失败 | 跳过该 Zone，Synthesize 时标记 `partialData: true` |
| 整个 Agent 路径失败 | 返回部分 EvalResult + 标注 `agentFailed: true`；不抛异常，保留已完成的 Pass 结果 |
| 工作目录创建失败（权限/磁盘） | 回退到原有 completion API 路径（`runCausalGraphPipeline`） |

**Rationale**: Agent 路径是新的、可能有未知边界的方案。保持多层降级确保不会引入新的崩溃点——最坏情况下返回部分结果，优于什么都不返回。注意：规则引擎已被 `eval-remove-rule-engine` 移除，不再作为降级目标；工作目录创建失败时回退到 completion 快速路径（`runCausalGraphPipeline`）。

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| LLM 调用次数增加（每 Pass 3-15 次 vs 1 次）→ API 成本上升 | 每次 tool call 的 prompt 很小（system + 对话历史），token 成本约 $0.01-0.03/Pass；总成本仍在 $0.05-0.15/eval，可接受 |
| Agent 输出质量不确定（自主探索可能遗漏关键信号）| README.md 提供推荐阅读顺序引导；system prompt 列出必读文件；schema 校验确保输出结构完整 |
| Agent 写的 notebook/*.md 质量参差不齐 | notebook 是 Agent 的工作记忆，不参与最终 EvalResult 组装。质量差只影响 Agent 自己的跨 Pass 理解，人类可读即为 bonus |
| `write_file` 工具可能被 Agent 滥用（写大量垃圾笔记）| 单次 eval 的 notebook/ 总量 <500KB（step 数有限）；output/ 有 JSON schema 约束 |
| `~/.dscode/eval/` 无限增长占用磁盘 | 保留最近 10 个 eval 目录，超出的自动清理 |
| JSON schema 校验可能过于严格拒绝合法但有轻微偏差的输出 | 使用 tolerant parsing（`safeJsonParse` + validator），多余字段忽略，缺失字段用默认值 |

## Migration Plan

1. 新增 `src/eval/focus/agent-loop.ts`、`workspace.ts`、`progress.ts`——独立模块，不影响现有代码
2. 重写 `src/eval/focus/scan.ts`、`zoom.ts`、`synthesize.ts`——改为 Agent 调用
3. 重写 `src/eval/focus/prompts.ts`——改为 Agent system prompt
4. 修改 `src/eval/focus/index.ts`——`runFocusPipeline` 流程更新
5. 现有 completion API 代码保留在 git history 中，如需回退直接 revert
6. 回滚策略：将 `FOCUS_PATH_THRESHOLD` 改为 `Infinity` 禁用 Agent 路径，或 revert 整个 `src/eval/focus/` 到改造前
7. 无需数据迁移——session 存储格式、EvalResult 类型、dashboard 均不变
8. 保留 `eval-recovery-arc` 兼容性——`focus/types.ts` 中的 `RecoveryArc` 类型不变；`focus/synthesize.ts` 重写后仍保留 `validateRecoveryArcs()` 和 recovery arc 逻辑；`focus/prompts.ts` 中 SYNTHESIZE Agent prompt 仍包含 recovery arc 检测指令

## Open Questions

- Agent 工具的 sandbox 是通过路径前缀校验实现还是需要 chroot/jail？V1 使用路径前缀校验——CHIFF Agent 是可信代码内部调用，不需要 OS 级隔离
- 是否需要在 notebook/ 中为每个 Pass 创建独立子目录（如 `notebook/scan/`、`notebook/zoom/`）？当前设计所有 .md 平铺在 notebook/ 下，文件名自带 Pass 标识（`scan-notes.md`, `zone-Z1-analysis.md`），不需要子目录
- Phase 进度在 Web UI 中的展示方式？Web 端通过 WebSocket 推 ProgressEvent，前端组件渲染动态 Phase 面板（类似终端格式但用 HTML/CSS 动画）。具体 UI 设计留给实现阶段
