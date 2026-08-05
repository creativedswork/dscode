# Eval 恢复轨迹缺失分析

> **状态**: 已诊断 | **日期**: 2026-06-17 | **影响范围**: eval 全链路

---

## 问题描述

`/eval` 命令在评估会话日志时，不追踪 Agent 从失败到正确的纠正轨迹（Recovery Arc）。归因结果只包含"哪个工具在哪一步犯了什么错"，不包含"在哪里纠正的、纠正是否有效、纠正耗时多久"。

---

## 现有架构

### 两条评估路径

```
session.steps < 500?  ─No──▶  Focus Pipeline (迭代聚焦)
        │                         Scan → Zoom → Synthesize
       Yes                        focus/index.ts
        │
        ▼
  CHIFF Pipeline (因果图)
  6 LLM Steps → 1 root cause
  llm.ts
```

### CHIFF Pipeline（<500 steps）

| Step | 名称 | 产出 |
|------|------|------|
| 1 | Subtask Decomposition | 子任务拆解 |
| 2 | Subtask Edges | 子任务间依赖 + FailureMode |
| 3 | Agent Nodes (OTAR) + Data Flows | 工具调用节点 + 数据流动 |
| 4 | Agent Edges | Agent 间依赖 |
| 5 | Candidate Error Set | ≥5 候选错误 |
| 6 | Counterfactual Attribution | **1 个根因** |

### Focus Pipeline（≥500 steps）

| Pass | 名称 | 产出 |
|------|------|------|
| 1 | Scan | 3-5 Attention Zones |
| 2 | Zoom (per zone) | 每个 Zone 的子图 + candidates |
| 3 | Synthesize | **1 个根因** + cascadePath |

### 归因 Schema

```typescript
// schemas.ts — 当前 Attribution
interface Attribution {
  mistakeAgent: string;    // 犯错工具
  mistakeStep: number;     // 犯错步骤
  reason: string;          // 原因
  rulesApplied: string[];  // 应用的规则
}

// focus/types.ts — 当前 FocusAttribution
interface FocusAttribution {
  mistakeAgent: string;
  mistakeStep: number;
  zoneId: string;
  reason: string;
  rulesApplied: string[];
  cascadePath: CascadeEdge[];       // 错误如何传播到其他 Zone
  alternateRootCauses: AlternateRootCause[];
}
```

---

## 缺失维度

### 1. Recovery Arc（恢复弧线）

当前系统只追踪错误传播（cascadePath），不追踪错误纠正（recoveryPath）。

```
实际发生的事：                    当前 eval 看到的：

Step 5: write_file → 错误CSS      Candidate: dataIssue ❌
Step 6: bash → 测试失败            Candidate: toolError ❌
Step 7: read_file → 重读文件       普通 read_file（无特殊意义）
Step 8: edit → 修复CSS            普通 edit（无特殊意义）
Step 9: bash → 测试通过           普通 bash（无特殊意义）

结果: 归因 = "Step 5 是根因"
缺失: Step 8 是纠正点 / 纠正用时 3 steps / 纠正有效
```

### 2. 所需的 Recovery Arc 结构

```
RecoveryArc {
  errorStep: number;           // 错误发生在哪一步
  errorAgent: string;          // 哪个工具犯错
  detectionStep: number;       // 错误在哪一步被发现（user complaint / tool error / test fail）
  detectionType: "tool_error" | "user_complaint" | "test_failure" | "screenshot_divergence";
  correctionStep: number;      // 纠正发生在哪一步
  correctionAgent: string;     // 哪个工具执行了纠正
  effective: boolean;          // 纠正是否有效
  stepsToRecover: number;      // 从错误到纠正的步数
  misdiagnosisCount: number;   // 中间误判了几次（修了错的东西）
  rootCauseAttribution: string; // 结合恢复上下文的归因解释
}
```

### 3. 缺失的归因洞察

当前归因只能回答：
- ❓ "谁在哪里犯了错？"

应该还能回答：
- ❓ "为什么一开始失败了？"（已支持，但不完整）
- ❓ "怎么发现错误的？"
- ❓ "怎么纠正的？"
- ❓ "纠正正确吗？"
- ❓ "纠正之前走了多少弯路？"
- ❓ "为什么走了弯路？"

---

## 影响面

### 需要修改的文件

| 文件 | 改动类型 | 说明 |
|------|----------|------|
| `src/eval/schemas.ts` | Schema 扩展 | 新增 `RecoveryArc` type；`Attribution` 加 `recoveryArcs[]` |
| `src/eval/prompts.ts` | Prompt 增强 | Step 5/6 prompt 加 recovery arc 识别指令 |
| `src/eval/llm.ts` | 管线逻辑 | `executeStep5/6` 解析 recovery；`mergePipelineResults` 传递 |
| `src/eval/focus/types.ts` | Schema 扩展 | `FocusAttribution` 加 `recoveryArcs` |
| `src/eval/focus/prompts.ts` | Prompt 增强 | Synthesize prompt 加 recovery arc 识别 |
| `src/eval/focus/synthesize.ts` | 解析逻辑 | 解析 recovery arcs 字段 |
| `src/eval/focus/index.ts` | 管线逻辑 | `composeEvalResult` 传递 recovery arcs |
| `src/eval/types.ts` | Schema 扩展 | `EvalResult` 加 `recoveryArcs` |
| `src/eval/dashboard.ts` | UI 渲染 | 新增 Recovery Timeline 章节 |

### 不受影响的文件

- `src/eval/analyzer.ts` — 规则引擎不参与 recovery arc 检测（纯 LLM 能力）
- `src/eval/graph-store.ts` — 图存储不变
- `src/eval/rules/` — 规则提取不变
- `src/eval/focus/scan.ts`, `zoom.ts` — Scan/Zoom 不变（recovery arc 在 Synthesize 层合成）

---

## 设计原则

1. **向后兼容** — `recoveryArcs` 为可选字段，旧 dashboard 不渲染不崩溃
2. **LLM 驱动** — recovery arc 检测完全由 LLM 完成，不引入新的确定性规则
3. **最小改动** — 复用现有 CHIFF pipeline 的 Step 5/6 和 Focus pipeline 的 Synthesize pass，不新增 LLM 调用
4. **Dashboard 优先** — 先让 recovery arc 信息在 dashboard 可见，再考虑其他消费方
