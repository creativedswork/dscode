## Context

当前 `/eval` 有两个分析路径：

- **Causal graph pipeline**（`runCausalGraphPipeline`，< 500 步）：6 个 LLM 步骤，无任何进度回调。crash 时只有 `err.message` 显示在 TUI，完整错误信息丢失。
- **Focus pipeline**（`runFocusPipeline`，≥ 500 步）：使用 `ProgressDisplay` 管理 5 个阶段的进度展示。但 `ProgressDisplay` 在传入 `onLog` 回调后设置 `isWebMode = true`，导致：
  - `render()` 变为 no-op（不写终端）
  - spinner 被跳过
  - `onPhaseProgress()`（agent loop 工具调用事件）不调用 `onLog`

两路径共用一个 `try/catch`，crash 时仅调用 `ui.addError(err.message)`，从不写 `eval.log`。

## Goals / Non-Goals

**Goals:**
- `runCausalGraphPipeline` 的每个 LLM step 前后通过 `onLog` 输出进度消息
- `ProgressDisplay.onPhaseProgress` 在 TUI 模式下（有 `onLog` 回调）将工具调用进度通过 `onLog` 输出
- `runEval` catch 块中调用 `logEval("error", ...)` 写入完整 stack trace 和上下文
- 拆分 `isWebMode` 为独立标志：`disableTerminal: boolean` + `onLog`，使 TUI 场景 spinner 和回调可并存
- `onLog` 消息须带节流（至少 500ms 间隔），避免 TUI 因高频 `addInfo` 刷屏

**Non-Goals:**
- 不改变 agent loop 的 `onProgress` 事件机制（已正确发出）
- 不改变 TUI 渲染管线（pi-tui 的 `requestRender` → `process.nextTick` → `doRender` 链路已验证正常）
- 不添加新的 LLM 步骤或分析逻辑

## Decisions

### 1. `onLog` 签名统一为 `(msg: string) => void`

`runEval` 中定义的 `onLog` 同时写 `addInfo` 和 `console.error`。保持此签名，让流水线内部不需要感知 TUI/CLI 差异。

### 2. `runCausalGraphPipeline` 添加 `onLog` 参数

```typescript
export async function runCausalGraphPipeline(
  data: SerializedSession,
  harness: HarnessAPI,
  onLog?: (msg: string) => void,  // 新增
): Promise<EvalResult>
```

每个 step 调用前后输出 `"Step N/6: <step name>..."` 和 `"Step N/6: ✓"`。

### 3. `ProgressDisplay` 拆分 `isWebMode`

当前逻辑：
```typescript
constructor(webMode: boolean = false, onLog?: (text: string) => void) {
    this.isWebMode = webMode || !!onLog;  // ← 耦合
}
```

改为：
```typescript
constructor(options: {
  disableTerminal?: boolean;       // 禁用终端渲染（web 模式）
  onLog?: (text: string) => void;  // TUI 进度回调
  throttleMs?: number;             // onLog 节流间隔，默认 500ms
})
```

内部逻辑：
- `disableTerminal === true` → 不启 spinner，`render()` 为 no-op
- `onLog` 存在 → `onPhaseStart`/`onPhaseDone`/`showCompletion` 调用 `onLog`（已有）；**新增** `onPhaseProgress` 调用 `onLog`（带节流）
- 两者独立，可同时启用

### 4. `onPhaseProgress` 的 `onLog` 输出格式

节流输出 agent loop 事件中的 `detail` 字段，格式为 `"  ⟳ <detail>"`。用 `ProgressEvent.detail` 中已有的描述，不做二次格式化。

节流实现：记录上次 `onLog` 时间戳，若距上次不足 `throttleMs` 则跳过。`onPhaseDone`/`onPhaseStart` 不受节流限制（总是输出）。

### 5. Crash 日志写入

`runEval` catch 块添加：
```typescript
logEval("error", "Pipeline", `crash: ${err instanceof Error ? err.message : String(err)}`);
if (err instanceof Error && err.stack) {
  logEval("error", "Pipeline", `stack:\n${err.stack}`);
}
```

注意：`logEval` 本身已对 `appendFileSync` 做了 try/catch，不存在二次崩溃风险。

## Risks / Trade-offs

- **[风险] TUI 进度消息过多刷屏** → 缓解：`onPhaseProgress` 带 500ms 节流；仅输出 `detail`（通常 ≤ 80 字符）
- **[风险] `ProgressDisplay` 构造函数签名变更** → 缓解：`runFocusPipeline` 是唯一调用方，一并更新
- **[权衡] `onLog` 同时写 TUI 和 stderr** → 对 Web 后端，`console.error` 会被 Web 模式忽略（Web 不连终端），无副作用
