# CHIFF 迭代聚焦 — 大 Session 归因技术方案

> 问题：`/eval 00MQCGO6` → `Unterminated string in JSON at position 2350`
> 根因：1.8MB / 11,136 行 session 全量注入 LLM → prompt 膨胀 → 输出截断 → JSON 破损
> 目标：任意规模 session 都能稳定完成因果图归因，不崩溃，不降级到纯规则引擎

---

## 一、方案总览

| 编号 | 方案项 | 层级 | 优先级 | 预期收益 | 实施成本 |
|------|--------|------|--------|----------|----------|
| P1 | SessionSkeleton 构建器 | 数据层 | P0 | 将 session 压缩为 5-10KB 骨架，消除 prompt 膨胀 | 中 |
| P2 | 三 Pass 迭代聚焦管线 | 架构层 | P0 | 任意规模 session 稳定归因，不崩溃 | 高 |
| P3 | Budget Guard 硬限制 | 防御层 | P1 | 极端情况下兜底，防止单次调用超出 context window | 低 |
| P4 | JSON.parse 异常保护 | 防御层 | P0 | 消除 crash，改为优雅降级 | 低 |
| P5 | 小 session 快速路径 | 优化层 | P1 | <500 steps 的 session 保持低延迟（复用现有管线） | 低 |

---

## 二、核心思想

### 2.1 问题本质

```
                        当前 CHIFF（一 pass 全量）

  Session (1.8MB)
       │
       ▼
  parseSessionToSteps() → HistoryStep[] (数百~数千步)
       │
       ├─ Step 1 LLM: "这是全部步骤，请分解"
       ├─ Step 2 LLM: "这是全部步骤，请找依赖"
       ├─ Step 3 LLM: "这是全部步骤，请画数据流"
       ├─ Step 4 LLM: "这是全部步骤+agent，请连边"
       ├─ Step 5 LLM: "这是全部步骤+图谱，请找候选"
       ├─ Step 6 LLM: "这是全部步骤+候选，请归因"
       └─ Step 7 LLM: "这是全部上下文，请提规则"

  每步 prompt >100K tokens → LLM 输出截断 → JSON.parse 💥
```

**核心矛盾**：每步 LLM 调用都把全部历史灌进去，但 LLM 并不需要全部信息来做每一步的判断。Step 1 只需要知道有几个阶段，不需要每步的详细 thought/result。

### 2.2 解决思路：渐进聚焦

```
                    迭代聚焦（三 Pass 渐进）

  Session (任意大小)
       │
       ▼
  buildSkeleton() ─── 确定性构建，无 LLM ─── SessionSkeleton (5-10KB)
       │
       ├─ Pass 1 SCAN:  "应该仔细看哪里？"  → AttentionZone[] (3-5 个)
       │    输入: Skeleton    输出: 可疑区列表
       │    prompt ~4K tokens
       │
       ├─ Pass 2 ZOOM:   "每个区发生了什么？" → ZoneAnalysis[] (并行)
       │    输入: Zone 内的 Step 详情 (≤200 steps)
       │    输出: 每 zone 的因果子图
       │    prompt ~12K tokens/zone
       │    ⚠ Zone 仍 >200 steps → 递归 Scan→Zoom
       │
       └─ Pass 3 SYNTH:  "跨区根因是什么？"  → FocusAttribution
            输入: Scan 结果 + 所有 ZoneAnalysis
            输出: 根因 + 级联路径 + HarnessRule[]
            prompt ~10K tokens
```

**关键洞察**：不是把数据量变小，而是把 LLM 的注意力聚焦。每一步都在预算内，每一步只拿到它需要的信息。

---

## 三、Pass 0：SessionSkeleton 构建

### 3.1 职责

将规则引擎的确定性输出（phases, signals, deviations, rootCauses, stats）转换为 LLM 友好的骨架结构。**无 LLM 调用，纯 TypeScript。**

### 3.2 骨架结构

```
SessionSkeleton (~5-10KB)
├── METADATA: question, totalSteps, errorRate, duration, model
├── PHASE MAP (from rule engine phases[])
│   P1 [0-145]: "Initial exploration" — ok, 23 calls
│   P2 [146-312]: "Building system" — warn, 3 errors
│   P3 [313-489]: "User complaint: 水面不对" — danger ⚠
│   P4 [490-600]: "Repair loop" — danger ⚠
├── SIGNAL ANCHORS (规则引擎信号点)
│   Step  89: 💬 User: "完全不对"
│   Step 156: ❌ Tool error: write_file
│   Step 312: 📸 Screenshot — Jaccard 0.85
│   Step 313: 💬 User: "水面材质还是不对，我要镜面"
├── HOT ZONES (信号密集 — 保留逐步骤详情)
│   Zone A: Steps 300-360 (complaint cluster, 60 steps, kept in full)
│   Zone B: Steps 480-530 (repair cascade, 50 steps, kept in full)
├── COLD ZONES (信号稀疏 — 仅统计摘要)
│   Steps 0-145: 23 calls (read_file×12, grep×8, ...), 0 errors
│   Steps 146-299: 67 calls, 3 errors
│   Steps 600-700: 18 calls, 0 errors, wrap-up
└── DATA ITEM TRACKER
    src/shaders/water.frag: 12 modifications, Steps 150→320→480→520
    src/shaders/sky.frag: 8 modifications, Steps 100→200→400
```

### 3.3 构建算法

```
function buildSkeleton(steps: HistoryStep[], ruleResult: EvalResult): SessionSkeleton

  1. METADATA: 从 ruleResult.metadata + stats 提取
  2. PHASE MAP: 从 ruleResult.phases 映射
  3. SIGNAL ANCHORS: 遍历 messages，标记:
     - 用户投诉 (isUserComplaint)
     - 工具错误 (isToolResultError)
     - 截图偏差 (deviations)
     - 阶段边界 (phase transitions)
  4. HOT ZONES: 合并重叠的信号锚点相邻区域 (±5 steps)
     - 保留: stepId, agent, action, thought(100c), result(200c), isError
  5. COLD ZONES: 信号锚点之间的区域
     - 仅保留: step range, tool count by name, error count
  6. DATA ITEM TRACKER: 遍历 steps 提取被多次操作的文件/资产路径
```

---

## 四、Pass 1：SCAN（粗扫）

### 4.1 职责

输入 Skeleton，输出 3-5 个需要深潜的 AttentionZone。**1 次 LLM 调用，prompt <5K tokens。**

### 4.2 System Prompt 要点

```
你是 dscode session 的"注意力引导器"。
你的任务：扫描 session 骨架，找出最值得深入分析的 3-5 个区域。

判断标准（按优先级）：
1. 用户投诉集中区 — 用户反复纠正 agent，说明 agent 偏离了意图
2. 修复循环区 — 同一文件/工具被反复调用，说明陷入了 trial-and-error
3. 不可逆决策区 — 某步操作后下游全部基于错误输出运行
4. 感知盲区 — 截图显示问题但 thinking 未察觉
5. 创意漂移 — 输出变得通用/模板化，偏离了原始创作方向
6. 错误突发区 — 短时间内多个工具报错

输出：按 suspicionScore 降序排列的 AttentionZone[]。
每个 zone 必须指定 stepStart/stepEnd（全局步骤号）。
```

### 4.3 输出类型

```typescript
interface AttentionZone {
  id: string;                    // "Z1", "Z2", ...
  stepStart: number;
  stepEnd: number;
  suspicionScore: number;        // 0.0-1.0
  primarySignal: string;         // "user_complaint_cluster" | "error_burst" |
                                 // "repair_loop" | "screenshot_divergence" |
                                 // "irreversible_action" | "taste_drift"
  summary: string;
  keyAgents: string[];
  keyDataItems: string[];
}

interface ScanResult {
  zones: AttentionZone[];        // 按 suspicionScore 降序
  globalAssessment: string;
  noIssuesDetected: boolean;     // true → 跳过 Pass 2/3, 用规则引擎结果
}
```

---

## 五、Pass 2：ZOOM（深潜）

### 5.1 职责

在每个 AttentionZone 内构建完整因果子图。**每 Zone 1 次 LLM 调用，可并行。每 Zone 限制 ≤200 steps（超过则递归）。**

### 5.2 Zone 内分析内容

一次 LLM 调用完成（替代原始 Step 1-5 的 per-zone 版本）：

```
Zone 内任务（单次 LLM 调用）:
  1. 将该 Zone 分解为 2-4 个子任务（zone 内的阶段）
  2. 标记子任务间的数据依赖边
  3. 提取 agent 节点（OTAR）和步骤间数据流
  4. 标记 agent 间依赖边
  5. 找出 ≥3 个候选错误步骤，按 impactScore 排序
```

### 5.3 递归机制

```
function zoomZone(zone: AttentionZone, allSteps: HistoryStep[]): ZoneAnalysis

  zoneSteps = allSteps.slice(zone.stepStart - 10, zone.stepEnd + 10)  // 带上下文窗口

  if zoneSteps.length <= 200:
    return callZoomLLM(zoneSteps)   // 一次 LLM 调用

  else:
    // 递归: 对该 Zone 构建 mini-Skeleton，再 Scan
    miniSkeleton = buildMiniSkeleton(zoneSteps)
    subZones = scanMini(miniSkeleton)
    subAnalyses = subZones.map(sz => zoomZone(sz, zoneSteps))
    return mergeSubAnalyses(subAnalyses)
```

### 5.4 输出类型

```typescript
interface ZoneAnalysis {
  zoneId: string;
  subtasks: ZoneSubtask[];       // zone 内的子任务
  subtaskEdges: SubtaskEdge[];   // 复用现有类型
  agentNodes: AgentNode[];       // 复用现有类型
  agentEdges: AgentEdge[];       // 复用现有类型
  stepDataFlows: StepDataFlow[]; // 复用现有类型
  candidates: ZoneCandidate[];   // ≥3 个候选
  topCandidate: {
    stepId: number;
    agent: string;
    impactScore: number;
    reason: string;
  };
  zoneGraphComplete: boolean;
}
```

---

## 六、Pass 3：SYNTHESIZE（综合归因）

### 6.1 职责

跨 Zone 确定根因 + 级联效应 + 提取配置层规则。**1-2 次 LLM 调用。**

### 6.2 综合归因（替代原始 Step 6）

```
输入: ScanResult + ZoneAnalysis[]
任务: 跨 Zone 应用反事实推理规则，确定单一根本原因

关键判断:
  - Rule 2 (Data Flow): 错误数据从哪个 zone 的哪一步开始流动的？
  - Rule 3 (Irrecoverable): 哪个 zone 的哪一步是不可逆的？
  - Rule 4 (Taste): 创意方向在哪个 zone 开始漂移的？

输出: FocusAttribution
  - mistakeAgent / mistakeStep / zoneId
  - cascadePath[] ← 新: 展示错误如何跨 zone 传播
  - alternateRootCauses[] ← 新: 备选根因（如果有歧义）
```

### 6.3 级联路径（新能力）

```typescript
interface CascadeEdge {
  fromZoneId: string;
  fromStepId: number;
  toZoneId: string;
  toStepId: number;
  dataItem: string;
  mechanism: "data_contamination" | "irreversible_lock_in" |
            "perception_blind_spot" | "repair_cascade" |
            "taste_drift_propagation";
}
```

级联路径让归因不仅是"哪一步错了"，而是"错误如何从一个决策传播到整个 session"——这对理解 dscode 这种创意+技术混合场景中的失败模式至关重要。

### 6.4 规则提取（替代原始 Step 7）

输入 FocusAttribution + ZoneAnalysis[] + ConfigExcerpts，输出 HarnessRule[]。逻辑与现有 `attributeWithLLM` 一致，但输入更聚焦（只包含有问题区域的上下文，而非全量 session）。

### 6.5 输出类型

```typescript
interface FocusAttribution {
  mistakeAgent: string;
  mistakeStep: number;
  zoneId: string;
  reason: string;
  rulesApplied: string[];
  cascadePath: CascadeEdge[];
  alternateRootCauses: {
    stepId: number;
    agent: string;
    reason: string;
    confidence: number;
  }[];
}

interface FocusReport {
  scan: ScanResult;
  zoneAnalyses: ZoneAnalysis[];
  attribution: FocusAttribution;
  rules: HarnessRule[];
}
```

---

## 七、Budget Guard（防御层）

### 7.1 职责

在所有 LLM 调用的 prompt 构建层面加硬限制，确保即使极端情况（全是 Hot Zones、递归深度异常）也不会超出 context window。

### 7.2 策略

```
class PromptBudgetGuard {
  MAX_PROMPT_CHARS = 60000;  // ~15K tokens

  enforce(prompt: string, context: TrimContext): string {
    if (prompt.length <= MAX_PROMPT_CHARS) return prompt;

    // 逐级裁剪（从低信号到高信号）:
    // 1. Cold Zones 统计摘要 → 进一步压缩
    // 2. Hot Zones 中 suspicion 最低的 → 降级为统计摘要
    // 3. 单个 step 的 thought/result → 截断到更短
    // 4. 最少保留的 Hot Zone 中至少保留首尾各 5 个 step

    while (prompt.length > MAX_PROMPT_CHARS) {
      prompt = trimLowestPriorityContent(prompt, context);
    }
    return prompt;
  }
}
```

---

## 八、小 Session 快速路径

### 8.1 策略

```
function analyzeWithLLM(data, harness):
  steps = parseSessionToSteps(data)

  if steps.length < 500:
    return runCausalGraphPipeline(data, harness)  // 现有 7-step 管线, 更快

  else:
    return runFocusPipeline(data, harness)         // 迭代聚焦管线, 更稳
```

小 session 全量注入不会超出 context window，保持低延迟。大 session 走聚焦路径，牺牲一点延迟换稳定性。

---

## 九、LLM 调用对比

```
Session 规模          当前 CHIFF        迭代聚焦
─────────────────────────────────────────────────
<500 steps (小)       7 次调用          7 次调用 (快速路径, 不变)
500-2000 steps (中)   7 次调用 (可能💥)  5-7 次调用
2000-5000 steps (大)  7 次调用 (💥)      6-9 次调用 (部分并行)
5000+ steps (超大)    7 次调用 (💥)      7-12 次调用 (含递归)

每次调用 prompt 均 ≤15K tokens（Budget Guard 保证）
Pass 2 中多个 Zone 可并行执行
```

---

## 十、防御修复

### 10.1 JSON.parse 保护

所有 `JSON.parse(json)` 调用统一包装：

```typescript
function safeJsonParse<T>(json: string, stepName: string, validator: (p: unknown) => ValidationResult<T>): T | null {
  try {
    const parsed = JSON.parse(json);
    const result = validator(parsed);
    if (result.ok) return result.value;
    console.warn(`[${stepName}] validation: ${result.errors.join("; ")}`);
    return null;
  } catch (err) {
    console.warn(`[${stepName}] JSON parse: ${(err as Error).message}`);
    return null;
  }
}
```

### 10.2 LLM 调用 maxTokens

所有 eval LLM 调用传入 `maxTokens`：

```typescript
// 当前
completeSimple(model, context, { apiKey: ... })

// 修改后
completeSimple(model, context, {
  apiKey: ...,
  maxTokens: stepMaxTokens[stepName],  // Pass1: 4096, Zoom: 8192, Synth: 6144
})
```

---

## 十一、文件变更清单

### 新增文件

```
src/eval/focus/
  types.ts          — FocusReport, AttentionZone, ZoneAnalysis, FocusAttribution 等
  skeleton.ts       — buildSkeleton(): 规则引擎结果 → SessionSkeleton
  scan.ts           — scanSession(): Pass 1 实现
  zoom.ts           — zoomZone(): Pass 2 实现（含递归拆分）
  synthesize.ts     — synthesize(): Pass 3 实现
  prompts.ts        — SCAN_SYSTEM, ZOOM_SYSTEM, SYNTH_SYSTEM prompt 模板
  budget-guard.ts   — PromptBudgetGuard 硬限制
```

### 修改文件

```
src/eval/index.ts   — runEval 调用路径选择（<500 steps → 原管线, ≥500 → focus 管线）
src/eval/llm.ts     — 新增 runFocusPipeline() 主入口
                      保留 runCausalGraphPipeline() 作为快速路径
                      callLLM 添加 maxTokens 参数
src/eval/prompts.ts — extractJSON 保留不变
src/eval/rules/
  extraction.ts     — JSON.parse 加 try/catch 保护
```

### 不变文件

```
src/eval/analyzer.ts      — 规则引擎完整保留
src/eval/graph-store.ts   — Zone 内仍用 CausalGraphStore
src/eval/schemas.ts       — HistoryStep, Subtask, AgentNode 等全部复用
src/eval/rules/store.ts   — 规则持久化不变
src/eval/dashboard.ts     — 可视化适配 FocusReport → EvalResult
```

---

## 十二、与原始 CHIFF 步骤的映射

```
原始 7-Step                      迭代聚焦 3-Pass

Step 0: parseSessionToSteps  ─▶ Pass 0: buildSkeleton (确定性)
Step 1: subtask decomposition ─▶ Pass 1 Scan: 全局可疑区识别
Step 2: subtask edges          │   (粗粒度)
Step 3: agent nodes + flows   ─▶ Pass 2 Zoom: per-zone 因果子图
Step 4: agent edges            │   (细粒度, 仅可疑区)
Step 5: candidate error set   ─▶ Pass 2 Zoom: 每 zone candidates
                                 Pass 3 Synth: cross-zone merge
Step 6: counterfactual attr   ─▶ Pass 3 Synth: FocusAttribution
Step 7: rule attribution      ─▶ Pass 3: rules (不变)
Step 8: semantic merge         │   (不变)
```
