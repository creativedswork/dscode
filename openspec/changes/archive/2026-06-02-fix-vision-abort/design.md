## Context

当前视觉模型再处理流程：用户提交图片 → `Harness.promptWithImages()` → `ImagePipeline.process()` (阻塞) → `agent.prompt()`。`agent.abort()` 只 abort `agent.prompt()` 内部的 active run。由于 pipeline 在 agent run 启动前同步阻塞执行，abort 信号无法触达 vision/OCR 调用。

`streamSimple` 的 `SimpleStreamOptions` 已支持 `signal?: AbortSignal`，`AbortController` 是标准 Web API，无需额外依赖。

## Goals / Non-Goals

**Goals:**
- 用户按 Esc/停止按钮时，正在进行的 vision model API 调用立即中断
- 用户按 Esc/停止按钮时，正在进行的 OCR 识别立即中断
- `harness.abort()` 同时覆盖 vision 预处理和 agent 循环两个阶段
- 不影响正常完成路径的行为和返回值

**Non-Goals:**
- 不修改 `@mariozechner/pi-agent-core` 的 Agent 内部逻辑
- 不修改 Tesseract.js 的 worker 池管理策略（仅增加 abort 时 terminate）
- 不改变 vision pipeline 的 fallback 链逻辑（vision → OCR → error）
- 不改变 MCP 工具结果中的图像处理路径

## Decisions

### D1: 双层 AbortController 设计

```
┌──────────────────────────────────────────────────────────┐
│ harness.promptWithImages()                                │
│                                                           │
│  ┌─ visionAbortController = new AbortController()      ┐  │
│  │                                                      │  │
│  │  imagePipeline.process(images, text, {               │  │
│  │    signal: visionAbortController.signal              │  │
│  │  })                                                   │  │
│  │       │                                               │  │
│  │       ├─ describeImagesViaVisionModel(               │  │
│  │       │     images, model, key, signal)              │  │
│  │       │     └─ streamSimple(model, ctx, {            │  │
│  │       │          signal, ...                          │  │
│  │       │        })                                     │  │
│  │       │                                               │  │
│  │       └─ ocrImages(images, signal)                   │  │
│  │            └─ signal.addEventListener("abort",        │  │
│  │               () => worker.terminate())               │  │
│  │                                                      │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                           │
│  agent.prompt(enrichedText)  ← agent 内部有自己的        │
│                                  abortController          │
└──────────────────────────────────────────────────────────┘

harness.abort()
  ├─ visionAbortController.abort()   ← 中断 pipeline
  └─ agent.abort()                   ← 中断 agent loop
```

**Rationale**: pipeline 在 agent run 外部执行，无法复用 `agent.signal`（此时为 undefined）。需要独立的 AbortController，由 `harness.abort()` 统一触发。

**Alternative considered**: 让 pipeline 内部创建 AbortController 并通过某种方式暴露给外部 → 太复杂，接口不直观。由调用方（harness）创建是最自然的模式。

### D2: ProcessOptions.signal 接口

在 `ProcessOptions` 中增加可选 `signal?: AbortSignal`，pipeline 内部不再创建自己的 AbortController，而是透传外部信号。

**Rationale**: pipeline 是纯函数式模块，不应拥有生命周期管理职责。AbortController 的创建和生命周期由调用方（Harness / MCPManager）管理。

**Alternative considered**: pipeline 内部创建 AbortController 并返回 abort 函数 → 不符合单一职责原则，且多调用方场景下状态管理复杂。

### D3: OCR abort 策略

OCR 通过 `signal.addEventListener("abort", handler)` 触发 `worker.terminate()`。terminate 后下次 OCR 调用会重新 `createWorker`。

**Rationale**: Tesseract.js 的 `worker.recognize()` 不原生支持 AbortSignal。`terminate()` 是唯一的中断方式，worker 会被销毁，下次使用时重新创建，符合现有 lazy-init 模式。

**Risk**: `terminate()` 后再创建 worker 有约 1-2s 的冷启动开销。但 abort 场景本身就是用户主动中断，下次图片处理时重新创建是可接受的。

### D4: Harness.abort() 统一入口

`Harness` 新增 `abort()` 方法，同时调用 `visionAbortController.abort()` 和 `agent.abort()`。UI 层（TUI / Web backend）改为调用 `harness.abort()`。

**Rationale**: UI 层不应感知 abort 的内部实现细节（是 abort agent 还是 vision pipeline）。Harness 作为协调层自然承担此职责。

**Migration**: TUI (`tui-app.ts` L214/366/666) 和 Web (`web-backend.ts` L386) 将 `this.harness.agent.abort()` / `this.deps.agent.abort()` 改为 `this.harness.abort()` / `this.deps.harness.abort()`。

## Risks / Trade-offs

| Risk | Mitigation |
|------|-----------|
| `streamSimple` 在接收到 abort 信号后的行为依赖 pi-ai 实现 | pi-ai proxy.js 已正确处理 `AbortSignal`: 检查 `signal.aborted`、注册 `abort` 事件、调用 `reader.cancel()` |
| OCR `worker.terminate()` 可能导致正在排队的其他 OCR 任务失败 | OCR 目前无并发调用场景（pipeline 串行执行），风险低；即使发生，下次调用会自动重新 createWorker |
| `AbortError` 可能在 pipeline 内部被误判为 vision 失败而触发 OCR fallback | `describeImagesViaVisionModel` 中显式 catch `AbortError`，重新 throw 而非 fallback 到 OCR |
| Harness.abort() 在 agent loop 未运行时调用（即仅在 vision 阶段 abort），`agent.abort()` 是无害的空操作 | 在 `agent.abort()` 调用前加 `try/catch` 或直接检查 `agent.activeRun`，但当前实现 `agent.abort()` 内部已经用 `?.` 安全处理了 null case |

## Open Questions

- 无。所有技术决策已明确。
