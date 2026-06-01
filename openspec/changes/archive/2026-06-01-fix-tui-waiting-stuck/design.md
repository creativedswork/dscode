## Context

TUI 使用 `CancellableLoader` 显示 "Waiting..." 加载器，其 elapsed time 基于 `lastActivityTime` 计算。`lastActivityTime` 仅在 `textDelta`、`toolStart`、`toolEnd` 事件中通过 `markActivity()` 更新，**不包括** `thinkingDelta`。

当模型进入思考/推理阶段（例如 DeepSeek-R1 的 extended thinking），会产生大量 `thinking_delta` 事件但不产生 `text_delta`，导致 "Waiting..." 计时器持续增长数分钟，用户误以为系统卡死。实际上模型正在正常推理。

Web UI 不受影响：其 elapsed time 直接基于 `turnStartRef`（从提交到结束的总用时），不区分活动/等待阶段。

## Goals / Non-Goals

**Goals:**
- `thinkingDelta` 事件到达时重置 `lastActivityTime`，使 "Waiting..." 计时器正确反映真实空闲时间
- 与 `textDelta`、`toolStart`、`toolEnd` 的行为保持一致

**Non-Goals:**
- 不改变 Web UI 的行为
- 不引入新的超时或重试机制
- 不改变 harness、agent 事件系统、或 UI backend 接口

## Decisions

**方案**: 在 `TuiApp.thinkingDelta()` 中添加 `this.markActivity()` 调用

这是最小、最直接的修复方式。`markActivity()` 仅设置 `this.lastActivityTime = Date.now()`，无副作用。

**备选方案考虑过**:
- 将 elapsed time 改为从 turn 开始计算（与 Web UI 一致）→ 会失去"区分活动/空闲"的能力，且改动范围更大
- 在 harness 的 `bindEvents` 中处理 → TuiApp 已有 `thinkingDelta` 方法作为 hook 点，无需绕路

## Risks / Trade-offs

- **[风险] thinkingDelta 过于频繁** → 如果模型每 80ms 产出一个 thinking token，计时器会被频繁重置，几乎不显示等待时间。**缓解**: 这恰好是期望行为 — 模型正在活跃产生内容，不应该显示 "Waiting..."。
- **[风险] 工具调用执行期间的等待仍可能很长** → 工具调用（如 bash）可能持续数分钟，期间不会有任何 delta 事件。**缓解**: 这是真实等待，应被准确报告。未来可考虑工具级超时。
